import { z } from "zod";
import type { ReviewResult, ReviewSeverity, SourceItem, TestCase } from "@/types";
import { buildBody } from "@/lib/prompt";
import { renumberCases, salvageJson, tryParseJson } from "@/lib/schema";

// ─── 审查 system 提示词：内置评审定位、8 项检查维度、三部分输出要求 ───

const REVIEW_SYSTEM = `你是资深软件测试专家，负责对测试用例进行预审评审（AI 初筛预审）。你的职责是帮测试人员快速定位格式、逻辑、覆盖问题；业务正确性最终必须由测试人员进行人工复核兜底，你不能替代正式评审会，也不能替代产品/开发/测试的评审会议。

评审规则：
- 优先区分三类问题类型，禁止把普通细节问题一律标成缺陷：① 阻断缺陷（会造成用例不可执行、预期结果无法唯一判定、业务逻辑冲突）② 待人工核验项（业务规则、边界场景、设备环境限制，AI 无法自动确认的内容，打上【人工确认】标签，不属于缺陷）③ 优化建议（格式、文字、细节缺失类，不影响用例执行，不标记为缺陷）。
- 优先级规则：优先级只分 P0/P1/P2 三档，P0 最高、P2 最低。P0 是核心阻断主流程（占比应控制在 20% 以内），P1 是分支与常规校验，P2 是边角/UI/极端场景。常规格式分支（如不同文件格式上传/解析）、纯页面展示与 UI 细节、普通配置项（开关/下拉/默认值）、常规边界校验，除非属于核心业务主流程的一部分，否则不得标成 P0，默认归 P1 或 P2。

检查维度（对每一条用例逐条评审）：
① 标题：是否符合规范、是否笼统（如"测试登录""测表单"）、是否把操作步骤写进标题、是否见名知意；
② 优先级：P0/P1/P2 分配是否合理，是否存在大量滥用 P0（把格式分支/展示类/配置项标成 P0）；相似风险是否给了不一致的优先级；
③ 前置条件：是否缺失；是否把操作动作写进前置（正确：当前处于 XX 状态；错误：点击进入 XX 页面）；前置是否与操作步骤自洽——若前置写了"已进入/已登录某页面"，步骤里就不该再出现"打开/进入该页面"；验证"进入页面"与验证"页面内容"是否被错误地塞进同一条用例；是否缺少账号、权限、预置数据、环境开关；
④ 测试数据：是否缺失或模糊（只写"有效数据""正常输入""页面默认数据""超过上限""自定义XX"等占位写法）；数值型边界是否给了具体值（如上限 1500 应写 1501/1500/1499）并说明计数规则；文件类输入是否给出可复现的文件名/格式/大小/尺寸，是否明确"选择时拒绝"还是"上传后拒绝"；
⑤ 操作步骤：是否跳步；是否一步多个动作且没有检查时点（如"查看并多次点击"）；是否把预期结果写进步骤；多档取值（不同时长/分辨率/大小）是否逐档选取并逐步检查；每条步骤是否有序号；
⑥ 预期结果：是否用"功能正常、无异常、显示正常、提交成功、进入处理流程、展示生成中"等模糊或条件化描述；是否用"或"并列两种可能结果、或写"若存在…能力""目标由产品定义""按需达到"等不可判定的表述；核心业务流程（提交/创建/生成/支付等）的预期是否给出了可观测的成功标识（如任务/记录出现且状态正确、随请求传递的参数与页面设置一致）与失败时的明确失败表现；预期必须唯一、可观察、可验证、与步骤对应；
⑦ 业务覆盖：对照需求是否遗漏正向、异常、边界、状态流转、权限场景；是否遗漏上传/文件类（过滤、选择时拒与上传后拒、重复/清空/损坏/空/超大文件、弱网上传中断）、提交/生成类（重复点击幂等、中间态、超时、服务端失败、失败重试、页面离开后状态）、配置项（默认值与切换后对任务参数的影响、持久化）、权限/资源（登录态、额度、内容安全）、页面退出/返回（二次确认、未保存内容、返回后保留或清空）等场景；是否出现 AI 脑补、需求中不存在的场景；对需求未写明的行为不得臆断（如刷新后是否保持、关闭是否二次确认）；
⑧ 重复冗余：是否存在仅"可枚举参数取值"不同（如支持的文件扩展名、时长档位、分辨率）但行为一致的重复用例（应合并为参数化用例）；是否标记高度重复、无测试价值的用例。

输出要求（重要）：严格只输出一个 JSON 对象，不要输出 Markdown、代码围栏、CSV、解释或思考过程。JSON 结构为：
{
  "summary": "第一部分：整体评审总结，统计问题数量，列出高风险点提醒与人工必须复核的点",
  "highRiskNotes": ["需要人工重点确认的高风险项：资金类、状态流转类、权限类等"],
  "issues": [ { "caseId": "TC-xxx", "issue": "问题描述", "severity": "高|中|低", "suggestion": "明确修改建议", "confidence": 0.85 } ],
  "optimizedCases": [ 第三部分：修改之后的完整优化版用例，字段与输入用例保持一致 ],
  "modelUsed": ""
}

填充规则：
- issues 分类约束：对本条问题判断它属于三类中的哪一类，并在描述中遵循——① 阻断缺陷：会导致用例不可执行、预期结果无法唯一判定或业务逻辑冲突，severity 标“高”且 confidence 给 0.8 以上；② 待人工核验项：业务规则、边界、设备环境等 AI 无法自动确认的内容，在 issue 文本里带上【人工确认】标记，severity 用“中”，confidence 给 0.5~0.7，不属于缺陷；③ 优化建议：仅格式、文字、细节补充类，severity 用“低”，confidence 给 0.5 以下。不要把描述细节不足、待确认类当成阻断缺陷。
- optimizedCases 强制约束：
  1. 长度必须与输入用例条数完全一致，不要多输出也不要少输出；给出修改之后的完整优化版用例，包括未发现问题的用例原样保留纳入；每条用例必须包含输入 Excel 的所有字段（即使无内容也要保留空字符串，不要只输出有内容的字段）。
  2. 每条用例的字段、判定逻辑尽量与修正前保持一致，只修改善项。特别注意：操作步骤（steps）的每条必须保留序号前缀（1. 2. 3. …），新增或修改的步骤也要按顺序重新编号并保持连续，不得去掉序号。
- 不要自己编造业务规则；拿不准业务的地方在 issue 或 summary 中标记【人工确认】，不要臆断需求；对需求未写明的默认值、持久化、状态流转等行为，应标记【人工确认】而不是自行确定。
- summary 需同时提示人工必须复核的点：隐性业务规则、状态流转/权限/资金计算、遗漏场景（异常中断、重复操作、弱网、历史 bug 回归）、测试数据在测试环境能否构造。
- 用例很多时可分批逐条扫描，确保覆盖全部用例；避免输出截断。`;

