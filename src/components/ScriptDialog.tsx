import { useEffect, useRef, useState } from "react";
import { Check, Clipboard, FileCode2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { generateScriptRequest } from "@/lib/api";
import { useStore } from "@/store";
import type { TestCase } from "@/types";
import ScriptHighlight from "@/components/ScriptHighlight";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ScriptStatus = "idle" | "loading" | "done" | "error";

const STATUS_MESSAGES = [
  "正在解析用例步骤…",
  "正在映射 Robot 关键字…",
  "正在生成断言…",
];

function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:robotframework|robot|text)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

export interface ScriptDialogProps {
  testCase: TestCase | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ScriptDialog({ testCase, open, onOpenChange }: ScriptDialogProps) {
  const model = useStore((s) => s.config.model);
  const apiKey = useStore((s) => s.config.apiKey);
  const [status, setStatus] = useState<ScriptStatus>("idle");
  const [script, setScript] = useState("");
  const [error, setError] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");
  const [usedModel, setUsedModel] = useState("");
  const [statusIndex, setStatusIndex] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  async function generateScript() {
    const requestId = ++requestIdRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("loading");
    setStatusIndex(0);
    setScript("");
    setError("");
    setGeneratedAt("");

    if (!testCase) {
      setStatus("error");
      setError("没有选中的测试用例");
      return;
    }
    if (!model.trim()) {
      setStatus("error");
      setError("请先在侧边栏选择模型");
      return;
    }

    try {
      const response = await generateScriptRequest(testCase, {
        model,
        apiKey: apiKey || undefined,
        signal: controller.signal,
      });
      if (requestId !== requestIdRef.current) return;
      const content = stripCodeFences(response.content);
      if (!content) throw new Error("模型未返回脚本内容");
      setScript(content);
      setUsedModel(response.model || model);
      setGeneratedAt(new Date().toLocaleString("zh-CN", { hour12: false }));
      setStatus("done");
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      setStatus("error");
      setError(err instanceof Error ? err.message : "脚本生成失败");
    }
  }

  useEffect(() => {
    if (!open) {
      requestIdRef.current += 1;
      controllerRef.current?.abort();
      return;
    }
    void generateScript();
    return () => controllerRef.current?.abort();
    // 当前用例打开或切换用例时重新生成；模型配置变化也应使用新模型生成。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, testCase?.id, model, apiKey]);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setInterval(() => {
      setStatusIndex((index) => (index + 1) % STATUS_MESSAGES.length);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [status]);

  async function copyScript() {
    if (!script) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("当前浏览器不支持剪贴板操作");
      await navigator.clipboard.writeText(script);
      toast.success("脚本已复制");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "复制失败，请手动复制");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            <FileCode2 className="size-5 text-primary" />
            转换为自动化测试脚本
            <Badge variant="outline">Robot Framework WebUI</Badge>
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {testCase?.id} · {testCase?.title}
          </DialogDescription>
        </DialogHeader>

        {status === "loading" && (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-md border bg-muted/20 text-center">
            <Loader2 className="size-10 animate-spin text-primary" />
            <p className="text-sm font-medium" aria-live="polite">{STATUS_MESSAGES[statusIndex]}</p>
            <p className="text-xs text-muted-foreground">正在根据当前手工用例生成可编辑的 WebUI 脚本骨架</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => void generateScript()}>
              <RefreshCw className="size-4" /> 重试
            </Button>
          </div>
        )}

        {status === "done" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>脚本仅为骨架，请按实际页面补充 URL 与元素定位符。</span>
              <Button variant="outline" size="sm" onClick={() => void copyScript()}>
                <Clipboard className="size-4" /> 复制脚本
              </Button>
            </div>
            <ScriptHighlight code={script} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Check className="size-3.5 text-emerald-600" />生成时间：{generatedAt}</span>
              <span>模型：<span className="font-mono">{usedModel}</span></span>
            </div>
          </div>
        )}

        <DialogFooter>
          {status === "done" && (
            <Button variant="outline" onClick={() => void generateScript()}>
              <RefreshCw className="size-4" /> 重新生成
            </Button>
          )}
          <Button variant={status === "done" ? "default" : "outline"} onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
