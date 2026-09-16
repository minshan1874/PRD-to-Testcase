import { ApiError, fetchModels, generate } from "./openrouter.js";

interface WorkerEnv {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
}

/** 从请求头 x-openrouter-key 读取用户输入的 API Key */
function getApiKey(request: Request): string {
  return request.headers.get("x-openrouter-key") ?? "";
}

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function apiJson(request: Request, data: unknown, status = 200) {
  return json(data, status, corsHeaders(request));
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const headers = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return apiJson(request, {
        ok: true,
        version: "1.0.0",
        mock: false,
        defaultModel: "openai/gpt-5.6-luna",
      });
    }

    if (url.pathname === "/api/models" && request.method === "GET") {
      return handleModels(request, env);
    }

    if (url.pathname === "/api/generate" && request.method === "POST") {
      return handleChat(request, env);
    }

    // AI 审查用例：与生成共用同一条 OpenRouter 调用链路（messages 由前端构造为审查提示词）
    if (url.pathname === "/api/review" && request.method === "POST") {
      return handleChat(request, env);
    }

    // AI 需求预审：复用生成链路（messages 由前端构造为预审提示词）
    if (url.pathname === "/api/prereview" && request.method === "POST") {
      return handleChat(request, env);
    }

    // AI Bug 分析
    if (url.pathname === "/api/ai/bug-analyse" && request.method === "POST") {
      return handleBugAnalyse(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return apiJson(request, { error: { code: "not_found", message: "接口不存在" } }, 404);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  },
};

async function handleModels(request: Request, _env: WorkerEnv): Promise<Response> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return apiJson(request, { error: { code: "auth", message: "请先在侧边栏输入 API Key" } }, 401);
  }
  try {
    const models = await fetchModels(apiKey);
    return apiJson(request, { models, mock: false });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiJson(request, {
        error: { code: err.code, message: err.message, detail: err.detail },
      }, err.status ?? 502);
    }
    return apiJson(request, { error: { code: "upstream", message: "获取模型目录失败" } }, 502);
  }
}

async function handleChat(request: Request, _env: WorkerEnv): Promise<Response> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return apiJson(request, {
      error: { code: "auth", message: "请先在侧边栏输入 API Key" },
    }, 401);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("请求体必须是 JSON 对象");
    body = parsed as Record<string, unknown>;
  } catch (err) {
    return apiJson(request, {
      error: { code: "bad_request", message: "请求体不是合法 JSON", detail: err instanceof Error ? err.message : String(err) },
    }, 400);
  }

  const model = body.model;
  const messages = body.messages;
  if (typeof model !== "string" || !model) {
    return apiJson(request, { error: { code: "bad_request", message: "缺少 model 参数" } }, 400);
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return apiJson(request, { error: { code: "bad_request", message: "缺少 messages 参数" } }, 400);
  }

  const sanitizedMessages = messages.map((message) => {
    const item = message && typeof message === "object" ? message as Record<string, unknown> : {};
    return {
      role: typeof item.role === "string" ? item.role : "user",
      content: typeof item.content === "string" ? item.content : "",
    };
  });
  const images = Array.isArray(body.images)
    ? body.images
        .filter((item) => {
          if (!item || typeof item !== "object") return false;
          const image = item as Record<string, unknown>;
          return typeof image.mime === "string" && typeof image.dataUrl === "string" && image.dataUrl.startsWith("data:");
        })
        .map((item) => {
          const image = item as Record<string, string>;
          return { mime: image.mime, dataUrl: image.dataUrl };
        })
    : [];

  try {
    const result = await generate({
      model,
      messages: sanitizedMessages,
      images,
      temperature: typeof body.temperature === "number" ? body.temperature : undefined,
      maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : undefined,
      apiKey,
      useJsonSchema: typeof body.useJsonSchema === "boolean" ? body.useJsonSchema : undefined,
      jsonSchema: body.jsonSchema && typeof body.jsonSchema === "object"
        ? body.jsonSchema as Record<string, unknown>
        : undefined,
      // The hosted Worker would otherwise terminate a long-running request
      // before the browser's ten-minute client timeout. Return a JSON error
      // while the request is still alive so the UI does not misreport it as
      // localhost connectivity failure.
      // 95s：在 Cloudflare 约 100s 的单请求墙之前先自行超时并返回 504，
      // 否则平台会直接切断连接，前端将误报“无法连接到线上 API”（网络错误）。
      // 若仍需更大余量请改用本地服务或流式输出。
      timeoutMs: 95_000,
    });
    return apiJson(request, result);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiJson(request, {
        error: { code: err.code, message: err.message, detail: err.detail },
      }, err.status ?? 502);
    }
    return apiJson(request, {
      error: { code: "network", message: "网络错误：无法连接到 OpenRouter", detail: err instanceof Error ? err.message : String(err) },
    }, 502);
  }
}

