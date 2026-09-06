import type { CatalogModel } from "@/lib/api";

export const DEFAULT_MODEL_ID = "openai/gpt-5.6-luna";

export const STATIC_MODELS: CatalogModel[] = [
  { id: "openai/gpt-6-astra", name: "OpenAI: GPT-6 Astra", description: "GPT-6 Astra", created: 1788552838, pricing: { prompt: "0.00001", completion: "0.00005" }, supportsImage: true, supportsJsonSchema: true },
  { id: "openai/gpt-6-astra-pro", name: "OpenAI: GPT-6 Astra Pro", description: "GPT-6 Astra Pro", created: 1788552835, pricing: { prompt: "0.00001", completion: "0.00005" }, supportsImage: true, supportsJsonSchema: true },
  { id: "inclusionai/ling-3.0-flash-sante:free", name: "inclusionAI: Ling 3.0 Flash Sante (free)", description: "Health and medicine focused model", created: 1788545946, pricing: { prompt: "0", completion: "0" }, supportsImage: false, supportsJsonSchema: false },
  { id: "qwen/qwen3.8-max-0902", name: "Qwen: Qwen3.8 Max (0902)", description: "Multimodal reasoning model", created: 1788469704, pricing: { prompt: "0.000002", completion: "0.000006" }, supportsImage: true, supportsJsonSchema: true },
  { id: "meta/muse-spark-1.3-contributor", name: "Meta: Muse Spark 1.3 Contributor", description: "Multimodal reasoning model", created: 1788381519, pricing: { prompt: "0.0000001", completion: "0.0000002" }, supportsImage: true, supportsJsonSchema: true },
  { id: "meta/muse-spark-1.3", name: "Meta: Muse Spark 1.3", description: "Multimodal reasoning model", created: 1788378359, pricing: { prompt: "0.00000125", completion: "0.00000425" }, supportsImage: true, supportsJsonSchema: true },
  { id: "google/gemini-3.8-flash", name: "Google: Gemini 3.8 Flash", description: "Multimodal reasoning model", created: 1788362056, pricing: { prompt: "0.00000075", completion: "0.00000375" }, supportsImage: true, supportsJsonSchema: true },
  { id: "anthropic/claude-fable-5.1", name: "Anthropic: Claude Fable 5.1", description: "Agentic coding and knowledge work model", created: 1788285838, pricing: { prompt: "0.00001", completion: "0.00005" }, supportsImage: true, supportsJsonSchema: true },
  { id: "inception/mercury-2.5-preview", name: "Inception: Mercury 2.5 Preview", description: "Fast reasoning model", created: 1788209864, pricing: { prompt: "0.00000004", completion: "0.00000015" }, supportsImage: false, supportsJsonSchema: true },
  { id: "ibm-granite/granite-4.2-8b", name: "IBM: Granite 4.2 8B", description: "Reasoning and coding model", created: 1788206780, pricing: { prompt: "0.0000001", completion: "0.00000015" }, supportsImage: false, supportsJsonSchema: true },
  { id: "openai/gpt-5.6-luna", name: "OpenAI: GPT-5.6 Luna", description: "Fast, cost-efficient GPT-5.6 model", created: 1783590864, pricing: { prompt: "0.0000002", completion: "0.0000012" }, supportsImage: true, supportsJsonSchema: true },
];

/** 常用热门模型清单：即使目录加载失败也始终可选（能力标签为近似默认值，命中目录时以目录为准） */
export interface PopularModelInfo {
  id: string;
  name: string;
  supportsImage?: boolean;
  supportsJsonSchema?: boolean;
}

export const POPULAR_MODELS: PopularModelInfo[] = [
  { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3（0324）", supportsJsonSchema: true },
  { id: "openai/gpt-4o-mini", name: "OpenAI GPT-4o mini", supportsJsonSchema: true },
  { id: "openai/gpt-4o", name: "OpenAI GPT-4o", supportsImage: true, supportsJsonSchema: true },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", supportsImage: true, supportsJsonSchema: true },
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", supportsImage: true, supportsJsonSchema: true },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", supportsJsonSchema: true },
  { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B", supportsJsonSchema: true },
  { id: "moonshotai/kimi-k2-instruct", name: "Kimi K2", supportsJsonSchema: true },
];

/** 从目录中查找模型，并给出能力提示（图片/结构化输出） */
export function findModel(models: CatalogModel[], modelId: string): CatalogModel | undefined {
  return models.find((m) => m.id === modelId);
}

export interface ModelCapability {
  supportsImage: boolean;
  supportsJsonSchema: boolean;
  visionKnown: boolean;
}

/** 目录里查不到时按模型 ID 做启发式兜底（避免误判为完全未知） */
export function effectiveCapabilities(
  modelId: string,
  catalog?: CatalogModel
): ModelCapability {
  if (catalog) {
    return {
      supportsImage: catalog.supportsImage,
      supportsJsonSchema: catalog.supportsJsonSchema,
      visionKnown: true,
    };
  }
  const id = modelId.toLowerCase();
  const visionKeywords = ["vision", "vl", "omni", "gpt-4o", "gpt-4.1", "claude", "gemini", "qwen-vl", "llava", "moondream", "glm-4v"];
  const jsonKeywords = ["gpt-4o", "gpt-4.1", "gpt-4.5", "o3", "o4", "deepseek", "claude", "gemini", "moonshot"];
  return {
    supportsImage: visionKeywords.some((k) => id.includes(k)),
    supportsJsonSchema: jsonKeywords.some((k) => id.includes(k)),
    visionKnown: false,
  };
}
