import { create } from "zustand";
import { toast } from "sonner";
import type {
  ActiveFeature,
  BugAnalyseResult,
  BugPhase,
  BugRegressionAdvice,
  FieldConfig,
  FieldDef,
  GenerateConfig,
  GenPhase,
  GenerationResult,
  PrereviewPhase,
  PrereviewResult,
  ReviewPhase,
  ReviewResult,
  SourceItem,
  TestCase,
  TestType,
} from "@/types";
import { BUILTIN_FIELDS } from "@/fieldSpec";
import { ingestFile, pasteItem } from "@/lib/ingest";
import { apiUnavailableMessage, bugAnalyseRequest, fetchHealth, fetchModels, generateRequest, prereviewRequest, reviewRequest, type CatalogModel } from "@/lib/api";
import { buildPrompt, outputFieldKeys } from "@/lib/prompt";
import { buildOutputJsonSchema, renumberCases, validateGeneration } from "@/lib/schema";
import { buildReviewJsonSchema, buildReviewMessages, validateReview } from "@/lib/reviewSchema";
import { postProcessReview } from "@/lib/reviewPostProcess";
import { buildPrereviewJsonSchema, buildPrereviewMessages, validatePrereview } from "@/lib/prereviewSchema";
import { DEFAULT_MODEL_ID, effectiveCapabilities } from "@/lib/models";
import { STATIC_MODELS } from "@/lib/models";
import {
  DEMO_MODEL,
  DEMO_MODEL_ID,
  delay,
  isDemoModel,
  SAMPLE_BUG_RESULT,
  SAMPLE_GENERATION_RESULT,
  SAMPLE_PREREVIEW_RESULT,
  SAMPLE_REVIEW_RESULT,
} from "@/lib/sampleResults";

let activeGenerationController: AbortController | null = null;
let activeReviewController: AbortController | null = null;
let activePrereviewController: AbortController | null = null;
let activeStandaloneController: AbortController | null = null;
let activeBugController: AbortController | null = null;

/** 校验是否有有效 API Key；示例模型无需真实 Key。非法时返回 false 并 toast 提示 */
function requireValidApiKey(apiKey: string, model: string): boolean {
  if (isDemoModel(model)) return true;
  if (!apiKey || !apiKey.trim()) {
    toast.error("请现在侧边栏输入 API Key");
    return false;
  }
  return true;
}

const DEFAULT_FIELDS: FieldConfig[] = BUILTIN_FIELDS.map((f) => ({
  key: f.key,
  visible: true,
  enabled: true,
}));

interface AppState {
  // ── 功能导航 ──
  activeFeature: ActiveFeature;
  setActiveFeature: (f: ActiveFeature) => void;

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

  // ── 独立输入：AI 需求预审 ──
  prereviewSources: SourceItem[];
  prereviewAddFiles: (files: File[]) => Promise<void>;
  prereviewRemoveSource: (id: string) => void;
  prereviewClearSources: () => void;
  prereviewSetForceAsImage: (id: string, v: boolean) => void;

  // ── 独立输入：AI 用例评审（评审页需求文档） ──
  reviewSources: SourceItem[];
  reviewAddFiles: (files: File[]) => Promise<void>;
  reviewRemoveSource: (id: string) => void;
  reviewClearSources: () => void;
  reviewSetForceAsImage: (id: string, v: boolean) => void;

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
  openResults: () => void;

  // ── AI 审查 ──
  reviewPhase: ReviewPhase;
  reviewError: string | null;
  reviewResult: ReviewResult | null;
  reviewOpen: boolean;
  setReviewOpen: (v: boolean) => void;
  runReview: () => Promise<void>;
  cancelReview: () => void;
  clearReview: () => void;

  // ── AI 需求预审 ──
  prereviewPhase: PrereviewPhase;
  prereviewError: string | null;
  prereviewResult: PrereviewResult | null;
  prereviewRuleSet: string;
  setPrereviewRuleSet: (s: string) => void;
  runPrereview: () => Promise<void>;
  cancelPrereview: () => void;
  clearPrereview: () => void;

