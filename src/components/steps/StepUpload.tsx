import { useCallback, useRef, useState } from "react";
import { AlarmClock, FileText, Image as ImageIcon, Loader2, Trash2, UploadCloud, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store";
import type { SourceItem } from "@/types";
import { LIMITS } from "@/lib/limits";
import { formatBytes } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export default function StepUpload() {
  const sources = useStore((s) => s.sources);
  const addFiles = useStore((s) => s.addFiles);
  const removeSource = useStore((s) => s.removeSource);
  const clearSources = useStore((s) => s.clearSources);
  const setForceAsImage = useStore((s) => s.setForceAsImage);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const isFileDrag = (event: React.DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const onFiles = useCallback(
    async (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const files = Array.from(list);
      if (files.length > 10) {
        toast.error("一次最多上传 10 个文件");
        return;
      }
      await addFiles(files);
    },
    [addFiles]
  );

  const totalChars = sources
    .filter((x) => x.kind !== "image" && x.status === "success")
    .reduce((n, x) => n + ((x.text?.length ?? 0) + (x.pageImages?.length ?? 0) * 2), 0);
  const imageCount = sources.filter((x) => x.kind === "image").length;
  const scanImages = sources.reduce((n, x) => n + (x.pageImages?.length ?? 0), 0);
  const successCount = sources.filter((x) => x.status === "success").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            上传 PRD 文档
          </CardTitle>
          <CardDescription>
            单文件 ≤ {formatBytes(LIMITS.maxFileBytes, 0)}；扫描 PDF 最多转 {LIMITS.maxScanPages} 页图片。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
                role="button"
                tabIndex={0}
                onDragEnter={(e) => {
                  if (!isFileDrag(e)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  if (!isFileDrag(e)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  setDragOver(true);
                }}
                onDragLeave={(e) => {
                  // 拖过上传区域内部的图标/文字时不要提前取消高亮。
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setDragOver(false);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (isFileDrag(e)) void onFiles(e.dataTransfer.files);
                }}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
                )}
              >
                <UploadCloud className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">点击选择或拖拽文件到此处</p>
                <p className="text-xs text-muted-foreground">支持 PDF / DOCX / MD / TXT / PNG / JPG / WEBP，可多选</p>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.md,.markdown,.txt,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    onFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
          </div>

          {sources.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">输入池（{successCount} 个解析成功）</p>
                <Button variant="ghost" size="sm" onClick={clearSources}>
                  <Trash2 className="size-4" /> 清空
                </Button>
              </div>
              {sources.map((s) => (
                <SourceRow key={s.id} item={s} onRemove={() => removeSource(s.id)} onForcedChange={(v) => setForceAsImage(s.id, v)} />
              ))}
            </div>
          )}

          {/* 限制统计 */}
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant={totalChars > LIMITS.maxTextChars ? "destructive" : totalChars > LIMITS.warnTextChars ? "warning" : "secondary"}>
              文本 {totalChars.toLocaleString()} / {LIMITS.maxTextChars.toLocaleString()} 字符
            </Badge>
            <Badge variant={imageCount + scanImages > LIMITS.maxImages ? "destructive" : "secondary"}>
              图片 {imageCount + scanImages} / {LIMITS.maxImages} 张
              {scanImages > 0 && <>（含扫描页 {scanImages}）</>}
            </Badge>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}

function SourceRow({
  item,
  onRemove,
  onForcedChange,
}: {
  item: SourceItem;
  onRemove: () => void;
  onForcedChange: (v: boolean) => void;
}) {
  const isImage = item.kind === "image";
  const overSizedChars = (item.text?.length ?? 0) > LIMITS.maxTextChars;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm">
      {item.status === "parsing" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      {item.status === "success" && !isImage && <FileText className="size-4 text-emerald-600" />}
      {item.status === "success" && isImage && <ImageIcon className="size-4 text-emerald-600" />}
      {item.status === "error" && <XCircle className="size-4 text-destructive" />}

      <span className="min-w-0 flex-1 truncate">{item.name}</span>

      {item.status === "success" && (
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{formatBytes(item.size)}</span>
          {item.kind === "pdf" && <Badge variant="outline">PDF · {item.pages ?? "-"} 页</Badge>}
          {isImage && <Badge variant="outline">图片</Badge>}
          {typeof item.text?.length === "number" && item.kind !== "image" && (
            <Badge variant={overSizedChars ? "destructive" : "outline"}>
              {item.text?.length.toLocaleString()} 字符
            </Badge>
          )}
          {item.pageImages && item.pageImages.length > 0 && (
            <Badge variant="outline">{item.pageImages.length} 页转图</Badge>
          )}
          {item.kind === "pdf" && item.pageImages && item.pageImages.length > 0 && (
            <label className="flex cursor-pointer items-center gap-1.5">
              强制按图片发送
              <Switch checked={item.forceAsImage ?? false} onCheckedChange={onForcedChange} aria-label="强制按图片发送" />
            </label>
          )}
        </span>
      )}

      {item.status === "error" && (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlarmClock className="size-3.5" /> {item.error}
        </span>
      )}
      {item.status === "success" && item.error && (
        <Badge variant="warning" className="text-xs">{item.error}</Badge>
      )}

      {item.status !== "parsing" && (
        <button type="button" onClick={onRemove} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive" aria-label="删除">
          <Trash2 className="size-4" /> 删除
        </button>
      )}
    </div>
  );
}