// ─── AI Bug 分析 ────────────────────────────────────────────

const BUG_ANALYSE_SYSTEM = `你是bug分析助手，基于传入的报错日志、截图做问题分析，严格输出JSON格式，不要额外解释。

输出字段：
- problemType：问题类型，只能从【JS异常、接口请求异常、渲染样式异常、网络&跨域、环境兼容、其他】选择
- belong：问题归属，只能从【前端、后端服务、网络网关、浏览器环境、无法确定，信息不足】选择
- reason：根因推测，结尾必须带上【AI推测，需要进一步验证】
- suggest：数组，2-4条可执行排查步骤
- focusPoint：指出需要重点查看的堆栈、接口、字段信息
- regressionAdvice：对象，包含：
  - regressionSteps：数组，2-4条bug修复后的回归操作步骤；
  - verifyPoint：数组，2-3条回归通过的验证检查点；
  - compatibleScope：字符串，回归需要覆盖的浏览器、设备、系统环境；
  - riskTip：回归风险提示，结尾带上【AI推测，仅供参考】

只返回json，不要markdown、不要多余文字。`;

const BUG_JSON_SCHEMA = {
  name: "bug_analyse",
  strict: true,
  schema: {
    type: "object",
    properties: {
      problemType: {
        type: "string",
        enum: ["JS异常", "接口请求异常", "渲染样式异常", "网络&跨域", "环境兼容", "其他"],
      },
      belong: {
        type: "string",
        enum: ["前端", "后端服务", "网络网关", "浏览器环境", "无法确定，信息不足"],
      },
      reason: { type: "string" },
      suggest: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
      focusPoint: { type: "string" },
      regressionAdvice: {
        type: "object",
        properties: {
          regressionSteps: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
          verifyPoint: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
          compatibleScope: { type: "string" },
          riskTip: { type: "string" },
        },
        required: ["regressionSteps", "verifyPoint", "compatibleScope", "riskTip"],
        additionalProperties: false,
      },
    },
    required: ["problemType", "belong", "reason", "suggest", "focusPoint", "regressionAdvice"],
    additionalProperties: false,
  },
};

const BUG_PROBLEM_TYPES = ["JS异常", "接口请求异常", "渲染样式异常", "网络&跨域", "环境兼容", "其他"];
const BUG_BELONGS = ["前端", "后端服务", "网络网关", "浏览器环境", "无法确定，信息不足"];

