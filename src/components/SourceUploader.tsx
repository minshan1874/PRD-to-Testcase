import { useCallback, useRef, useState } from "react";
import { AlarmClock, FileText, Image as ImageIcon, Loader2, Trash2, UploadCloud, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store";
import type { SourceItem } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { LIMITS } from "@/lib/limits";
import { cn, formatBytes } from "@/lib/utils";

/** 需求文档上传。pool 决定写入/读取哪个独立输入池，实现各功能输入隔离。 */
export default function SourceUploader({ pool }: { pool: "prereview" | "review" }) {
  const store = useStore();
  const isPrereview = pool === "prereview";
  const sources = isPrereview ? store.prereviewSources : store.reviewSources;
  const addFiles = isPrereview ? store.prereviewAddFiles : store.reviewAddFiles;
  const removeSource = isPrereview ? store.prereviewRemoveSource : store.reviewRemoveSource;
  const clearSources = isPrereview ? store.prereviewClearSources : store.reviewClearSources;
  const setForceAsImage = isPrereview ? store.prereviewSetForceAsImage : store.reviewSetForceAsImage;

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
    <div className="space-y-4">
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
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "group flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all",
          dragOver
            ? "border-primary bg-primary/5 shadow-[0_0_0_4px_oklch(0.6_0.12_255/0.15)]"
            : "border-border hover:border-primary/60 hover:bg-primary/[0.03]"
        )}
      >
        <div className={cn("flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform", dragOver ? "translate-y-0" : "group-hover:-translate-y-1")}>
          <UploadCloud className="size-5" />
        </div>
        <p className="text-sm font-medium">点击选择或拖拽文件到此处</p>
        <p className="text-xs text-muted-foreground">支持 PDF / DOCX / MD / TXT / PNG / JPG / WEBP，可多选</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.md,.markdown,.txt,.png,.jpg,.jpeg,.webp,.tiff,.tif"
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
            <p className="text-sm font-medium">输入池（<span className="font-mono text-xs">{successCount}</span> 个解析成功）</p>
            <ButtonGhostClear onClick={clearSources} />
          </div>
          {sources.map((s) => (
            <SourceRow
              key={s.id}
              item={s}
              onRemove={() => removeSource(s.id)}
              onForcedChange={(v) => setForceAsImage(s.id, v)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant={totalChars > LIMITS.maxTextChars ? "destructive" : totalChars > LIMITS.warnTextChars ? "warning" : "secondary"}>
          文本 <span className="font-mono">{totalChars.toLocaleString()} / {LIMITS.maxTextChars.toLocaleString()}</span> 字符
        </Badge>
        <Badge variant={imageCount + scanImages > LIMITS.maxImages ? "destructive" : "secondary"}>
          图片 <span className="font-mono">{imageCount + scanImages} / {LIMITS.maxImages}</span> 张
          {scanImages > 0 && <>（含扫描页 <span className="font-mono">{scanImages}</span>）</>}
        </Badge>
      </div>
    </div>
  );
}

function ButtonGhostClear({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground">
      <Trash2 className="size-3.5" /> 清空
    </button>
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
          <span className="font-mono">{formatBytes(item.size)}</span>
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