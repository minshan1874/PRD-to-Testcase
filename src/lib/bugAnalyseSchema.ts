import { z } from "zod";
import type { BugAnalyseResult, BugBelong, BugProblemType, BugRegressionAdvice } from "@/types";
import { salvageJson, tryParseJson } from "@/lib/schema";

// ─── Bug 分析 system 提示词 ───

const BUG_ANALYSE_SYSTEM = `你是bug分析助手，基于传入的报错日志、截图OCR文本做问题分析，严格输出JSON格式，不要额外解释。

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

const PROBLEM_TYPES = ["JS异常", "接口请求异常", "渲染样式异常", "网络&跨域", "环境兼容", "其他"] as const;
const BELONGS = ["前端", "后端服务", "网络网关", "浏览器环境", "无法确定，信息不足"] as const;

export function buildBugAnalyseJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      problemType: { type: "string", enum: [...PROBLEM_TYPES] },
      belong: { type: "string", enum: [...BELONGS] },
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
  };
}

/** 组装 bug 分析 messages（文本 + 可选的 OCR 文字） */
export function buildBugAnalyseMessages(text: string, ocrText?: string): {
  messages: Array<{ role: string; content: string }>;
} {
  const parts: string[] = [];
  if (text.trim()) parts.push(`用户提供的报错/日志/描述：\n${text.trim()}`);
  if (ocrText?.trim()) parts.push(`图片OCR识别出的文字：\n${ocrText.trim()}`);
  if (parts.length === 0) parts.push("（未提供任何文本内容，请返回 reason 说明信息不足）");

  const user = `${parts.join("\n\n")}\n\n请按系统说明进行分析，并输出符合约定结构的 JSON 对象。`;

  return {
    messages: [
      { role: "system", content: BUG_ANALYSE_SYSTEM },
      { role: "user", content: user },
    ],
  };
}

// ─── zod 校验与规范化 ───

const problemTypeSchema = z
  .union(PROBLEM_TYPES.map((t) => z.literal(t)))
  .catch("其他");

const belongSchema = z
  .union(BELONGS.map((b) => z.literal(b)))
  .catch("无法确定，信息不足");

export type BugAnalyseValidationOutcome =
  | { ok: true; result: BugAnalyseResult }
  | { ok: false; reason: string };

export function validateBugAnalyse(content: string): BugAnalyseValidationOutcome {
  let obj = tryParseJson(content);
  if (obj === null) obj = salvageJson(content);
  if (obj === null) return { ok: false, reason: "输出不是合法 JSON，且自动修复失败" };
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { ok: false, reason: "JSON 顶层不是对象" };
  }

  const schema = z.object({
    problemType: problemTypeSchema,
    belong: belongSchema,
    reason: z.string().catch(""),
    suggest: z.array(z.string().catch("")).min(1).catch([]),
    focusPoint: z.string().catch(""),
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
  // 保证 reason 结尾带有【AI推测，需要进一步验证】
  let reason = data.reason.trim();
  const tag = "【AI推测，需要进一步验证】";
  if (reason && !reason.endsWith(tag)) {
    reason = `${reason}${tag}`;
  }
  // 保证 suggest 在 2-4 条之间
  let suggest = data.suggest.filter((s) => s.trim().length > 0);
  if (suggest.length < 2) suggest = [...suggest, "复现问题并收集完整报错信息", "检查浏览器控制台与网络请求"];
  if (suggest.length > 4) suggest = suggest.slice(0, 4);

  const regressionAdvice = normalizeRegressionAdvice((obj as Record<string, unknown>).regressionAdvice);

  return {
    ok: true,
    result: {
      problemType: data.problemType as BugProblemType,
      belong: data.belong as BugBelong,
      reason,
      suggest,
      focusPoint: data.focusPoint,
      regressionAdvice,
    },
  };
}

function normalizeRegressionAdvice(value: unknown): BugRegressionAdvice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;

  const lists = (x: unknown): string[] =>
    Array.isArray(x) ? x.map((s) => String(s)).filter((s) => s.trim().length > 0) : [];

  let regressionSteps = lists(v.regressionSteps);
  if (regressionSteps.length < 2) regressionSteps = [];
  if (regressionSteps.length > 4) regressionSteps = regressionSteps.slice(0, 4);

  let verifyPoint = lists(v.verifyPoint);
  if (verifyPoint.length < 2) verifyPoint = [];
  if (verifyPoint.length > 3) verifyPoint = verifyPoint.slice(0, 3);

  const compatibleScope = typeof v.compatibleScope === "string" ? v.compatibleScope.trim() : "";
  let riskTip = typeof v.riskTip === "string" ? v.riskTip.trim() : "";
  const riskToken = "AI推测，仅供参考";
  const riskTag = "【AI推测，仅供参考】";
  if (riskTip && !riskTip.endsWith(riskToken) && !riskTip.endsWith(riskTag)) {
    riskTip = `${riskTip}${riskTag}`;
  }

  // 回归建议必须"有实质内容"才返回，否则视为空（前端隐藏模块）
  if (regressionSteps.length === 0 && verifyPoint.length === 0 && !compatibleScope && !riskTip) {
    return null;
  }
  return { regressionSteps, verifyPoint, compatibleScope, riskTip };
}
