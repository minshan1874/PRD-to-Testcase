import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bug,
  Crosshair,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store";
import type { BugAnalyseResult } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn, scrollElementToStart } from "@/lib/utils";
import * as UTIF from "utif";

const MAX_CHARS = 8000;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/tiff", "image/tif"];
const TIFF_EXT = ["tiff", "tif"];

const PROBLEM_TYPE_META: Record<string, { color: string }> = {
  "JS异常": { color: "bg-red-500/10 text-red-700 border-red-200" },
  "接口请求异常": { color: "bg-orange-500/10 text-orange-700 border-orange-200" },
  "渲染样式异常": { color: "bg-pink-500/10 text-pink-700 border-pink-200" },
  "网络&跨域": { color: "bg-purple-500/10 text-purple-700 border-purple-200" },
  "环境兼容": { color: "bg-blue-500/10 text-blue-700 border-blue-200" },
  "其他": { color: "bg-gray-500/10 text-gray-700 border-gray-200" },
};

const BELONG_META: Record<string, { color: string }> = {
  "前端": { color: "bg-sky-500/10 text-sky-700 border-sky-200" },
  "后端服务": { color: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  "网络网关": { color: "bg-violet-500/10 text-violet-700 border-violet-200" },
  "浏览器环境": { color: "bg-amber-500/10 text-amber-700 border-amber-200" },
  "无法确定，信息不足": { color: "bg-gray-500/10 text-gray-700 border-gray-200" },
};

export default function BugAnalyse() {
  const {
    bugText,
    setBugText,
    bugImage,
    setBugImage,
    bugPhase,
    bugError,
    bugResult,
    runBugAnalyse,
    cancelBugAnalyse,
    clearBugAnalyse,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chars = bugText.length;
  const overLimit = chars > MAX_CHARS;
  const hasInput = bugText.trim().length > 0 || Boolean(bugImage);
  const canRun = hasInput && !overLimit && bugPhase !== "requesting" && bugPhase !== "validating";
  const busy = bugPhase === "requesting" || bugPhase === "validating";

  // 评审完成：自动滚动到结果
  const prevPhase = useRef(bugPhase);
  useEffect(() => {
    if (bugPhase === "done" && prevPhase.current !== "done" && bugResult) {
      const el = document.getElementById("bug-result");
      if (el) scrollElementToStart(el);
    }
    prevPhase.current = bugPhase;
  }, [bugPhase, bugResult]);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isTiff = TIFF_EXT.includes(ext);
      if (!ALLOWED_IMAGE_TYPES.includes(file.type) && !isTiff) {
        toast.error("仅支持 PNG / JPG / TIFF 格式的图片");
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        toast.error("图片大小不能超过 5MB");
        return;
      }
      if (isTiff) {
        // TIFF 浏览器不原生支持，需解码后转 PNG
        file
          .arrayBuffer()
          .then((buffer) => {
            const ifds = UTIF.decode(buffer);
            if (!ifds || ifds.length === 0) throw new Error("TIFF 解码失败");
            const ifd = ifds[0];
            UTIF.decodeImage(buffer, ifd);
            const rgba = UTIF.toRGBA8(ifd);
            const canvas = document.createElement("canvas");
            canvas.width = ifd.width;
            canvas.height = ifd.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("画布创建失败");
            const imgData = new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height);
            ctx.putImageData(imgData, 0, 0);
            const dataUrl = canvas.toDataURL("image/png");
            setBugImage({ dataUrl, fileName: file.name });
          })
          .catch(() => toast.error("TIFF 图片读取失败"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setBugImage({ dataUrl, fileName: file.name });
      };
      reader.onerror = () => toast.error("图片读取失败");
      reader.readAsDataURL(file);
    },
    [setBugImage]
  );

  // 粘贴图片
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleFile(file);
          return;
        }
      }
    };
    ta.addEventListener("paste", handlePaste as EventListener);
    return () => ta.removeEventListener("paste", handlePaste as EventListener);
  }, [handleFile]);

  const isFileDrag = (event: React.DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const handleClear = () => {
    clearBugAnalyse();
    toast.info("已清空输入与结果");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">Bug 分析</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          粘贴报错日志、接口返回、异常堆栈，或上传报错截图，AI 快速给出问题定位与排查建议（AI 推测，仅供参考）。
        </p>
      </div>

      {/* 输入区 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
            <Bug className="size-4 text-primary" /> 输入信息
          </CardTitle>
          <CardDescription>支持粘贴文本和上传截图；Ctrl+V 可直接粘贴截图。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              ref={textareaRef}
              value={bugText}
              onChange={(e) => setBugText(e.target.value)}
              placeholder="粘贴 Console 报错、接口返回、异常堆栈、问题描述…"
              className="min-h-[180px] resize-y font-mono text-xs leading-relaxed"
              disabled={busy}
            />
            <div className="flex items-center justify-between text-xs">
              <span className={cn(chars > 0 && overLimit ? "text-destructive" : "text-muted-foreground")}>
                <span className="font-mono">{chars.toLocaleString()}</span> / {MAX_CHARS.toLocaleString()} 字符
              </span>
              {overLimit && <span className="text-destructive">内容超出字符上限</span>}
            </div>
          </div>

          {/* 图片上传 */}
          {bugImage ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">上传的截图</div>
              <div className="relative inline-block">
                <img
                  src={bugImage.dataUrl}
                  alt={bugImage.fileName}
                  className="max-h-48 rounded-md border object-contain shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setBugImage(null)}
                  className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-destructive hover:text-white"
                  aria-label="移除图片"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{bugImage.fileName}</p>
            </div>
          ) : (
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
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = Array.from(e.dataTransfer.files)[0];
                handleFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={cn(
                "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-6 text-center transition-all",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/60 hover:bg-primary/[0.03]"
              )}
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UploadCloud className="size-5" />
              </div>
              <p className="text-sm font-medium">点击上传或拖拽截图到此处</p>
              <p className="text-xs text-muted-foreground">支持 PNG / JPG / TIFF，单张 ≤ 5MB；也可在输入框中 Ctrl+V 粘贴</p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button disabled={!canRun} onClick={() => void runBugAnalyse()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy
                ? bugPhase === "validating"
                  ? "校验结果中…"
                  : "AI 分析中…"
                : !hasInput
                ? "请先输入内容"
                : overLimit
                ? "内容超限"
                : "开始 AI 分析"}
            </Button>
            {busy && (
              <Button variant="outline" onClick={cancelBugAnalyse}>
                <Square className="size-4" /> 取消
              </Button>
            )}
            <Button variant="outline" onClick={handleClear} disabled={busy}>
              <RotateCcw className="size-4" /> 清空
            </Button>
          </div>

          {/* 错误提示 */}
          {bugPhase === "error" && bugError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {bugError}
            </div>
          )}
          {bugPhase === "ocr_empty" && bugError && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{bugError}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 结果展示区 */}
      {bugPhase === "done" && bugResult && (
        <BugResultCard result={bugResult} />
      )}

      {/* 进行中状态 */}
      {busy && (
        <Card className="border-primary/30">
          <CardContent className="flex items-center gap-3 py-6">
            <Loader2 className="size-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">
                {bugPhase === "requesting" ? "AI 正在分析问题…" : "正在校验分析结果…"}
              </p>
              <p className="text-xs text-muted-foreground">
                文本分析约 3-7 秒，图片分析约 8-15 秒，请稍候
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BugResultCard({ result }: { result: BugAnalyseResult }) {
  const ptMeta = PROBLEM_TYPE_META[result.problemType] ?? PROBLEM_TYPE_META["其他"];
  const bMeta = BELONG_META[result.belong] ?? BELONG_META["无法确定，信息不足"];

  return (
    <Card id="bug-result" className="border-emerald-200/60">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <CardTitle className="font-display text-base font-semibold tracking-tight">AI 分析结果</CardTitle>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn("border", ptMeta.color)}>
            <Bug className="mr-1 size-3" />
            {result.problemType}
          </Badge>
          <Badge variant="outline" className={cn("border", bMeta.color)}>
            归属：{result.belong}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 根因推测 */}
        <div className="relative overflow-hidden rounded-md border bg-muted/30 p-3 pl-4 text-sm">
          <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-rose-400 to-orange-500" />
          <div className="mb-1 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">01 · 根因推测</div>
          <p className="whitespace-pre-wrap leading-relaxed">{result.reason}</p>
        </div>

        {/* 排查建议 */}
        <div className="space-y-2">
          <div className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
            02 · 排查建议（<span className="font-mono">{result.suggest.length}</span> 步）
          </div>
          <ol className="space-y-2">
            {result.suggest.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-md border bg-card p-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-medium text-primary">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* 可疑关注点 */}
        <div className="space-y-2">
          <div className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground">03 · 可疑关注点</div>
          <div className="flex items-start gap-2 rounded-md border border-violet-200/60 bg-violet-50/50 px-3 py-2.5 text-sm">
            <Crosshair className="mt-0.5 size-4 shrink-0 text-violet-600" />
            <span className="leading-relaxed text-violet-900">{result.focusPoint}</span>
          </div>
        </div>

        {/* Bug 回归建议（无内容时整体隐藏） */}
        {result.regressionAdvice &&
          (result.regressionAdvice.regressionSteps.length > 0 ||
            result.regressionAdvice.verifyPoint.length > 0 ||
            result.regressionAdvice.compatibleScope ||
            result.regressionAdvice.riskTip) && (
            <div className="space-y-4 border-t pt-4">
              <div className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
                04 · Bug回归建议
              </div>

              {/* 回归操作步骤 */}
              {result.regressionAdvice.regressionSteps.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">回归操作步骤</div>
                  <ol className="space-y-2">
                    {result.regressionAdvice.regressionSteps.map((step, i) => (
                      <li key={i} className="flex gap-3 rounded-md border bg-card p-3 text-sm">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 font-mono text-xs font-medium text-emerald-600">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* 验证检查点 */}
              {result.regressionAdvice.verifyPoint.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    验证检查点（修复通过需满足以下条件）
                  </div>
                  <ul className="space-y-1.5">
                    {result.regressionAdvice.verifyPoint.map((v, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                        <span className="mt-0.5 size-4 shrink-0 rounded-sm border border-emerald-400/60 bg-emerald-50 text-[10px] leading-4 text-emerald-600 flex items-center justify-center font-mono">
                          ✓
                        </span>
                        <span className="flex-1 leading-relaxed">{v}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 兼容回归覆盖范围 */}
              {result.regressionAdvice.compatibleScope && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">兼容回归覆盖范围</div>
                  <div className="rounded-md border border-sky-200/60 bg-sky-50/50 px-3 py-2.5 text-sm text-sky-900">
                    {result.regressionAdvice.compatibleScope}
                  </div>
                </div>
              )}

              {/* 回归风险提示 */}
              {result.regressionAdvice.riskTip && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200/60 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <span className="leading-relaxed">{result.regressionAdvice.riskTip}</span>
                </div>
              )}
            </div>
          )}
      </CardContent>
    </Card>
  );
}
