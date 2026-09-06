import { create } from "zustand";
import type {
  FieldConfig,
  FieldDef,
  GenerateConfig,
  GenPhase,
  GenerationResult,
  SourceItem,
  TestType,
} from "@/types";
import { BUILTIN_FIELDS } from "@/fieldSpec";
import { ingestFile, pasteItem } from "@/lib/ingest";
import { apiUnavailableMessage, fetchHealth, generateRequest, type CatalogModel } from "@/lib/api";
import { buildPrompt, outputFieldKeys } from "@/lib/prompt";
import { buildOutputJsonSchema, renumberCases, validateGeneration } from "@/lib/schema";
import { DEFAULT_MODEL_ID, effectiveCapabilities } from "@/lib/models";
import { STATIC_MODELS } from "@/lib/models";

let activeGenerationController: AbortController | null = null;

const DEFAULT_FIELDS: FieldConfig[] = BUILTIN_FIELDS.map((f) => ({
  key: f.key,
  visible: true,
  enabled: true,
}));

interface AppState {
  // ── 输入 ──
  sources: SourceItem[];
  pastedText: string;
  setPastedText: (t: string) => void;
  /** 粘贴文本进入输入池（返回是否成功） */
  commitPastedText: () => boolean;
  addFiles: (files: File[]) => Promise<void>;
  removeSource: (id: string) => void;
  clearSources: () => void;
  setForceAsImage: (id: string, v: boolean) => void;

  // ── 配置 ──
  config: GenerateConfig;
  updateConfig: (patch: Partial<GenerateConfig>) => void;

  // ── 模型 / 健康 ──
  models: CatalogModel[];
  modelsLoading: boolean;
  modelsError: string | null;
  health: { mock: boolean; defaultModel: string } | null;
  loadHealth: () => Promise<void>;
  loadModels: () => Promise<void>;

  // ── 字段编辑器 ──
  toggleFieldVisible: (key: string) => void;
  toggleFieldEnabled: (key: string) => void;
  moveField: (key: string, dir: -1 | 1) => void;
  addCustomField: (name: string) => void;
  removeCustomField: (key: string) => void;

  // ── 生成 ──
  phase: GenPhase;
  lastError: string | null;
  attempts: number;
  result: GenerationResult | null;
  generate: () => Promise<void>;
  cancelGeneration: () => void;
  resetGeneration: () => void;

}

