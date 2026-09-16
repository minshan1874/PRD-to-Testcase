// ─── 输入文件与解析 ───────────────────────────────────────────

export type ParsedSourceKind = "text" | "pdf" | "docx" | "md" | "txt" | "image";

export type ParseStatus = "pending" | "parsing" | "success" | "error";

/** 一个解析成功或失败的源文件单元 */
export interface SourceItem {
  id: string;
  name: string;
  kind: ParsedSourceKind;
  /** 文件字节数（粘贴文本为字符串字节数） */
  size: number;
  status: ParseStatus;
  /** 文本内容（pdf/docx/md/txt/粘贴） */
  text?: string;
  /** PDF 页数 */
  pages?: number;
  /** 扫描 PDF 转成的页面图片（dataURL） */
  pageImages?: string[];
  /** 图片源（dataURL） */
  image?: string;
  mime?: string;
  /** 解析失败原因 */
  error?: string;
  /** 是否强制按图片发送（扫描件开关） */
  forceAsImage?: boolean;
}

// ─── 生成配置 ────────────────────────────────────────────────

export const TEST_TYPES = [
  "功能/UI",
  "接口",
  "异常",
  "边界",
  "权限",
  "安全",
  "性能",
  "兼容性",
  "可用性",
] as const;
export type TestType = (typeof TEST_TYPES)[number];