  // ── 独立 AI 用例评审（评审页） ──
  standaloneExcel: { cases: TestCase[]; columns: { key: string; label: string }[]; fileName: string } | null;
  setStandaloneExcel: (d: { cases: TestCase[]; columns: { key: string; label: string }[]; fileName: string } | null) => void;
  standalonePhase: ReviewPhase;
  standaloneError: string | null;
  standaloneResult: ReviewResult | null;
  runStandaloneReview: () => Promise<void>;
  cancelStandaloneReview: () => void;
  clearStandaloneReview: () => void;

  // ── AI Bug 分析 ──
  bugText: string;
  setBugText: (t: string) => void;
  bugImage: { dataUrl: string; fileName: string } | null;
  setBugImage: (img: { dataUrl: string; fileName: string } | null) => void;
  bugPhase: BugPhase;
  bugError: string | null;
  bugResult: BugAnalyseResult | null;
  runBugAnalyse: () => Promise<void>;
  cancelBugAnalyse: () => void;
  clearBugAnalyse: () => void;

}

export const useStore = create<AppState>()((set, get) => {
  /** 将文件解析后并入指定输入池（同名同大小去重） */
  async function ingestInto(pool: SourceItem[], add: (items: SourceItem[]) => void, files: File[]) {
    const items: SourceItem[] = [];
    for (const file of files) {
      const res = await ingestFile(file);
      const dup = pool.some(
        (s) => res.item.name === s.name && res.item.size === s.size
      );
      if (!dup) items.push(res.item);
    }
    if (items.length > 0) add(items);
  }

  return {
  activeFeature: "gen",
  setActiveFeature: (f) => set({ activeFeature: f }),

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
    await ingestInto(get().sources, (items) => set((s) => ({ sources: [...s.sources, ...items] })), files);
  },
  removeSource: (id) => set((s) => ({ sources: s.sources.filter((x) => x.id !== id) })),
  clearSources: () => set({ sources: [] }),
  setForceAsImage: (id, v) =>
    set((s) => ({
      sources: s.sources.map((x) => (x.id === id ? { ...x, forceAsImage: v } : x)),
    })),

  prereviewSources: [],
  prereviewAddFiles: async (files) => {
    await ingestInto(get().prereviewSources, (items) => set((s) => ({ prereviewSources: [...s.prereviewSources, ...items] })), files);
  },
  prereviewRemoveSource: (id) => set((s) => ({ prereviewSources: s.prereviewSources.filter((x) => x.id !== id) })),
  prereviewClearSources: () => set({ prereviewSources: [] }),
  prereviewSetForceAsImage: (id, v) =>
    set((s) => ({
      prereviewSources: s.prereviewSources.map((x) => (x.id === id ? { ...x, forceAsImage: v } : x)),
    })),

  reviewSources: [],
  reviewAddFiles: async (files) => {
    await ingestInto(get().reviewSources, (items) => set((s) => ({ reviewSources: [...s.reviewSources, ...items] })), files);
  },
  reviewRemoveSource: (id) => set((s) => ({ reviewSources: s.reviewSources.filter((x) => x.id !== id) })),
  reviewClearSources: () => set({ reviewSources: [] }),
  reviewSetForceAsImage: (id, v) =>
    set((s) => ({
      reviewSources: s.reviewSources.map((x) => (x.id === id ? { ...x, forceAsImage: v } : x)),
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
    const withDemo = (list: CatalogModel[]): CatalogModel[] =>
      list.some((m) => m.id === DEMO_MODEL_ID) ? list : [...list, DEMO_MODEL];
    try {
      const { models } = await fetchModels();
      // 目录加载成功则使用全量模型，失败时回退到内置静态列表；均追加示例模型
      set({ models: withDemo(models && models.length > 0 ? models : STATIC_MODELS), modelsLoading: false });
    } catch (err) {
      set({
        models: withDemo(STATIC_MODELS),
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
    if (!requireValidApiKey(config.apiKey, config.model)) return;
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
      if (isDemoModel(config.model)) {
        // 示例模型：不调用真实 API，模拟 5s 请求中 + 5s 校验中后输出固定示例结果
        set({ phase: "requesting", lastError: null });
        await delay(5000, generationController);
        set({ phase: "validating" });
        await delay(5000, generationController);
        set({ phase: "done", result: { ...SAMPLE_GENERATION_RESULT, modelUsed: config.model } });
        return;
      }
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

  resetGeneration: () => set({ phase: "idle", lastError: null, attempts: 0 }),
  openResults: () => set((s) => (s.result ? { phase: "done" } : s)),

  reviewPhase: "idle",
  reviewError: null,
  reviewResult: null,
  reviewOpen: false,
  setReviewOpen: (v) => set({ reviewOpen: v }),
  clearReview: () => set({ reviewPhase: "idle", reviewError: null, reviewResult: null }),

  runReview: async () => {
    const { config, result } = get();
    if (!result || result.cases.length === 0) {
      set({ reviewPhase: "error", reviewError: "没有可审查的用例，请先生成测试用例" });
      return;
    }
    const model = config.model;
    if (!model) {
      set({ reviewPhase: "error", reviewError: "请先在侧边栏选择模型" });
      return;
    }
    if (!requireValidApiKey(config.apiKey, config.model)) return;
    activeReviewController?.abort();
    const reviewController = new AbortController();
    activeReviewController = reviewController;
    let attempts = 0;
    set({ reviewPhase: "requesting", reviewError: null });

    const outputKeys = outputFieldKeys(config);
    const customKeys = config.customFields
      .filter((f) => outputKeys.includes(f.key))
      .map((f) => f.key);

    const run = async (retryHint: string | null): Promise<void> => {
      const prompt = buildReviewMessages(get().sources, (get().result?.cases ?? []).slice());
      if (retryHint) {
        const msgs = [...prompt.messages];
        const lastIdx = msgs.length - 1;
        msgs[lastIdx] = { ...msgs[lastIdx], content: `${msgs[lastIdx].content}\n\n${retryHint}` };
        prompt.messages = msgs;
      }
      const catalog = get().models.find((m) => m.id === model);
      const cap = effectiveCapabilities(model, catalog);
      const useJsonSchema = cap.supportsJsonSchema;
      const jsonSchema = useJsonSchema
        ? { name: "testcase_review", strict: true, schema: buildReviewJsonSchema(customKeys, outputKeys) }
        : undefined;

      const resp = await reviewRequest({
        model,
        messages: prompt.messages,
        temperature: config.temperature,
        maxTokens: 24000,
        apiKey: config.apiKey || undefined,
        signal: reviewController.signal,
        useJsonSchema,
        jsonSchema,
      });

      set({ reviewPhase: "validating" });
      const originCases = (get().result?.cases ?? []).slice();
      const labelById = new Map<string, string>();
      for (const f of BUILTIN_FIELDS) labelById.set(f.key, f.label);
      for (const cf of get().config.customFields) labelById.set(cf.key, cf.label ?? cf.key);
      const fieldLabels: string[] = [];
      for (const f of get().config.fields) if (outputKeys.includes(f.key)) fieldLabels.push(labelById.get(f.key) ?? f.key);
      const checked = validateReview(resp.content, customKeys, outputKeys, fieldLabels, originCases.length, originCases);
      if (checked.ok) {
        set({
          reviewPhase: "done",
          reviewResult: { ...checked.result, modelUsed: resp.model || checked.result.modelUsed },
        });
        return;
      }
      if (attempts < 1) {
        attempts += 1;
        set({ reviewPhase: "validating" });
        await run("注意：上一次输出不是合法 JSON，请只输出一个完整合法的 JSON 对象，不要输出任何其他文字或代码块标记。");
        return;
      }
      set({ reviewPhase: "error", reviewError: checked.reason });
    };

    try {
      if (isDemoModel(model)) {
        // 示例模型评审：不调用真实 API，模拟 5s 请求中 + 5s 校验中后输出固定示例评审结果
        set({ reviewPhase: "requesting", reviewError: null });
        await delay(5000, reviewController);
        set({ reviewPhase: "validating" });
        await delay(5000, reviewController);
        set({ reviewPhase: "done", reviewResult: { ...SAMPLE_REVIEW_RESULT, modelUsed: model } });
        return;
      }
      await run(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (get().reviewPhase !== "idle") set({ reviewPhase: "idle", reviewError: null });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      set({ reviewPhase: "error", reviewError: msg });
    } finally {
      if (activeReviewController === reviewController) activeReviewController = null;
    }
  },

  cancelReview: () => {
    activeReviewController?.abort();
    activeReviewController = null;
    set({ reviewPhase: "idle", reviewError: null });
  },

  prereviewPhase: "idle",
  prereviewError: null,
  prereviewResult: null,
  prereviewRuleSet: "默认规则",
  setPrereviewRuleSet: (s) => set({ prereviewRuleSet: s }),
  clearPrereview: () => set({ prereviewPhase: "idle", prereviewError: null, prereviewResult: null }),

  runPrereview: async () => {
    const { config, prereviewSources } = get();
    const active = prereviewSources.filter((s) => s.status === "success");
    if (active.length === 0) {
      set({ prereviewPhase: "error", prereviewError: "没有可预审的需求文档，请先上传或粘贴 PRD" });
      return;
    }
    const model = config.model;
    if (!model) {
      set({ prereviewPhase: "error", prereviewError: "请先在侧边栏选择模型" });
      return;
    }
    activePrereviewController?.abort();
    if (!requireValidApiKey(config.apiKey, config.model)) return;
    const prereviewController = new AbortController();
    activePrereviewController = prereviewController;
    let attempts = 0;
    set({ prereviewPhase: "requesting", prereviewError: null });

    const run = async (retryHint: string | null): Promise<void> => {
      const prompt = buildPrereviewMessages(get().prereviewSources, get().prereviewRuleSet);
      if (retryHint) {
        const msgs = [...prompt.messages];
        const lastIdx = msgs.length - 1;
        msgs[lastIdx] = { ...msgs[lastIdx], content: `${msgs[lastIdx].content}\n\n${retryHint}` };
        prompt.messages = msgs;
      }
      const catalog = get().models.find((m) => m.id === model);
      const cap = effectiveCapabilities(model, catalog);
      const useJsonSchema = cap.supportsJsonSchema;
      const jsonSchema = useJsonSchema
        ? { name: "prereview", strict: true, schema: buildPrereviewJsonSchema() }
        : undefined;

      const resp = await prereviewRequest({
        model,
        messages: prompt.messages,
        images: prompt.images,
        temperature: config.temperature,
        maxTokens: 24000,
        apiKey: config.apiKey || undefined,
        signal: prereviewController.signal,
        useJsonSchema,
        jsonSchema,
      });

      set({ prereviewPhase: "validating" });
      const checked = validatePrereview(resp.content);
      if (checked.ok) {
        set({
          prereviewPhase: "done",
          prereviewResult: { ...checked.result, modelUsed: resp.model || checked.result.modelUsed },
        });
        return;
      }
      if (attempts < 1) {
        attempts += 1;
        set({ prereviewPhase: "validating" });
        await run("注意：上一次输出不是合法 JSON，请只输出一个完整合法的 JSON 对象，不要输出任何其他文字或代码块标记。");
        return;
      }
      set({ prereviewPhase: "error", prereviewError: checked.reason });
    };

    try {
      if (isDemoModel(model)) {
        // 示例模型预审：不调用真实 API，模拟 4s 请求中 + 4s 校验中后输出固定示例结果
        set({ prereviewPhase: "requesting", prereviewError: null });
        await delay(4000, prereviewController);
        set({ prereviewPhase: "validating" });
        await delay(4000, prereviewController);
        set({ prereviewPhase: "done", prereviewResult: { ...SAMPLE_PREREVIEW_RESULT, modelUsed: model } });
        return;
      }
      await run(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (get().prereviewPhase !== "idle") set({ prereviewPhase: "idle", prereviewError: null });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      set({ prereviewPhase: "error", prereviewError: msg });
    } finally {
      if (activePrereviewController === prereviewController) activePrereviewController = null;
    }
  },

  cancelPrereview: () => {
    activePrereviewController?.abort();
    activePrereviewController = null;
    set({ prereviewPhase: "idle", prereviewError: null });
  },

  standaloneExcel: null,
  setStandaloneExcel: (d) => set({ standaloneExcel: d }),
  standalonePhase: "idle",
  standaloneError: null,
  standaloneResult: null,
  runStandaloneReview: async () => {
    const { config, reviewSources, standaloneExcel } = get();
    if (!standaloneExcel || standaloneExcel.cases.length === 0) {
      set({ standalonePhase: "error", standaloneError: "请先上传测试用例 Excel" });
      return;
    }
    if (!reviewSources.some((s) => s.status === "success")) {
      set({ standalonePhase: "error", standaloneError: "请先上传需求文档" });
      return;
    }
    const model = config.model;
    if (!model) {
      set({ standalonePhase: "error", standaloneError: "请先在侧边栏选择模型" });
      return;
    }
    if (!requireValidApiKey(config.apiKey, config.model)) return;
    activeStandaloneController?.abort();
    const standaloneController = new AbortController();
    activeStandaloneController = standaloneController;
    let attempts = 0;
    set({ standalonePhase: "requesting", standaloneError: null });

    const fieldKeys = standaloneExcel.columns.map((c) => c.key);
    const customKeys: string[] = [];

    const run = async (retryHint: string | null): Promise<void> => {
      const prompt = buildReviewMessages(get().reviewSources, standaloneExcel.cases.slice());
      if (retryHint) {
        const msgs = [...prompt.messages];
        const lastIdx = msgs.length - 1;
        msgs[lastIdx] = { ...msgs[lastIdx], content: `${msgs[lastIdx].content}\n\n${retryHint}` };
        prompt.messages = msgs;
      }
      const catalog = get().models.find((m) => m.id === model);
      const cap = effectiveCapabilities(model, catalog);
      const useJsonSchema = cap.supportsJsonSchema;
      const jsonSchema = useJsonSchema
        ? { name: "testcase_review", strict: true, schema: buildReviewJsonSchema(customKeys, fieldKeys) }
        : undefined;

      const resp = await reviewRequest({
        model,
        messages: prompt.messages,
        temperature: config.temperature,
        maxTokens: 24000,
        apiKey: config.apiKey || undefined,
        signal: standaloneController.signal,
        useJsonSchema,
        jsonSchema,
      });

      set({ standalonePhase: "validating" });
      const checked = validateReview(
        resp.content,
        customKeys,
        fieldKeys,
        standaloneExcel.columns.map((c) => c.label),
        standaloneExcel.cases.length,
        standaloneExcel.cases
      );
      if (checked.ok) {
        set({
          standalonePhase: "done",
          standaloneResult: postProcessReview({
            ...checked.result,
            modelUsed: resp.model || checked.result.modelUsed,
          }),
        });
        return;
      }
      if (attempts < 1) {
        attempts += 1;
        set({ standalonePhase: "validating" });
        await run("注意：上一次输出不是合法 JSON，请只输出一个完整合法的 JSON 对象，不要输出任何其他文字或代码块标记。");
        return;
      }
      set({ standalonePhase: "error", standaloneError: checked.reason });
    };

    try {
      if (isDemoModel(model)) {
        set({ standalonePhase: "requesting", standaloneError: null });
        await delay(5000, standaloneController);
        set({ standalonePhase: "validating" });
        await delay(5000, standaloneController);
        set({
          standalonePhase: "done",
          standaloneResult: postProcessReview({
            ...SAMPLE_REVIEW_RESULT,
            modelUsed: model,
          }),
        });
        return;
      }
      await run(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (get().standalonePhase !== "idle") set({ standalonePhase: "idle", standaloneError: null });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      set({ standalonePhase: "error", standaloneError: msg });
    } finally {
      if (activeStandaloneController === standaloneController) activeStandaloneController = null;
    }
  },
  cancelStandaloneReview: () => {
    activeStandaloneController?.abort();
    activeStandaloneController = null;
    set({ standalonePhase: "idle", standaloneError: null });
  },
  clearStandaloneReview: () => set({ standalonePhase: "idle", standaloneError: null, standaloneResult: null }),

  bugText: "",
  setBugText: (t) => set({ bugText: t }),
  bugImage: null,
  setBugImage: (img) => set({ bugImage: img }),
  bugPhase: "idle",
  bugError: null,
  bugResult: null,

  runBugAnalyse: async () => {
    const { bugText, bugImage, config } = get();
    const trimmed = bugText.trim();
    const hasImage = Boolean(bugImage);
    if (!trimmed && !hasImage) {
      set({ bugPhase: "error", bugError: "请输入报错信息或上传截图" });
      return;
    }
    if (!requireValidApiKey(config.apiKey, config.model)) return;
    activeBugController?.abort();
    const bugController = new AbortController();
    activeBugController = bugController;
    set({ bugPhase: "requesting", bugError: null, bugResult: null });

    try {
      if (isDemoModel(config.model)) {
        // 示例模型：模拟 5 秒后返回示例结果
        await delay(5000, bugController);
        set({ bugPhase: "done", bugResult: { ...SAMPLE_BUG_RESULT } });
        return;
      }
      const imageBase64 = bugImage?.dataUrl;
      const data = await bugAnalyseRequest({
        text: trimmed,
        imageBase64,
        apiKey: config.apiKey || undefined,
        signal: bugController.signal,
      });
      set({ bugPhase: "validating" });
      // 简单的类型校验和字段兜底
      const result: BugAnalyseResult = {
        problemType: (data.problemType as BugAnalyseResult["problemType"]) ?? "其他",
        belong: (data.belong as BugAnalyseResult["belong"]) ?? "无法确定，信息不足",
        reason: data.reason || "",
        suggest: Array.isArray(data.suggest) ? data.suggest.filter(Boolean) : [],
        focusPoint: data.focusPoint || "",
      };
      // 保证 reason 结尾带标注
      const tag = "【AI推测，需要进一步验证】";
      if (result.reason && !result.reason.endsWith(tag)) {
        result.reason = `${result.reason}${tag}`;
      }
      // 保证 suggest 在 2-4 条之间
      if (result.suggest.length < 2) result.suggest = [...result.suggest, "复现问题并收集完整报错信息", "检查浏览器控制台与网络请求"];
      if (result.suggest.length > 4) result.suggest = result.suggest.slice(0, 4);
      // 解析 regressionAdvice（缺失或为空时置 null，前端隐藏模块）
      result.regressionAdvice = normalizeBugRegression(data);
      set({ bugPhase: "done", bugResult: result });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        if (get().bugPhase !== "idle") set({ bugPhase: "idle", bugError: null });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      // OCR 无有效文字的特殊错误码
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ocr_empty") {
        set({ bugPhase: "ocr_empty", bugError: "未能识别图片中的报错文字，请改用粘贴文本方式" });
        return;
      }
      set({ bugPhase: "error", bugError: msg });
    } finally {
      if (activeBugController === bugController) activeBugController = null;
    }
  },
  cancelBugAnalyse: () => {
    activeBugController?.abort();
    activeBugController = null;
    set({ bugPhase: "idle", bugError: null });
  },
  clearBugAnalyse: () =>
    set({
      bugText: "",
      bugImage: null,
      bugPhase: "idle",
      bugError: null,
      bugResult: null,
    }),
  };
});

export function useCaseCount(): number {
  return useStore((s) => s.result?.cases.length ?? 0);
}

/** 从后端返回的 data 中解析回归建议；无实质内容时返回 null */
function normalizeBugRegression(data: {
  regressionAdvice?: unknown;
}): BugRegressionAdvice | null {
  const value = data.regressionAdvice;
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
  if (regressionSteps.length === 0 && verifyPoint.length === 0 && !compatibleScope && !riskTip) {
    return null;
  }
  return { regressionSteps, verifyPoint, compatibleScope, riskTip };
}