export const useStore = create<AppState>()((set, get) => ({
  sources: [],
  pastedText: "",
  setPastedText: (pastedText) => set({ pastedText }),
  commitPastedText: () => {
    const t = get().pastedText.trim();
    if (!t) return false;
    set((s) => ({ sources: [...s.sources, pasteItem(t)], pastedText: "" }));
    return true;
  },
  addFiles: async (files) => {
    for (const file of files) {
      const res = await ingestFile(file);
      // 同一文件去重（同名同大小视为重复）
      const dup = get().sources.some(
        (s) => res.item.name === s.name && res.item.size === s.size
      );
      set((s) => ({ sources: dup ? s.sources : [...s.sources, res.item] }));
    }
  },
  removeSource: (id) => set((s) => ({ sources: s.sources.filter((x) => x.id !== id) })),
  clearSources: () => set({ sources: [] }),
  setForceAsImage: (id, v) =>
    set((s) => ({
      sources: s.sources.map((x) => (x.id === id ? { ...x, forceAsImage: v } : x)),
    })),

  config: {
    testTypes: [...(["功能/UI", "接口", "异常", "边界", "权限", "安全", "性能", "兼容性", "可用性"] as TestType[])],
    scale: "标准",
    lang: "自动识别",
    fields: DEFAULT_FIELDS,
    customFields: [],
    trace: { enabled: true },
    model: DEFAULT_MODEL_ID,
    apiKey: "",
    temperature: 0.2,
  },
  updateConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),

  models: [],
  modelsLoading: false,
  modelsError: null,
  health: null,
  loadHealth: async () => {
    try {
      const h = await fetchHealth();
      set((s) => ({
        health: { mock: h.mock, defaultModel: h.defaultModel },
        config: s.config.model === "" && h.defaultModel ? { ...s.config, model: h.defaultModel } : s.config,
      }));
    } catch (err) {
      set({ modelsError: err instanceof Error ? err.message : apiUnavailableMessage() });
    }
  },
  loadModels: async () => {
    set({ modelsLoading: true, modelsError: null });
    try {
      set({ models: STATIC_MODELS, modelsLoading: false });
    } catch (err) {
      set({
        modelsLoading: false,
        modelsError: err instanceof Error ? err.message : "模型目录加载失败",
      });
    }
  },

  toggleFieldVisible: (key) =>
    set((s) => ({
      config: {
        ...s.config,
        fields: s.config.fields.map((f) => (f.key === key ? { ...f, visible: !f.visible } : f)),
      },
    })),
  toggleFieldEnabled: (key) =>
    set((s) => ({
      config: {
        ...s.config,
        fields: s.config.fields.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f)),
      },
    })),
  moveField: (key, dir) =>
    set((s) => {
      const fields = [...s.config.fields];
      const idx = fields.findIndex((f) => f.key === key);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= fields.length) return s;
      const [item] = fields.splice(idx, 1);
      fields.splice(to, 0, item);
      return { config: { ...s.config, fields } };
    }),
  addCustomField: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = `cf_${Math.random().toString(36).slice(2, 7)}`;
    const def: FieldDef = {
      key,
      label: trimmed,
      description: `自定义字段“${trimmed}”，由用户在生成前定义`,
      example: "",
      builtin: false,
      width: 16,
    };
    set((s) => ({
      config: {
        ...s.config,
        customFields: [...s.config.customFields, def],
        fields: [...s.config.fields, { key, visible: true, enabled: true }],
      },
    }));
  },
  removeCustomField: (key) =>
    set((s) => ({
      config: {
        ...s.config,
        customFields: s.config.customFields.filter((f) => f.key !== key),
        fields: s.config.fields.filter((f) => f.key !== key),
      },
    })),

  phase: "idle",
  lastError: null,
  attempts: 0,
  result: null,

  generate: async () => {
    const { config, sources } = get();
    const active = sources.filter((s) => s.status === "success");
    if (active.length === 0) {
      set({ phase: "error", lastError: "没有可用的文档，请先上传或粘贴 PRD" });
      return;
    }
    if (!config.model) {
      set({ phase: "error", lastError: "请先在配置页选择或输入模型 ID" });
      return;
    }
    activeGenerationController?.abort();
    const generationController = new AbortController();
    activeGenerationController = generationController;
    let attempts = get().attempts;
    set({ phase: "requesting", lastError: null });

    const run = async (retryHint: string | null): Promise<void> => {
      const prompt = buildPrompt(get().sources, get().config);
      if (retryHint) {
        const msgs = [...prompt.messages];
        const lastIdx = msgs.length - 1;
        msgs[lastIdx] = { ...msgs[lastIdx], content: `${msgs[lastIdx].content}\n\n${retryHint}` };
        prompt.messages = msgs;
      }
      const catalog = get().models.find((m) => m.id === config.model);
      const cap = effectiveCapabilities(config.model, catalog);
      const useJsonSchema = cap.supportsJsonSchema;
      // OpenRouter 要求 response_format.json_schema 使用 { name, strict, schema } 包装
      const jsonSchema = useJsonSchema
        ? {
            name: "testcase_generation",
            strict: true,
            schema: buildOutputJsonSchema(
              get().config.customFields
                .filter((f) => outputFieldKeys(get().config).includes(f.key))
                .map((f) => f.key),
              outputFieldKeys(get().config),
            ),
          }
        : undefined;

      const resp = await generateRequest({
        model: config.model,
        messages: prompt.messages,
        images: prompt.images,
        temperature: config.temperature,
        maxTokens: 12000,
        apiKey: config.apiKey || undefined,
        signal: generationController.signal,
        useJsonSchema,
        jsonSchema,
      });

      set({ phase: "validating" });
      const outputKeys = outputFieldKeys(get().config);
      const customKeys = get().config.customFields
        .filter((f) => outputKeys.includes(f.key))
        .map((f) => f.key);
      const checked = validateGeneration(resp.content, customKeys, outputKeys);
      if (checked.ok) {
        set({
          phase: "done",
          // 模型不生成 ID；本地按最终顺序统一编号
          result: {
            ...checked.result,
            cases: renumberCases(checked.result.cases),
            modelUsed: resp.model || checked.result.modelUsed,
          },
        });
        return;
      }
      if (attempts < 1) {
        attempts += 1;
        set({ phase: "repairing", attempts });
        await run("注意：上一次输出不是合法 JSON，请只输出一个完整合法的 JSON 对象，不要输出任何其他文字或代码块标记。");
        return;
      }
      set({ phase: "error", lastError: checked.reason });
    };

    try {
      await run(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (get().phase !== "idle") set({ phase: "idle", lastError: null });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      set({ phase: "error", lastError: msg });
    } finally {
      if (activeGenerationController === generationController) activeGenerationController = null;
    }
  },

  cancelGeneration: () => {
    activeGenerationController?.abort();
    activeGenerationController = null;
    set({ phase: "idle", lastError: null });
  },

  resetGeneration: () => set({ phase: "idle", lastError: null, result: null, attempts: 0 }),
}));

export function useCaseCount(): number {
  return useStore((s) => s.result?.cases.length ?? 0);
}
