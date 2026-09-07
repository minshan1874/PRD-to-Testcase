import { z } from "zod";
import type { GenerationResult } from "@/types";

// ─── OpenRouter 结构化输出用的 JSON Schema（手写，保证兼容） ───

const CASE_CORE_KEYS = [
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

export function buildOutputJsonSchema(customKeys: string[], fieldKeys: string[] = CASE_CORE_KEYS): Record<string, unknown> {
  const fieldSet = new Set(fieldKeys);
  const caseProps: Record<string, unknown> = {};
  const coreProps: Record<string, unknown> = {
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
  for (const key of CASE_CORE_KEYS) {
    if (fieldSet.has(key)) caseProps[key] = coreProps[key];
  }
  for (const key of customKeys) caseProps[`custom_${key}`] = { type: "string" };

  return {
    type: "object",
    properties: {
      cases: {
        type: "array",
        // OpenAI-compatible structured outputs require every object schema to
        // explicitly disallow undeclared keys. Custom fields are declared in
        // `properties` and required as empty strings when they are unused.
        items: {
          type: "object",
          properties: caseProps,
          required: [
            ...CASE_CORE_KEYS.filter((key) => fieldSet.has(key)),
            ...customKeys.map((key) => `custom_${key}`),
          ],
          additionalProperties: false,
        },
      },
      coverage: {
        type: "array",
        items: {
          type: "object",
          properties: {
            feature: { type: "string" },
            testType: { type: "string" },
            count: { type: "number" },
            coverageStatus: { type: "string" },
            riskLevel: { type: "string" },
          },
          required: ["feature", "testType", "count", "coverageStatus", "riskLevel"],
          additionalProperties: false,
        },
      },
      risksAndAssumptions: { type: "array", items: { type: "string" } },
      confirmations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            problem: { type: "string" },
            impact: { type: "string" },
            sourceLocation: { type: "string" },
            confirmSuggestion: { type: "string" },
          },
          required: ["problem", "impact", "sourceLocation", "confirmSuggestion"],
          additionalProperties: false,
        },
      },
      evidence: {
        type: "array",
        items: {
          type: "object",
          properties: {
            caseId: { type: "string" },
            prdSnippet: { type: "string" },
            location: { type: "string" },
          },
          required: ["caseId", "prdSnippet", "location"],
          additionalProperties: false,
        },
      },
      modelUsed: { type: "string" },
    },
    required: ["cases", "coverage", "risksAndAssumptions", "confirmations", "modelUsed"],
    additionalProperties: false,
  };
}

// ─── zod 校验（宽松化 + 规范化，容忍模型输出的小偏差） ───

const extractText = (input: unknown): string => {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") return input;
  if (typeof input === "number" || typeof input === "boolean") return String(input);
  if (Array.isArray(input)) return input.map(extractText).filter((s) => s.length > 0).join("；");
  if (typeof input === "object") {
    // 模型可能把整段文本包装成对象（如 { expected: "…" } 或 { text: "…" }），递归提取其中的字符串值
    const parts = Object.values(input as Record<string, unknown>)
      .map(extractText)
      .filter((s) => s.length > 0);
    if (parts.length > 0) return parts.join("；");
    try {
      return JSON.stringify(input);
    } catch {
      return "";
    }
  }
  return "";
};

const toStr = (label: string) =>
  z
    .unknown()
    .transform((v) => extractText(v))
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

const toNum = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  })
  .catch(0);

function buildCaseSchema(customKeys: string[], fieldKeys: string[]) {
  const fieldSet = new Set(fieldKeys);
  const allProps: Record<string, z.ZodTypeAny> = {
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
  for (const key of CASE_CORE_KEYS) {
    if (fieldSet.has(key)) props[key] = allProps[key];
  }
  for (const key of customKeys) props[`custom_${key}`] = toStr(key).optional();
  return z.object(props).passthrough();
}

function buildResultSchema(customKeys: string[], fieldKeys: string[]) {
  return z.object({
    cases: z.array(buildCaseSchema(customKeys, fieldKeys)).catch([]),
    coverage: z
      .array(
        z.object({
          feature: toStr("feature"),
          testType: toStr("testType"),
          count: toNum,
          coverageStatus: toStr("coverageStatus"),
          riskLevel: toStr("riskLevel"),
        }).passthrough()
      )
      .catch([]),
    risksAndAssumptions: z.array(z.string().catch("")).catch([]),
    confirmations: z
      .array(
        z.object({
          problem: toStr("problem"),
          impact: toStr("impact"),
          sourceLocation: toStr("sourceLocation"),
          confirmSuggestion: toStr("confirmSuggestion"),
        }).passthrough()
      )
      .catch([]),
    evidence: z
      .array(
        z.object({
          caseId: toStr("caseId"),
          prdSnippet: toStr("prdSnippet"),
          location: toStr("location"),
        }).passthrough()
      )
      .catch([]),
    modelUsed: toStr("modelUsed"),
  });
}

// ─── JSON 提取与修复链 ────────────────────────────────────

/** 第一轮：直接 parse */
export function tryParseJson(content: string): unknown | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** 第二轮：剥代码围栏、截取到第一个 { 到最后一个 } */
export function salvageJson(content: string): unknown | null {
  const stripped = content
    .replace(/^\uFEFF/, "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  // 从第一个完整对象边界提取，避免模型在 JSON 后附加解释文字时截取错误。
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (start < 0) start = i;
      depth += 1;
    } else if (ch === "}" && start >= 0) {
      depth -= 1;
      if (depth === 0) {
        const candidate = stripped.slice(start, i + 1);
        for (const value of [candidate, candidate.replace(/,\s*([}\]])/g, "$1")]) {
          try {
            return JSON.parse(value);
          } catch {
            // 继续尝试更宽松的候选文本
          }
        }
        return null;
      }
    }
  }
  return null;
}

