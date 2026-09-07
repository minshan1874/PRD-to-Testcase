import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Check, History, Plus, RefreshCw, Trash2, Eye, EyeOff, PencilLine } from "lucide-react";
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
import { ModelSelect } from "@/components/ModelSelect";
import HelpTip from "@/components/HelpTip";

export default function StepConfig() {
  const store = useStore();
  const { config } = store;
  const [customName, setCustomName] = useState("");
  const [sortingFields, setSortingFields] = useState(false);
  const [autoSelectedImageModel, setAutoSelectedImageModel] = useState<string | null>(null);
  const [latestModelAutoSelected, setLatestModelAutoSelected] = useState(false);

  useEffect(() => {
    if (store.models.length === 0 && !store.modelsError) store.loadModels();
  }, [store.models.length, store.modelsError]);

  const selectedModel = store.models.find((m) => m.id === config.model);
  const cap = effectiveCapabilities(config.model, selectedModel);
  const hasImages = store.sources.some((s) => s.kind === "image" || (s.pageImages && s.pageImages.length > 0));
  const hasInput = store.sources.some((s) => s.status === "success");

  // 使用目录中发布时间最新的 10 个模型替代热门模型；目录不可用时使用内置兜底列表。
  const availableModels = store.models.filter((m) => !isBatchModel(m.id) && !isBatchModel(m.name));
  const sortedCatalogModels = [...availableModels].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  const latestCatalogModels = sortedCatalogModels.slice(0, 10);
  const featuredModels = latestCatalogModels.length > 0 ? latestCatalogModels : POPULAR_MODELS;
  const popularOptions = featuredModels.map((p) => {
    const found = store.models.find((m) => m.id === p.id);
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
            <span className="flex flex-col items-start gap-0.5">
              <span className="eyebrow">02 · Fields</span>
              <span className="flex items-center gap-1.5">
                <span className="font-display text-base font-semibold tracking-tight">字段配置</span>
                <HelpTip text="控制生成结果与导出 Excel 的字段：可显示/隐藏字段、调整顺序、新增自定义字段。隐藏字段不会由模型生成，也不会出现在结果或 Excel 中。" />
              </span>
            </span>
            <Button
              variant={sortingFields ? "default" : "secondary"}
              size="sm"
              className="ml-auto"
              onClick={() => setSortingFields((v) => !v)}
            >
              {sortingFields ? <><Check className="size-4" /> 完成排序</> : "排序"}
            </Button>
          </CardTitle>
          <CardDescription>内置字段：<span className="font-mono">{BUILTIN_FIELDS.length}</span> 个；当前可见 <span className="font-mono">{config.fields.filter((f) => f.visible).length}</span> 个</CardDescription>
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
            <span className="flex flex-col items-start gap-0.5">
              <span className="eyebrow">03 · Model</span>
              <span className="flex items-center gap-1.5">
                <span className="font-display text-base font-semibold tracking-tight">模型配置</span>
                <HelpTip text="从 OpenRouter 模型目录选择模型；每次生成请求通过本地 API 转发到 OpenRouter。未选择模型无法生成。" />
              </span>
            </span>
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
                <ModelSelect
                  value={config.model}
                  onValueChange={(v) => {
                    if (hasImages && !effectiveCapabilities(v, store.models.find((m) => m.id === v)).supportsImage) {
                      toast.error("请选择支持图片的模型");
                      return;
                    }
                    store.updateConfig({ model: v });
                  }}
                  showCapabilityBadges
                />
              </div>
              {store.modelsError && <p className="text-xs text-destructive">{store.modelsError}</p>}
              {hasImages && autoSelectedImageModel === config.model && (
                <p className="whitespace-nowrap text-xs text-emerald-600">已自动选择支持图片输入的模型：{selectedModel?.name ?? config.model}</p>
              )}
              {!store.models.some((m) => m.id === config.model) && (
                <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                  <Label className="flex items-center gap-1" htmlFor="custom-model-id">
                    <PencilLine className="size-3.5" /> 自定义模型 ID
                    <HelpTip text="目录与热门列表之外的其他模型，可在此直接填写 OpenRouter 支持的模型 ID。" />
                  </Label>
                  <Input
                    id="custom-model-id"
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

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {store.result && (
                <Button variant="outline" onClick={() => store.openResults()}>
                  <History className="size-4" /> 返回生成结果
                </Button>
              )}
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
                {hasInput && config.model.trim() && <ArrowRight className="size-4" />}
              </Button>
            </div>
            <p className="text-right text-xs text-muted-foreground">生成完成后，可在结果页使用「AI 评审用例」对生成的用例进行二次评审。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function isBatchModel(value: string) {
  return /batch\s*$/i.test(value.trim());
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
        <button type="button" disabled={first} onClick={() => onMove(-1)} className="rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-30" aria-label="上移">
          <ArrowUp className="size-4" />
        </button>
        <button type="button" disabled={last} onClick={() => onMove(1)} className="rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-30" aria-label="下移">
          <ArrowDown className="size-4" />
        </button>
      </>}
      <button type="button" onClick={onVisible} className="flex items-center gap-2 rounded-md text-left outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]" title={field.visible ? "隐藏该字段" : "显示该字段"}>
        {field.visible ? <Eye className="size-4 text-foreground" /> : <EyeOff className="size-4 text-muted-foreground" />}
        <span className={`text-sm ${field.visible ? "" : "text-muted-foreground"}`}>{label}</span>
      </button>
      {custom && <Badge variant="outline">自定义</Badge>}
      {custom && (
        <button type="button" onClick={onRemoveCustom} className="rounded-md text-muted-foreground outline-none hover:text-destructive focus-visible:border-destructive focus-visible:ring-destructive/50 focus-visible:ring-[3px]" aria-label="删除自定义字段">
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}