// ─── 用例核心字段（与 schema.ts 保持一致） ───

const REVIEW_CORE_KEYS = [
  "id",
  "module",
  "featurePoint",
  "title",
  "testType",
  "caseType",
  "priority",
  "precondition",
  "testData",
  "steps",
  "expected",
  "status",
  "actualResult",
  "defectId",
  "remark",
];

const CORE_JSON_PROPS: Record<string, unknown> = {
  id: { type: "string" },
  module: { type: "string" },
  featurePoint: { type: "string" },
  title: { type: "string" },
  testType: { type: "string" },
  caseType: { type: "string" },
  priority: { type: "string" },
  precondition: { type: "string" },
  testData: { type: "string" },
  steps: { type: "array", items: { type: "string" } },
  expected: { type: "string" },
  status: { type: "string" },
  actualResult: { type: "string" },
  defectId: { type: "string" },
  remark: { type: "string" },
};

function reviewCaseProps(customKeys: string[], fieldKeys: string[]): Record<string, unknown> {
  const fieldSet = new Set(fieldKeys);
  const props: Record<string, unknown> = {};
  for (const key of REVIEW_CORE_KEYS) if (fieldSet.has(key)) props[key] = CORE_JSON_PROPS[key];
  for (const key of customKeys) props[`custom_${key}`] = { type: "string" };
  return props;
}