/** 用例类型（第二版提示词约定，仅取最主要的类型） */
export const CASE_TYPES = [
  "功能测试",
  "接口测试",
  "性能测试",
  "安全性测试",
  "稳定性测试",
  "兼容性测试",
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

/** 用例优先级（仅 P0/P1/P2 三档）定义（供提示词与字段说明复用） */
export const PRIORITY_LEVELS: Array<{ level: string; desc: string }> = [
  { level: "P0", desc: "最高：核心业务主流程，阻断业务，上线必须全部通过，每轮必执行（占比控制在 20% 以内）" },
  { level: "P1", desc: "中：分支业务、常规校验，功能重要，正式测试需执行，回归可抽样" },
  { level: "P2", desc: "最低：边缘场景、UI 体验细节，非业务阻断，工期紧张可跳过" },
];

export const CASE_SCALES = ["精简", "标准", "全面"] as const;
export type CaseScale = (typeof CASE_SCALES)[number];

export const OUTPUT_LANGS = ["自动识别", "中文", "英文"] as const;
export type OutputLang = (typeof OUTPUT_LANGS)[number];

/** 字段定义（内置 13 个 + 自定义） */
export interface FieldDef {
  key: string;
  label: string;
  description: string;
  example: string;
  /** 是否为内置字段（自定义字段不可删除 key） */
  builtin: boolean;
  /** 导出 Excel 的列宽（字符数） */
  width: number;
}

export interface FieldConfig {
  key: string;
  visible: boolean;
  /** 自定义字段是否输出到模型提示 */
  enabled: boolean;
}

export interface TraceConfig {
  enabled: boolean;
}

export interface GenerateConfig {
  testTypes: TestType[];
  scale: CaseScale;
  lang: OutputLang;
  fields: FieldConfig[];
  customFields: FieldDef[];
  trace: TraceConfig;
  model: string;
  /** 页面临时输入的 Key，仅存内存 */
  apiKey: string;
  temperature: number;
}

// ─── 生成结果 ────────────────────────────────────────────────

export interface TestCase {
  id: string;
  module: string;
  /** 功能点：当前测试点所属的具体功能或父级路径，保证可追溯 */
  featurePoint: string;
  title: string;
  testType: string;
  /** 用例类型：功能/接口/性能/安全性/稳定性/兼容性测试 */
  caseType: string;
  priority: string;
  precondition: string;
  testData: string;
  steps: string[];
  expected: string;
  status: string;
  actualResult: string;
  defectId: string;
  remark: string;
  /** 动态生成的键（自定义字段） */
  [key: `custom_${string}`]: string | undefined;
}

export interface CoverageRow {
  feature: string;
  testType: string;
  count: number;
  coverageStatus: string;
  riskLevel: string;
}

export interface ConfirmItem {
  problem: string;
  impact: string;
  sourceLocation: string;
  confirmSuggestion: string;
}

export interface EvidenceItem {
  caseId: string;
  prdSnippet: string;
  location: string;
}

export interface GenerationResult {
  cases: TestCase[];
  coverage: CoverageRow[];
  risksAndAssumptions: string[];
  confirmations: ConfirmItem[];
  evidence: EvidenceItem[];
  modelUsed: string;
}

// ─── AI 审查用例 ────────────────────────────────────────────

export type ReviewSeverity = "高" | "中" | "低";

/** 评审条目分类：blocking=阻断缺陷 / manual=待人工业务核验 / optimize=可选优化建议 */
export type ReviewCategory = "blocking" | "manual" | "optimize";

/** 审查逐条问题清单：用例编号｜问题描述｜严重等级｜明确修改建议（后处理补充分类与置信度） */
export interface ReviewIssue {
  caseId: string;
  issue: string;
  severity: ReviewSeverity;
  suggestion: string;
  /** 分类标签：阻断缺陷 / 待人工核验 / 可选优化建议 */
  category?: ReviewCategory;
  /** 置信度 0-1 */
  confidence?: number;
  /** 是否阻断缺陷 */
  isBlocking?: boolean;
  /** 同类问题聚合后的用例编号集合（首项即 caseId） */
  caseIds?: string[];
}

/** 评审基础统计 */
export interface ReviewStat {
  /** 总用例数量 */
  totalCases: number;
  /** 阻断缺陷条数 */
  blocking: number;
  /** 待人工核验项条数 */
  manual: number;
  /** 可选优化建议条数 */
  optimize: number;
}

/** AI 审查结果（含三分类聚合、质量评分、评审模式） */
export interface ReviewResult {
  /** 第一部分：整体评审总结（含问题数量统计、高风险点提醒） */
  summary: string;
  /** 高风险点提醒：资金 / 状态流转 / 权限类，需人工重点确认 */
  highRiskNotes: string[];
  /** 第二部分：逐条问题清单（后处理已分类） */
  issues: ReviewIssue[];
  /** 第三部分：修改之后的完整优化版用例 */
  optimizedCases: TestCase[];
  /** 实际使用的审查模型 */
  modelUsed: string;
  /** 本次评审基础统计 */
  stat?: ReviewStat;
  /** 阻断缺陷清单（聚合后） */
  blockingIssues?: ReviewIssue[];
  /** 待人工业务核验清单（聚合后） */
  manualIssues?: ReviewIssue[];
  /** 可选优化建议清单（聚合后） */
  optimizeIssues?: ReviewIssue[];
  /** 用例质量评分 0-100 */
  score?: number;
  /** 质量文字评价（例如：整体可用，少量阻断缺陷需要修复） */
  scoreText?: string;
}

export type ReviewPhase = "idle" | "requesting" | "validating" | "done" | "error";

export type GenPhase = "idle" | "requesting" | "validating" | "repairing" | "done" | "error";

// ─── AI 需求预审 ────────────────────────────────────────────

export type PrereviewSeverity = "高" | "中" | "低";

export type PrereviewConclusion = "驳回" | "补充材料" | "通过";

/** 逐条问题清单：序号｜问题等级(高/中/低)｜问题位置&问题描述｜修改补充建议 */
export interface PrereviewIssue {
  id: string;
  severity: PrereviewSeverity;
  location: string;
  description: string;
  suggestion: string;
  /** 是否标注【需要人工会议确认】 */
  needConfirmation?: boolean;
}

/** 分项校验结果（四大类：信息完整性 / 合规风险 / 研发可行性 / 需求清晰度） */
export interface PrereviewCheck {
  dimension: string;
  riskLevel: PrereviewSeverity | "通过";
  analysis: string;
  suggestion: string;
}

/** 三角色评审问题：后端开发 / 前端开发 / 测试工程师 各 4 问 */
export interface PrereviewRoleQuestions {
  role: "后端开发" | "前端开发" | "测试工程师";
  questions: string[];
}

/** AI 需求预审结果 */
export interface PrereviewResult {
  summary: string;
  score: number;
  conclusion: PrereviewConclusion;
  issues: PrereviewIssue[];
  checks: PrereviewCheck[];
  roleQuestions: PrereviewRoleQuestions[];
  modelUsed: string;
}

export type PrereviewPhase = "idle" | "requesting" | "validating" | "done" | "error";

/** 功能导航：gen=生成用例，preview=需求预审，review=用例评审，bug=Bug分析 */
export type ActiveFeature = "gen" | "preview" | "review" | "bug";

// ─── AI Bug 分析 ────────────────────────────────────────────

export type BugProblemType = "JS异常" | "接口请求异常" | "渲染样式异常" | "网络&跨域" | "环境兼容" | "其他";
export type BugBelong = "前端" | "后端服务" | "网络网关" | "浏览器环境" | "无法确定，信息不足";

/** Bug 修复后的回归建议 */
export interface BugRegressionAdvice {
  regressionSteps: string[];
  verifyPoint: string[];
  compatibleScope: string;
  riskTip: string;
}

/** AI Bug 分析结果 */
export interface BugAnalyseResult {
  problemType: BugProblemType;
  belong: BugBelong;
  reason: string;
  suggest: string[];
  focusPoint: string;
  regressionAdvice?: BugRegressionAdvice | null;
}

export type BugPhase = "idle" | "requesting" | "validating" | "done" | "error" | "ocr_empty";
