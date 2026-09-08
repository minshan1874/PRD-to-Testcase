import { z } from "zod";
import type {
  PrereviewCheck,
  PrereviewConclusion,
  PrereviewIssue,
  PrereviewResult,
  PrereviewRoleQuestions,
  PrereviewSeverity,
  SourceItem,
} from "@/types";
import { buildBody } from "@/lib/prompt";
import { salvageJson, tryParseJson } from "@/lib/schema";

// ─── 预审 system 提示词：内置评审定位、4 项检查维度、输出与三角色提问要求 ───

const PREREVIEW_SYSTEM = `你是资深软件测试工程师，请对下面这份 PRD 需求文档做需求预审评审。参考原型「AI需求预审」的模块定位：需求提报之后、人工评审之前，由你做前置预审，过滤明显不合规、信息残缺、风险类需求，输出预审报告，供分流至【直接驳回】【补材料重提】【流转人工评审】，减轻评审人力。你不替代人工评审，仅做前置筛查，输出建议，不做最终决策。

检查维度：
1、完整性：主流程、分支流程是否完整；异常场景、失败场景有没有定义；状态流转是否闭环；边界条件是否覆盖；权限规则是否明确。
2、清晰性：找出模糊描述，例如「友好提示」「做相应处理」这类缺少明确行为的文字；检查文档前后逻辑是否矛盾。
3、可测性：验收标准是否可验证；标记无法测试、没有判断标准的需求。
4、遗漏点：埋点、报错提示、并发重复操作、空数据、极限输入是否缺少说明。

除逐条问题外，还需按以下四大类给出分项校验结论：
- 信息完整性校验：业务背景、目标、影响范围、上线约束、风险预案、依赖系统是否填写完整；
- 合规&风险校验：是否涉及敏感数据、权限变更、业务合规、是否违反内部规范；
- 研发可行性初判：期望上线周期是否合理；是否存在跨模块强依赖；描述是否模糊无法落地；
- 需求清晰度校验：需求描述是否模糊，有无逻辑矛盾，是否缺少边界场景。

输出要求（重要）：严格只输出一个 JSON 对象，不要输出 Markdown、代码围栏、CSV、解释或思考过程。JSON 结构为：
{
  "summary": "整体评审总结，一句话概括含风险点与结论性建议，例如：需求缺少风险评估，未说明兼容旧版本方案，业务描述完整，存在 2 处中等风险，建议补充信息后重新提交",
  "score": 0,
  "conclusion": "驳回 | 补充材料 | 通过",
  "issues": [ { "id": "序号", "severity": "高|中|低", "location": "问题位置", "description": "问题描述", "suggestion": "修改补充建议", "needConfirmation": false } ],
  "checks": [ { "dimension": "信息完整性校验|合规&风险校验|研发可行性初判|需求清晰度校验", "riskLevel": "高|中|低|通过", "analysis": "AI 分析内容", "suggestion": "建议操作" } ],
  "roleQuestions": [ { "role": "后端开发", "questions": ["问题1","问题2","问题3","问题4"] } ],
  "modelUsed": ""
}

填充规则：
- score 为 0-100 整数，根据整体质量打分。
- conclusion：三选一。存在需补材料才能评审的明显缺项→"补充材料"；存在阻断性/严重矛盾→"驳回"；信息完整、风险可控→"通过"。
- issues：逐条输出问题，格式与检查维度对应。拿不准业务、文档未写明就必须自行判断的，在 description 中标明【需要人工会议确认】，并将 needConfirmation 置 true；不要编造文档不存在的内容。
- issues 的 id 填序号用于展示（如 1、2、3），空字符串由前端重新编号亦可。
- checks：严格按四个 dimension 各输出一条，riskLevel 为该维度结论。
- roleQuestions：严格按"后端开发、前端开发、测试工程师"三个角色，每个角色恰 4 个尖锐务实的评审问题，聚焦需求漏洞、技术风险、测试风险（如接口/数据一致性、异常与并发、边界与埋点、兼容与性能等），不要空泛。
- 依据附件原型、文档一并纳入分析。不要输出除该 JSON 对象以外的任何字符。`;

// ─── JSON Schema 生成（供支持 structured output 的模型使用） ───

export function buildPrereviewJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      summary: { type: "string" },
      score: { type: "number", minimum: 0, maximum: 100 },
      conclusion: { type: "string", enum: ["驳回", "补充材料", "通过"] },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            severity: { type: "string", enum: ["高", "中", "低"] },
            location: { type: "string" },
            description: { type: "string" },
            suggestion: { type: "string" },
            needConfirmation: { type: "boolean" },
          },
          required: ["id", "severity", "location", "description", "suggestion"],
          additionalProperties: false,
        },
      },
      checks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dimension: { type: "string" },
            riskLevel: { type: "string", enum: ["高", "中", "低", "通过"] },
            analysis: { type: "string" },
            suggestion: { type: "string" },
          },
          required: ["dimension", "riskLevel", "analysis", "suggestion"],
          additionalProperties: false,
        },
      },
      roleQuestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: ["后端开发", "前端开发", "测试工程师"] },
            questions: { type: "array", items: { type: "string" } },
          },
          required: ["role", "questions"],
          additionalProperties: false,
        },
      },
      modelUsed: { type: "string" },
    },
    required: ["summary", "score", "conclusion", "issues", "checks", "roleQuestions", "modelUsed"],
    additionalProperties: false,
  };
}