async function handleBugAnalyse(request: Request, _env: WorkerEnv): Promise<Response> {
  const apiKey = getApiKey(request);
  if (!apiKey) {
    return apiJson(request, { code: 401, message: "请先在侧边栏输入 API Key" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("请求体必须是 JSON 对象");
    body = parsed as Record<string, unknown>;
  } catch (err) {
    return apiJson(request, { code: 400, message: "请求体不是合法 JSON" }, 400);
  }

  const textStr = typeof body.text === "string" ? body.text : "";
  const imageBase64 = typeof body.imageBase64 === "string" && body.imageBase64.startsWith("data:")
    ? body.imageBase64
    : null;
  const hasImage = Boolean(imageBase64);

  if (!textStr.trim() && !hasImage) {
    return apiJson(request, { code: 400, message: "请输入报错信息或上传截图" }, 400);
  }
  if (textStr.length > 12000) {
    return apiJson(request, { code: 400, message: "内容超出字符上限" }, 400);
  }

  try {
    const parts: string[] = [];
    if (textStr.trim()) parts.push(`用户提供的报错/日志/描述：\n${textStr.trim()}`);
    if (hasImage) parts.push("（已附上报错截图，请结合图片内容一起分析）");
    const userText = `${parts.join("\n\n")}\n\n请按系统说明进行分析，并输出符合约定结构的 JSON 对象。`;

    const messages = [
      { role: "system", content: BUG_ANALYSE_SYSTEM },
      { role: "user", content: userText },
    ];

    const images = hasImage && imageBase64
      ? [{ mime: imageBase64.split(";")[0].split(":")[1] || "image/png", dataUrl: imageBase64 }]
      : [];

    // 有图片时用支持图片的模型；无图片时用默认模型
    const model = hasImage ? "openai/gpt-5.6-luna" : "openai/gpt-5.6-luna";

    const result = await generate({
      model,
      messages,
      images,
      temperature: 0.2,
      maxTokens: 2000,
      apiKey,
      useJsonSchema: true,
      jsonSchema: BUG_JSON_SCHEMA,
      timeoutMs: hasImage ? 45_000 : 30_000,
    });

    // 解析并校验 JSON
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      const match = result.content.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* ignore */ }
      }
    }

    if (!parsed || typeof parsed !== "object") {
      return apiJson(request, { code: 502, message: "AI 返回格式异常，请重试" }, 502);
    }
    const obj = parsed as Record<string, unknown>;

    const problemType = BUG_PROBLEM_TYPES.includes(String(obj.problemType))
      ? String(obj.problemType) : "其他";
    const belong = BUG_BELONGS.includes(String(obj.belong))
      ? String(obj.belong) : "无法确定，信息不足";
    let reason = String(obj.reason || "");
    const tag = "【AI推测，需要进一步验证】";
    if (reason && !reason.endsWith(tag)) reason = `${reason}${tag}`;
    let suggest = Array.isArray(obj.suggest)
      ? obj.suggest.map((s: unknown) => String(s)).filter(Boolean)
      : [];
    if (suggest.length < 2) suggest = [...suggest, "复现问题并收集完整报错信息", "检查浏览器控制台与网络请求"];
    if (suggest.length > 4) suggest = suggest.slice(0, 4);
    const focusPoint = String(obj.focusPoint || "");

    const regressionAdvice = pickRegressionAdvice(obj.regressionAdvice);

    return apiJson(request, {
      code: 0,
      data: { problemType, belong, reason, suggest, focusPoint, regressionAdvice },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiJson(request, { code: err.status ?? 502, message: err.message }, err.status ?? 502);
    }
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return apiJson(request, { code: 504, message: "AI分析请求超时，请减少内容重试" }, 504);
    }
    return apiJson(request, { code: 502, message: "分析失败，请稍后重试" }, 502);
  }
}

/** 从 AI 返回的 regressionAdvice 字段中提炼回归建议；无实质内容返回 null */
function pickRegressionAdvice(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const stringList = (x: unknown): string[] =>
    Array.isArray(x) ? x.map((s: unknown) => String(s)).filter((s) => s.trim().length > 0) : [];
  let regressionSteps = stringList(v.regressionSteps);
  if (regressionSteps.length < 2) regressionSteps = [];
  if (regressionSteps.length > 4) regressionSteps = regressionSteps.slice(0, 4);
  let verifyPoint = stringList(v.verifyPoint);
  if (verifyPoint.length < 2) verifyPoint = [];
  if (verifyPoint.length > 3) verifyPoint = verifyPoint.slice(0, 3);
  const compatibleScope = typeof v.compatibleScope === "string" ? v.compatibleScope.trim() : "";
  let riskTip = typeof v.riskTip === "string" ? v.riskTip.trim() : "";
  const riskToken = "AI推测，仅供参考";
  const riskTag = "【AI推测，仅供参考】";
  if (riskTip && !riskTip.endsWith(riskToken) && !riskTip.endsWith(riskTag)) {
    riskTip = `${riskTip}${riskTag}`;
  }
  if (regressionSteps.length === 0 && verifyPoint.length === 0 && !compatibleScope && !riskTip) {
    return null;
  }
  return { regressionSteps, verifyPoint, compatibleScope, riskTip };
}
