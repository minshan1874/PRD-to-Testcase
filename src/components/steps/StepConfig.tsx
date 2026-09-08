import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Check, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import type { FieldConfig, FieldDef } from "@/types";
import { BUILTIN_FIELDS } from "@/fieldSpec";
import { useStore } from "@/store";
import { effectiveCapabilities } from "@/lib/models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import HelpTip from "@/components/HelpTip";

export default function StepConfig() {
  const store = useStore();
  const { config } = store;
  const [customName, setCustomName] = useState("");
  const [sortingFields, setSortingFields] = useState(false);

  const cap = effectiveCapabilities(config.model, store.models.find((m) => m.id === config.model));
  const hasImages = store.sources.some((s) => s.kind === "image" || (s.pageImages && s.pageImages.length > 0));
  const hasInput = store.sources.some((s) => s.status === "success");
  const isGenerating = store.phase === "requesting" || store.phase === "validating" || store.phase === "repairing";

  return (
    <div className="space-y-6">
      {/* 字段配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex flex-col items-start gap-0.5">
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

      <div className="space-y-2 pt-1">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            disabled={!hasInput || !config.model.trim() || isGenerating}
            onClick={() => {
              if (!config.model.trim()) {
                toast.error("请先在侧边栏选择模型");
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
            {!hasInput ? "请先上传文档" : isGenerating ? "生成中…" : store.phase === "done" ? "重新生成" : "开始生成"}
            {hasInput && config.model.trim() && !isGenerating && <ArrowRight className="size-4" />}
          </Button>
        </div>
        <p className="text-right text-xs text-muted-foreground">点击开始生成后，下方会展示生成进度；生成完成后可在下方使用「AI 评审用例」对生成的用例进行二次评审。</p>
      </div>
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
