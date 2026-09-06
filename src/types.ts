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

/** P0-P3 按绝对风险定义的说明（供提示词与字段说明复用） */
export const PRIORITY_LEVELS: Array<{ level: string; desc: string }> = [
  { level: "P0", desc: "阻塞发布、严重数据或安全风险、核心功能完全不可用" },
  { level: "P1", desc: "核心主流程、关键正向场景和主要业务功能" },
  { level: "P2", desc: "一般交互、次要流程、常规异常与边界场景" },
  { level: "P3", desc: "UI 细节、提示文案、体验优化和极端低概率场景" },
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

export type GenPhase = "idle" | "requesting" | "validating" | "repairing" | "done" | "error";