export type ValidationOutcome =
  | { ok: true; result: GenerationResult }
  | { ok: false; reason: string };

/** 对模型输出的文本执行：提取 → 校验 → 规范化 */
export function validateGeneration(content: string, customKeys: string[], fieldKeys: string[] = CASE_CORE_KEYS): ValidationOutcome {
  let obj = tryParseJson(content);
  if (obj === null) obj = salvageJson(content);
  if (obj === null) {
    return { ok: false, reason: "输出不是合法 JSON，且自动修复失败" };
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { ok: false, reason: "JSON 顶层不是对象" };
  }
  const parsed = buildResultSchema(customKeys, fieldKeys).safeParse(obj);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      reason: `JSON 结构不符合约定：${first ? `${first.path.join(".")} ${first.message}` : "校验失败"}`,
    };
  }
  const data = parsed.data;
  // steps 规范为数组；cases 中的自定义字段保留；id 保留模型原值（本地统一编号在 store 完成）
  const result: GenerationResult = {
    cases: data.cases.map((c) => {
      const r = c as unknown as Record<string, unknown>;
      const base: GenerationResult["cases"][number] = {
        id: String(r.id ?? ""),
        module: String(r.module ?? ""),
        featurePoint: String(r.featurePoint ?? ""),
        title: String(r.title ?? ""),
        testType: String(r.testType ?? "功能/UI"),
        caseType: String(r.caseType ?? "功能测试"),
        priority: String(r.priority ?? "P2"),
        precondition: String(r.precondition ?? ""),
        testData: String(r.testData ?? ""),
        steps: Array.isArray(r.steps) ? (r.steps as string[]) : [],
        expected: String(r.expected ?? ""),
        status: String(r.status ?? "未执行"),
        actualResult: String(r.actualResult ?? ""),
        defectId: String(r.defectId ?? ""),
        remark: String(r.remark ?? ""),
      };
      for (const key of customKeys) {
        const raw = r[`custom_${key}`];
        if (raw !== undefined && raw !== null) base[`custom_${key}`] = String(raw);
      }
      return base;
    }),
    coverage: data.coverage.map((c) => ({
      feature: String(c.feature ?? ""),
      testType: String(c.testType ?? ""),
      count: Number(c.count) || 0,
      coverageStatus: String(c.coverageStatus ?? "未覆盖"),
      riskLevel: String(c.riskLevel ?? "低"),
    })),
    risksAndAssumptions: (data.risksAndAssumptions ?? []).map(String),
    confirmations: data.confirmations.map((c) => ({
      problem: String(c.problem ?? ""),
      impact: String(c.impact ?? ""),
      sourceLocation: String(c.sourceLocation ?? ""),
      confirmSuggestion: String(c.confirmSuggestion ?? ""),
    })),
    evidence: data.evidence.map((e) => {
      const id = (e as Record<string, unknown>);
      // 兼容模型把用例 ID 放在 id / case_id / 用例ID 等不同键的情况
      const caseId = String(
        id.caseId ??
        id.id ??
        id.case_id ??
        id["用例ID"] ??
        id["用例 Id"] ??
        "",
      );
      return { caseId, prdSnippet: String(e.prdSnippet ?? ""), location: String(e.location ?? "") };
    }),
    modelUsed: String(data.modelUsed ?? ""),
  };
  return { ok: true, result };
}

/**
 * 本地统一编号：按数组顺序连续编号 TC-001…（第二版提示词约定模型不生成 ID）。
 * 生成完成、删除行、新增行统一复用该编号格式。
 */
export function renumberCases<T extends { id: string }>(cases: T[]): T[] {
  return cases.map((c, i) => ({ ...c, id: `TC-${String(i + 1).padStart(3, "0")}` }));
}
