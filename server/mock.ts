import type { GenerateSuccess, ModelInfo } from "./openrouter.js";

/**
 * OPENROUTER_MOCK=true 时的内置响应，用于离线验证全流程：
 * - 默认模型：返回一段合法 JSON（覆盖结构化/非结构化场景）
 * - 模型 ID 包含特定关键字时触发错误/异常场景：
 *   badjson / err401(无效 Key) / err402(余额) / err429(限流) / errtimeout(超时) / errnetwork
 */

const mockModels: ModelInfo[] = [
  {
    id: "mock/structured-model",
    name: "Mock 结构化模型",
    description: "支持 JSON Schema 结构化的离线模拟模型",
    supportsImage: false,
    supportsJsonSchema: true,
  },
  {
    id: "mock/vision-model",
    name: "Mock 视觉模型",
    description: "支持图片输入的离线模拟模型",
    supportsImage: true,
    supportsJsonSchema: false,
  },
];

export async function mockFetchModels(): Promise<ModelInfo[]> {
  return mockModels;
}

function validFixture(model: string): string {
  return JSON.stringify({
    cases: [
      {
        id: "TC-001",
        module: "登录模块",
        title: "验证用户名或密码错误时的提示",
        testType: "异常",
        priority: "P1",
        precondition: "已注册账号且处于退出登录状态",
        testData: "用户名：user_01；密码：wrong123",
        steps: ["打开登录页", "输入已注册用户名与错误密码", "点击登录"],
        expected: "页面提示「用户名或密码错误」，不产生登录会话",
        status: "未执行",
        actualResult: "",
        defectId: "",
        remark: "",
      },
      {
        id: "TC-002",
        module: "登录模块",
        title: "验证密码为空时的校验",
        testType: "边界",
        priority: "P2",
        precondition: "已注册账号且处于退出登录状态",
        testData: "用户名：user_01；密码：空",
        steps: ["打开登录页", "仅输入用户名", "点击登录"],
        expected: "密码输入框出现必填提示，无法提交",
        status: "未执行",
        actualResult: "",
        defectId: "",
        remark: "",
      },
      {
        id: "TC-003",
        module: "登录模块",
        title: "连续多次输错密码后被临时锁定",
        testType: "安全",
        priority: "P1",
        precondition: "登录失败次数限制策略 = 连续 5 次",
        steps: ["连续输错密码 5 次", "第 6 次输入正确密码"],
        expected: "第 6 次提示账号已被临时锁定 10 分钟",
        status: "未执行",
        actualResult: "",
        defectId: "",
        remark: "",
      },
    ],
    coverage: [
      { feature: "登录", testType: "功能/UI", count: 1, coverageStatus: "已覆盖", riskLevel: "低" },
      { feature: "登录", testType: "异常", count: 2, coverageStatus: "部分覆盖", riskLevel: "中" },
    ],
    risksAndAssumptions: ["锁定时间 10 分钟为假设值，需确认", "P0 用例暂未生成"],
    confirmations: [
      {
        problem: "PRD 未明确账号锁定时长",
        impact: "影响安全用例的预期结果",
        sourceLocation: "3.2 登录安全",
        confirmSuggestion: "请确认锁定策略：连续失败次数与锁定时长",
      },
    ],
    evidence: [
      { caseId: "TC-001", prdSnippet: "登录失败时提示用户名或密码错误", location: "3.1 登录/第 3 页" },
      { caseId: "TC-003", prdSnippet: "连续失败 5 次锁定账号", location: "3.2 登录安全/第 4 页" },
    ],
    modelUsed: model,
  });
}

function badJsonFixture(): string {
  return `{
    "cases": [
      {
        "id": "TC-001",
        "module": "登录模块",
        "title": "这是故意缺失逗号的非法 JSON",
        "steps": ["第一步" "第二步"],
        "testType": "异常"
      }
    ],
    "coverage": [],
    "risksAndAssumptions": [],
    "confirmations": [],
    "evidence": [],
    "modelUsed": "mock"
  `;
}

export async function mockGenerate(params: {
  model: string;
  apiKey?: string;
  messages: Array<{ role: string; content: string }>;
  images?: Array<{ mime: string; dataUrl: string }>;
}): Promise<GenerateSuccess> {
  const { model, messages } = params;
  const lastUser =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  if (model.includes("err401")) {
    throw new OpenRouterHttpError(401, "Unauthorized: invalid or missing API key");
  }
  if (model.includes("err402")) {
    throw new OpenRouterHttpError(402, "Insufficient Credits: free credits exhausted");
  }
  if (model.includes("err429")) {
    throw new OpenRouterHttpError(429, "Rate limit reached: too many requests");
  }
  if (model.includes("err404")) {
    throw new OpenRouterHttpError(404, "Model not found");
  }
  if (model.includes("err413")) {
    throw new OpenRouterHttpError(413, "Payload too large");
  }
  if (model.includes("errnetwork")) {
    throw new TypeError("fetch failed");
  }
  if (model.includes("timeout")) {
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  }

  const content = model.includes("badjson") ? badJsonFixture() : validFixture(model);

  return {
    content:
      lastUser.includes("非法 JSON") && !model.includes("badjson")
        ? validFixture(model)
        : content,
    model,
    usage: { prompt_tokens: 120, completion_tokens: 860, total_tokens: 980 },
    finishReason: "stop",
    structuredUsed: false,
  };
}

/** mock 层抛出的”HTTP 错误“，由路由层统一映射为用户可读消息 */
export class OpenRouterHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}