import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, RefreshCw, Trash2, Eye, EyeOff, PencilLine } from "lucide-react";
import { toast } from "sonner";
import type { FieldConfig, FieldDef } from "@/types";
import { BUILTIN_FIELDS } from "@/fieldSpec";
import { useStore } from "@/store";
import { effectiveCapabilities, POPULAR_MODELS, STATIC_MODELS } from "@/lib/models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import HelpTip from "@/components/HelpTip";

export default function StepConfig() {
  const store = useStore();
  const { config } = store;
  const [customName, setCustomName] = useState("");
  const [sortingFields, setSortingFields] = useState(false);
  const [autoSelectedImageModel, setAutoSelectedImageModel] = useState<string | null>(null);
  const [latestModelAutoSelected, setLatestModelAutoSelected] = useState(false);
  const [modelSelectOpen, setModelSelectOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  useEffect(() => {
    if (store.models.length === 0 && !store.modelsError) store.loadModels();
  }, [store.models.length, store.modelsError]);

  const selectedModel = store.models.find((m) => m.id === config.model);
  const cap = effectiveCapabilities(config.model, selectedModel);
  const hasImages = store.sources.some((s) => s.kind === "image" || (s.pageImages && s.pageImages.length > 0));
  const hasInput = store.sources.some((s) => s.status === "success");

  // 使用目录中发布时间最新的 10 个模型替代热门模型；目录不可用时使用内置兜底列表。
  const availableModels = store.models.filter((m) => !isBatchModel(m.id) && !isBatchModel(m.name));
  const catalogById = new Map(availableModels.map((m) => [m.id, m]));
  const sortedCatalogModels = [...availableModels].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  const latestCatalogModels = sortedCatalogModels.slice(0, 10);
  const featuredModels = latestCatalogModels.length > 0 ? latestCatalogModels : POPULAR_MODELS;
  const popularOptions = featuredModels.map((p) => {
    const found = catalogById.get(p.id);
    const eff = effectiveCapabilities(p.id, found);
    return {
      id: p.id,
      name: p.name,
      pricing: found?.pricing,
      capabilities: {
        supportsImage: found ? found.supportsImage : eff.supportsImage,
        supportsJsonSchema: found ? found.supportsJsonSchema : eff.supportsJsonSchema,
      },
    };
  });
  const catalogOptions = [...availableModels]
    .filter((m) => !featuredModels.some((p) => p.id === m.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  const normalizedSearch = modelSearch.trim().toLowerCase();
  const matchesModelSearch = (name: string, id: string, description = "") => {
    if (!normalizedSearch) return true;
    return `${name} ${id} ${description}`.toLowerCase().includes(normalizedSearch);
  };
  const filteredPopularOptions = popularOptions.filter((m) => matchesModelSearch(m.name, m.id));
  const filteredCatalogOptions = catalogOptions.filter((m) => matchesModelSearch(m.name, m.id, m.description));
  const allModelIds = new Set([...featuredModels.map((m) => m.id), ...availableModels.map((m) => m.id)]);
  const inList = allModelIds.has(config.model);
  // 图片输入时始终优先使用指定的 GPT-5.6 Luna，避免被“最新模型”自动选择逻辑覆盖。
  const defaultImageModel = STATIC_MODELS.find((m) => m.id === "openai/gpt-5.6-luna" && m.supportsImage)
    ?? sortedCatalogModels.find((m) => m.id === "openai/gpt-5.6-luna" && m.supportsImage);
  const imageCapableModel = defaultImageModel ?? sortedCatalogModels.find((m) => m.supportsImage)
    ?? (latestCatalogModels.length === 0 ? popularOptions.find((m) => m.capabilities.supportsImage) : undefined);

  useEffect(() => {
    const latestModel = hasImages ? imageCapableModel ?? latestCatalogModels[0] : latestCatalogModels[0];
    if (latestModelAutoSelected || !latestModel || (config.model && !isBatchModel(config.model))) return;
    store.updateConfig({ model: latestModel.id });
    setLatestModelAutoSelected(true);
  }, [hasImages, imageCapableModel?.id, latestCatalogModels[0]?.id, latestModelAutoSelected, config.model, store.health?.defaultModel]);

  useEffect(() => {
    if (!hasImages) {
      setAutoSelectedImageModel(null);
      return;
    }
    const isLegacyImageFallback = config.model === "openai/gpt-4o-mini";
    if (!isLegacyImageFallback && effectiveCapabilities(config.model, selectedModel).supportsImage) {
      if (config.model === imageCapableModel?.id) setAutoSelectedImageModel(config.model);
      return;
    }
    if (!imageCapableModel || imageCapableModel.id === config.model) return;

    store.updateConfig({ model: imageCapableModel.id });
    setAutoSelectedImageModel(imageCapableModel.id);
  }, [config.model, hasImages, imageCapableModel?.id, selectedModel?.supportsImage, store.models.length]);

  return (
    <div className="space-y-6">
      {/* 字段配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            字段配置
            <HelpTip text="控制生成结果与导出 Excel 的字段：可显示/隐藏字段、调整顺序、新增自定义字段。隐藏字段不会由模型生成，也不会出现在结果或 Excel 中。" />
            <Button
              variant={sortingFields ? "default" : "secondary"}
              size="sm"
              className="ml-auto"
              onClick={() => setSortingFields((v) => !v)}
            >
              {sortingFields ? <><Check className="size-4" /> 完成排序</> : "排序"}
            </Button>
          </CardTitle>
          <CardDescription>内置字段：{BUILTIN_FIELDS.length} 个；当前可见 {config.fields.filter((f) => f.visible).length} 个</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={sortingFields ? "space-y-1.5" : "grid gap-2 sm:grid-cols-2 lg:grid-cols-3"}>
            {config.fields.map((f, idx) => (
              <FieldRow
                key={f.key}
                field={f}
                sorting={sortingFields}
                custom={config.customFields.find((c) => c.key === f.key)}
                first={idx === 0}
                last={idx === config.fields.length - 1}
                onVisible={() => store.toggleFieldVisible(f.key)}
                onMove={(dir) => store.moveField(f.key, dir)}
                onRemoveCustom={() => store.removeCustomField(f.key)}
              />
            ))}
          </div>

          <div className="flex items-end gap-2 pt-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-sm" htmlFor="custom-name">新增自定义字段</Label>
              <Input
                id="custom-name"
                className="text-sm"
                placeholder="例如：所属迭代、关联需求单号"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && customName.trim()) {
                    store.addCustomField(customName);
                    setCustomName("");
                  }
                }}
              />
            </div>
            <Button
              onClick={() => {
                if (!customName.trim()) return;
                store.addCustomField(customName);
                setCustomName("");
              }}
            >
              <Plus className="size-4" /> 添加
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 模型配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            模型配置
            <HelpTip text="从 OpenRouter 模型目录选择模型；每次生成请求通过本地 API 转发到 OpenRouter。未选择模型无法生成。" />
          </CardTitle>
          {store.health?.mock && <CardDescription className="text-amber-600">当前为 Mock 模式（OPENROUTER_MOCK=true），不真正调用 OpenRouter。</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label className="flex items-center gap-1">
                <RefreshCw className="size-3.5" /> 选择模型
                <HelpTip text="下拉框中内置了常用热门模型，并自动合并 OpenRouter 目录（标注〔图片〕支持图片输入、〔结构化〕支持 JSON Schema）。选中「自定义模型 ID…」可填写其他模型；目录加载失败时热门模型仍可正常选择。" />
              </Label>
              <div className="flex gap-2 sm:col-span-2">
                <Select
                  open={modelSelectOpen}
                  onOpenChange={setModelSelectOpen}
                  value={inList ? config.model : "__custom__"}
                  onValueChange={(v) => {
                    if (v === "__custom__") return;
                    if (hasImages && !effectiveCapabilities(v, catalogById.get(v)).supportsImage) {
                      toast.error("请选择支持图片的模型");
                      window.setTimeout(() => setModelSelectOpen(true), 0);
                      return;
                    }
                    store.updateConfig({ model: v });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择模型…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    <div className="sticky top-0 z-10 bg-popover p-1">
                      <Input
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        placeholder="搜索模型名称或 ID…"
                        aria-label="搜索模型"
                      />
                    </div>
                    {filteredPopularOptions.length > 0 && <SelectGroup>
                        <SelectLabel>最新发布模型（10 个）</SelectLabel>
                      {filteredPopularOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          <span className="flex items-center gap-1.5">
                            {o.name} <span className="text-xs text-muted-foreground">（{formatModelPricing(o.pricing)}）</span>
                            {o.capabilities.supportsImage && <Badge variant="secondary" className="text-[10px]">图片</Badge>}
                            {o.capabilities.supportsJsonSchema && <Badge variant="outline" className="text-[10px]">结构化</Badge>}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>}
                    {filteredCatalogOptions.length > 0 && (
                      <SelectGroup>
                        <SelectLabel>OpenRouter 目录（{availableModels.length} 个）</SelectLabel>
                        {filteredCatalogOptions.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            <span className="flex items-center gap-1.5">
                              {m.name} <span className="text-xs text-muted-foreground">（{formatModelPricing(m.pricing)}）</span>
                              {m.supportsImage && <Badge variant="secondary" className="text-[10px]">图片</Badge>}
                              {m.supportsJsonSchema && <Badge variant="outline" className="text-[10px]">结构化</Badge>}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    <SelectGroup>
                      <SelectLabel>其他</SelectLabel>
                      <SelectItem value="__custom__">
                        <span className="flex items-center gap-1.5">
                          <PencilLine className="size-3.5" /> 自定义模型 ID…
                        </span>
                      </SelectItem>
                    </SelectGroup>
                    {normalizedSearch && filteredPopularOptions.length === 0 && filteredCatalogOptions.length === 0 && (
                      <p className="px-2 py-3 text-center text-xs text-muted-foreground">未找到匹配模型</p>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {store.modelsError && <p className="text-xs text-destructive">{store.modelsError}</p>}
              {hasImages && autoSelectedImageModel === config.model && (
                <p className="whitespace-nowrap text-xs text-emerald-600">已自动选择支持图片输入的模型：{selectedModel?.name ?? config.model}</p>
              )}
              {!inList && (
                <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                  <Label className="flex items-center gap-1">
                    <PencilLine className="size-3.5" /> 自定义模型 ID
                    <HelpTip text="目录与热门列表之外的其他模型，可在此直接填写 OpenRouter 支持的模型 ID。" />
                  </Label>
                  <Input
                    placeholder="如 openai/o3-mini 或 google/gemini-2.5-pro-preview"
                    value={config.model}
                    onChange={(e) => store.updateConfig({ model: e.target.value })}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {hasImages && !cap.supportsImage && (
              <Badge variant="warning">当前包含图片输入，但所选模型可能不支持视觉，生成时请留意</Badge>
            )}
            {!cap.supportsJsonSchema && (
              <Badge variant="warning">该模型不支持结构化输出，将使用普通 JSON + 本地校验修复</Badge>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              disabled={!hasInput || !config.model.trim()}
              onClick={() => {
                if (!config.model.trim()) {
                  toast.error("请先选择或输入模型 ID");
                  return;
                }
                if (isBatchModel(config.model)) {
                  toast.error("该模型已下架，请选择其他模型");
                  return;
                }
                if (hasImages && !cap.supportsImage) {
                  toast.error("请选择支持图片的模型");
                  return;
                }
                void store.generate();
              }}
            >
              {!hasInput ? "请先上传文档" : store.phase === "done" ? "重新生成" : "开始生成"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function isBatchModel(value: string) {
  return /batch\s*$/i.test(value.trim());
}

function formatModelPricing(pricing?: { prompt?: string; completion?: string }) {
  if (!pricing) return "价格未知";
  const input = Number(pricing.prompt ?? 0) * 1_000_000;
  const output = Number(pricing.completion ?? 0) * 1_000_000;
  if (input === 0 && output === 0) return "免费";
  return `输入 $${input.toFixed(2)} / 输出 $${output.toFixed(2)} / 百万 tokens`;
}

function FieldRow({
  field,
  sorting,
  custom,
  first,
  last,
  onVisible,
  onMove,
  onRemoveCustom,
}: {
  field: FieldConfig;
  sorting: boolean;
  custom?: FieldDef;
  first: boolean;
  last: boolean;
  onVisible: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemoveCustom: () => void;
}) {
  const meta = BUILTIN_FIELDS.find((f) => f.key === field.key);
  const label = custom?.label ?? meta?.label ?? field.key;
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      {sorting && <>
        <button type="button" disabled={first} onClick={() => onMove(-1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="上移">
          <ArrowUp className="size-4" />
        </button>
        <button type="button" disabled={last} onClick={() => onMove(1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="下移">
          <ArrowDown className="size-4" />
        </button>
      </>}
      <button type="button" onClick={onVisible} className="flex items-center gap-2 text-left" title={field.visible ? "隐藏该字段" : "显示该字段"}>
        {field.visible ? <Eye className="size-4 text-foreground" /> : <EyeOff className="size-4 text-muted-foreground" />}
        <span className={`text-sm ${field.visible ? "" : "text-muted-foreground"}`}>{label}</span>
      </button>
      {custom && <Badge variant="outline">自定义</Badge>}
      {custom && (
        <button type="button" onClick={onRemoveCustom} className="text-muted-foreground hover:text-destructive" aria-label="删除自定义字段">
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}