// ─── messages 组装（复用 buildBody 拼接 PRD 文本 + 图片） ───

export interface BuiltPrereview {
  messages: Array<{ role: string; content: string }>;
  images: Array<{ mime: string; dataUrl: string }>;
  textChars: number;
}

export function buildPrereviewMessages(sources: SourceItem[], ruleSet = "默认规则"): BuiltPrereview {
  const body = buildBody(sources);
  const prdText = body.text.trim() || "（未提供需求文本，请仅依据已上传的需求信息进行预审，并在 summary 中提示需补充需求文档以完整评审。）";
  const user = [
    "请对下面这份 PRD 需求文档进行 AI 需求预审评审。",
    "",
    `本次选择的预审规则集：${ruleSet}`,
    "",
    prdText,
    "",
    "请按系统说明的检查维度逐项检查，输出符合约定结构的 JSON 对象（summary / score / conclusion / issues / checks / roleQuestions / modelUsed）。不要编造文档不存在的业务；拿不准业务就标记【需要人工会议确认】。",
  ].join("\n\n");

  return {
    messages: [
      { role: "system", content: PREREVIEW_SYSTEM },
      { role: "user", content: user },
    ],
    images: body.images,
    textChars: body.text.length,
  };
}

// ─── zod 校验与规范化 ──────────────────────────────

export type PrereviewValidationOutcome =
  | { ok: true; result: PrereviewResult }
  | { ok: false; reason: string };

const toStr = (label: string) =>
  z
    .union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined ? "" : String(v)))
    .catch(`[${label} 解析失败]`);

const severitySchema = z
  .union([z.literal("高"), z.literal("中"), z.literal("低"), z.string().catch("中")])
  .transform((v): PrereviewSeverity => (v === "高" || v === "中" || v === "低" ? v : "中"));

const riskLevelSchema = z
  .union([z.literal("高"), z.literal("中"), z.literal("低"), z.literal("通过"), z.string().catch("通过")])
  .transform((v): PrereviewCheck["riskLevel"] =>
    v === "高" || v === "中" || v === "低" || v === "通过" ? v : "通过"
  );

const roleSchema = z
  .union([
    z.literal("后端开发"),
    z.literal("前端开发"),
    z.literal("测试工程师"),
    z.string().catch("测试工程师"),
  ])
  .transform((v): PrereviewRoleQuestions["role"] =>
    v === "后端开发" || v === "前端开发" || v === "测试工程师" ? v : "测试工程师"
  );

const conclusionSchema = z
  .union([z.literal("驳回"), z.literal("补充材料"), z.literal("通过"), z.string().catch("补充材料")])
  .transform((v): PrereviewConclusion =>
    v === "驳回" || v === "补充材料" || v === "通过" ? v : "补充材料"
  );

const issuesSchema = z
  .array(
    z
      .object({
        id: toStr("id"),
        severity: severitySchema,
        location: toStr("location"),
        description: toStr("description"),
        suggestion: toStr("suggestion"),
        needConfirmation: z.boolean().catch(false),
      })
      .passthrough()
  )
  .catch([]);

const checksSchema = z
  .array(
    z
      .object({
        dimension: toStr("dimension"),
        riskLevel: riskLevelSchema,
        analysis: toStr("analysis"),
        suggestion: toStr("suggestion"),
      })
      .passthrough()
  )
  .catch([]);

const roleQuestionsSchema = z
  .array(
    z
      .object({
        role: roleSchema,
        questions: z.array(z.string().catch("")).catch([]),
      })
      .passthrough()
  )
  .catch([]);

export function validatePrereview(content: string): PrereviewValidationOutcome {
  let obj = tryParseJson(content);
  if (obj === null) obj = salvageJson(content);
  if (obj === null) return { ok: false, reason: "输出不是合法 JSON，且自动修复失败" };
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { ok: false, reason: "JSON 顶层不是对象" };
  }
  const schema = z.object({
    summary: z.string().catch(""),
    score: z
      .union([z.number(), z.string().catch("")])
      .transform((v) => {
        const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.\-]/g, ""));
        return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
      }),
    conclusion: conclusionSchema,
    issues: issuesSchema,
    checks: checksSchema,
    roleQuestions: roleQuestionsSchema,
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
  const toIssue = (r: unknown): PrereviewIssue => {
    const i = r as Record<string, unknown>;
    return {
      id: String(i.id ?? ""),
      severity: (i as unknown as { severity: PrereviewSeverity }).severity,
      location: String(i.location ?? ""),
      description: String(i.description ?? ""),
      suggestion: String(i.suggestion ?? ""),
      needConfirmation: Boolean(i.needConfirmation),
    };
  };
  return {
    ok: true,
    result: {
      summary: String(data.summary ?? ""),
      score: Math.round(Number(data.score ?? 0) || 0),
      conclusion: data.conclusion,
      issues: data.issues.map(toIssue),
      checks: data.checks.map((c) => ({
        dimension: c.dimension,
        riskLevel: c.riskLevel,
        analysis: c.analysis,
        suggestion: c.suggestion,
      })),
      roleQuestions: data.roleQuestions.map((r) => ({
        role: r.role,
        questions: r.questions.map(String),
      })),
      modelUsed: String(data.modelUsed ?? ""),
    },
  };
}