export function buildReviewJsonSchema(customKeys: string[], fieldKeys: string[] = REVIEW_CORE_KEYS): Record<string, unknown> {
  const fieldSet = new Set(fieldKeys);
  const issueProps = {
    caseId: { type: "string" },
    issue: { type: "string" },
    severity: { type: "string" },
    suggestion: { type: "string" },
    confidence: { type: "number" },
  };
  return {
    type: "object",
    properties: {
      summary: { type: "string" },
      highRiskNotes: { type: "array", items: { type: "string" } },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: issueProps,
          required: ["caseId", "issue", "severity", "suggestion"],
          additionalProperties: false,
        },
      },
      optimizedCases: {
        type: "array",
        items: {
          type: "object",
          properties: reviewCaseProps(customKeys, fieldKeys),
          required: [
            ...REVIEW_CORE_KEYS.filter((key) => fieldSet.has(key)),
            ...customKeys.map((key) => `custom_${key}`),
          ],
          additionalProperties: false,
        },
      },
      modelUsed: { type: "string" },
    },
    required: ["summary", "highRiskNotes", "issues", "optimizedCases", "modelUsed"],
    additionalProperties: false,
  };
}

/** 将测试用例转成便于模型阅读的多行文本 */
function casesToText(cases: TestCase[]): string {
  return cases
    .map((c, i) => {
      const fields: string[] = [`【用例 ${c.id || `TC-${String(i + 1).padStart(3, "0")}`}】`];
      const push = (k: string, v: string | string[] | undefined) => {
        const s = Array.isArray(v) ? v.join("；") : String(v ?? "");
        if (s) fields.push(`  ${k}: ${s}`);
      };
      push("模块", c.module);
      push("功能点", c.featurePoint);
      push("标题", c.title);
      push("用例类型", c.caseType);
      push("优先级", c.priority);
      push("前置条件", c.precondition);
      push("测试数据", c.testData);
      push("操作步骤", c.steps);
      push("预期结果", c.expected);
      return fields.join("\n");
    })
    .join("\n\n");
}

export interface BuiltReview {
  messages: Array<{ role: string; content: string }>;
  textChars: number;
}

/** 组装审查 messages：PRD 需求（复用 buildBody 拼接）+ 全部测试用例文本 */
export function buildReviewMessages(sources: SourceItem[], cases: TestCase[]): BuiltReview {
  const body = buildBody(sources);
  const prdText = body.text.trim() || "（未提供需求文本，请仅依据用例本身的标题规范、优先级、字段格式、步骤与预期结果的可执行性给出评审意见，并在 summary 中提示需补充需求以核对业务覆盖。）";
  const user = [
    "请对下面的测试用例做预审评审。",
    "",
    "已知业务需求：",
    prdText,
    "",
    `下面是我的全部测试用例（共 ${cases.length} 条）：`,
    casesToText(cases),
    "",
    "请按系统说明的检查维度逐条评审，并输出符合约定结构的 JSON 对象（summary / highRiskNotes / issues / optimizedCases / modelUsed）。",
  ].join("\n\n");

  return {
    messages: [
      { role: "system", content: REVIEW_SYSTEM },
      { role: "user", content: user },
    ],
    textChars: body.text.length,
  };
}

// ─── zod 校验与规范化 ──────────────────────────────

export type ReviewValidationOutcome =
  | { ok: true; result: ReviewResult }
  | { ok: false; reason: string };

const toStr = (label: string) =>
  z
    .union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined ? "" : String(v)))
    .catch(`[${label} 解析失败]`);

const stepsSchema = z
  .union([z.array(z.union([z.string(), z.number()])).nullish(), z.string(), z.number()])
  .transform((v) => {
    if (Array.isArray(v)) return v.map(String).filter((s) => s.trim() !== "");
    if (typeof v === "string" || typeof v === "number") {
      return String(v)
        .split(/\n|；/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    return [];
  });

const severitySchema = z
  .union([z.literal("高"), z.literal("中"), z.literal("低"), z.string().catch("中")])
  .transform((v): ReviewSeverity => (v === "高" || v === "中" || v === "低" ? v : "中"));

const confidenceSchema = z.coerce.number().finite().catch(0.5).transform((v) => Math.max(0, Math.min(1, v)));

/** 保证优化版用例的操作步骤都带连续序号：去掉原序号前缀后按顺序重新编号。 */
function applyStepNumbers(steps: string[]): string[] {
  return steps.map((raw, i) => `${i + 1}. ${raw.replace(/^\s*\d+[.、)）:：]\s*/, "").trim()}`);
}

function reviewCaseSchema(customKeys: string[], fieldKeys: string[]) {
  const fieldSet = new Set(fieldKeys);
  const all: Record<string, z.ZodTypeAny> = {
    id: toStr("id"),
    module: toStr("module"),
    featurePoint: toStr("featurePoint"),
    title: toStr("title"),
    testType: toStr("testType"),
    caseType: toStr("caseType"),
    priority: toStr("priority"),
    precondition: toStr("precondition"),
    testData: toStr("testData"),
    steps: stepsSchema,
    expected: toStr("expected"),
    status: toStr("status"),
    actualResult: toStr("actualResult"),
    defectId: toStr("defectId"),
    remark: toStr("remark"),
  };
  const props: Record<string, z.ZodTypeAny> = {};
  for (const key of REVIEW_CORE_KEYS) if (fieldSet.has(key)) props[key] = all[key];
  for (const key of customKeys) props[`custom_${key}`] = toStr(key).optional();
  return z.object(props).passthrough();
}

export function validateReview(
  content: string,
  customKeys: string[],
  fieldKeys: string[] = REVIEW_CORE_KEYS,
  /** 输入用例的列名（与 fieldKeys 一一对应），用于兼容模型按用户列名输出的情况 */
  labels: string[] = [],
  /** 期望的优化用例数量（输入用例条数），超出时截断对齐 */
  expectedCount?: number,
  /** 原始输入用例：提供后以其为底、叠加模型输出，保证内容不空且条数与输入一致 */
  originCases?: TestCase[]
): ReviewValidationOutcome {
  let obj = tryParseJson(content);
  if (obj === null) obj = salvageJson(content);
  if (obj === null) return { ok: false, reason: "输出不是合法 JSON，且自动修复失败" };
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { ok: false, reason: "JSON 顶层不是对象" };
  }
  const schema = z.object({
    summary: z.string().catch(""),
    highRiskNotes: z.array(z.string().catch("")).catch([]),
    issues: z
      .array(
        z
          .object({
            caseId: toStr("caseId"),
            issue: toStr("issue"),
            severity: severitySchema,
            suggestion: toStr("suggestion"),
            confidence: confidenceSchema,
          })
          .passthrough()
      )
      .catch([]),
    optimizedCases: z.array(reviewCaseSchema(customKeys, fieldKeys)).catch([]),
    modelUsed: z.string().catch(""),
  });
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      reason: `JSON 结构不符合约定：${first ? `${first.path.join(".")} ${first.message}` : "校验失败"}`,
    };
  }
  const data = parsed.data;
  /** 模型可能按中文 / 英文 / 用户 Excel 列名输出字段，这里统一归一化到标准键 */
  const BASE_ALIAS: Record<string, string[]> = {
    id: ["用例编号", "用例id", "用例 ID", "编号", "id", "ID", "caseId"],
    module: ["模块", "功能模块", "module", "Module"],
    featurePoint: ["功能点", "功能", "featurePoint", "FeaturePoint"],
    title: ["标题", "用例标题", "title", "Title"],
    caseType: ["用例类型", "caseType", "CaseType"],
    testType: ["测试类型", "testType", "TestType"],
    priority: ["优先级", "priority", "Priority"],
    precondition: ["前置条件", "前置", "precondition", "Precondition"],
    testData: ["测试数据", "输入数据", "testData", "TestData"],
    steps: ["操作步骤", "步骤", "steps", "Steps", "step"],
    expected: ["预期结果", "预期", "expected", "Expected"],
    actualResult: ["实际结果", "actualResult", "ActualResult"],
    status: ["状态", "status", "Status"],
    defectId: ["缺陷id", "缺陷ID", "缺陷编号", "defectId", "defectID"],
    remark: ["备注", "remark", "Remark"],
  };
  const aliasMap = new Map<string, string>();
  for (const [key, aliases] of Object.entries(BASE_ALIAS)) {
    for (const a of aliases) aliasMap.set(a.toLowerCase().replace(/\s+/g, ""), key);
  }
  fieldKeys.forEach((k, i) => {
    const lab = labels[i];
    if (lab) aliasMap.set(lab.toLowerCase().replace(/\s+/g, ""), k);
  });
  const normalizeKeys = (raw: Record<string, unknown>) => {
    for (const [rawKey, val] of Object.entries(raw)) {
      const norm = rawKey.toLowerCase().replace(/\s+/g, "");
      const target = aliasMap.get(norm);
      if (target && raw[target] === undefined && raw[target] !== null) raw[target] = val;
    }
  };
  const toSteps = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map(String).filter((s) => s.trim() !== "");
    const s = String(v ?? "");
    if (!s.trim()) return [];
    return s.split(/\r?\n|；/).map((t) => t.trim()).filter((t) => t.length > 0);
  };
  const toCase = (r: unknown): TestCase => {
    const c = r as Record<string, unknown>;
    normalizeKeys(c);
    const base: TestCase = {
      id: String(c.id ?? ""),
      module: String(c.module ?? ""),
      featurePoint: String(c.featurePoint ?? ""),
      title: String(c.title ?? ""),
      testType: String(c.testType ?? "功能/UI"),
      caseType: String(c.caseType ?? "功能测试"),
      priority: String(c.priority ?? "P2"),
      precondition: String(c.precondition ?? ""),
      testData: String(c.testData ?? ""),
      steps: applyStepNumbers(toSteps(c.steps)),
      expected: String(c.expected ?? ""),
      status: String(c.status ?? "未执行"),
      actualResult: String(c.actualResult ?? ""),
      defectId: String(c.defectId ?? ""),
      remark: String(c.remark ?? ""),
    };
    for (const key of customKeys) {
      const raw = c[`custom_${key}`];
      if (raw !== undefined && raw !== null) base[`custom_${key}`] = String(raw);
    }
    return base;
  };
  const modelCases = data.optimizedCases.map(toCase);
  // 优化用例：若提供了原始输入用例，则以原始内容为底、叠加模型修正，保证任一字段不因模型键名/缺输出而变空
  let optimized: TestCase[];
  if (originCases && originCases.length > 0) {
    optimized = originCases.map((orig, i) => {
      const m = modelCases.length > i ? modelCases[i] : undefined;
      if (!m) return { ...orig };
      const merged: TestCase = { ...orig };
      (Object.keys(m) as (keyof TestCase)[]).forEach((k) => {
        const v = m[k];
        const hasVal = Array.isArray(v) ? (v as string[]).length > 0 : String(v ?? "").trim() !== "";
        if (hasVal) (merged as unknown as Record<string, unknown>)[k] = v;
      });
      return merged;
    });
  } else {
    if (typeof expectedCount === "number" && expectedCount >= 0 && modelCases.length > expectedCount) {
      modelCases.slice(0, expectedCount);
    }
    optimized = modelCases;
  }
  optimized = renumberCases(optimized);
  return {
    ok: true,
    result: {
      summary: String(data.summary ?? ""),
      highRiskNotes: (data.highRiskNotes ?? []).map(String),
      issues: data.issues.map((i) => ({
        caseId: String(i.caseId ?? ""),
        issue: String(i.issue ?? ""),
        severity: i.severity,
        suggestion: String(i.suggestion ?? ""),
        confidence: typeof i.confidence === "number" ? i.confidence : i.confidence,
      })),
      optimizedCases: renumberCases(optimized),
      modelUsed: String(data.modelUsed ?? ""),
    },
  };
}