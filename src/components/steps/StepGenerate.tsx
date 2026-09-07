import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Square, Wand2 } from "lucide-react";
import { useStore } from "@/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const GENERATION_STATUS_MESSAGES = [
  "正在分析需求结构…",
  "正在识别功能点与边界场景…",
  "正在组织可执行测试步骤…",
  "正在校验字段完整性…",
  "正在整理测试覆盖与风险…",
];

export default function StepGenerate() {
  const phase = useStore((s) => s.phase);
  const lastError = useStore((s) => s.lastError);
  const result = useStore((s) => s.result);
  const generate = useStore((s) => s.generate);
  const cancelGeneration = useStore((s) => s.cancelGeneration);
  const resetGeneration = useStore((s) => s.resetGeneration);
  const reviewPhase = useStore((s) => s.reviewPhase);
  const config = useStore((s) => s.config);
  const sources = useStore((s) => s.sources);
  const health = useStore((s) => s.health);
  const [statusIndex, setStatusIndex] = useState(0);

  const running = phase === "requesting" || phase === "validating" || phase === "repairing";
  const reviewing = reviewPhase === "requesting" || reviewPhase === "validating";
  const handleGoBack = () => {
    if (reviewing) {
      const ok = window.confirm("AI 评审正在进行中，离开当前页面将导致评审中断，且本次评审结果会丢失。确定要返回配置页吗？");
      if (!ok) return;
    }
    resetGeneration();
  };
  const textSources = sources.filter((s) => s.status === "success");
  const textChars = textSources.reduce((n, x) => n + (x.text?.length ?? 0), 0);
  const imgCount = sources.reduce((n, x) => n + (x.pageImages?.length ?? 0), 0) +
    sources.filter((x) => x.kind === "image").length;

  useEffect(() => {
    if (!running) {
      setStatusIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setStatusIndex((current) => (current + 1) % GENERATION_STATUS_MESSAGES.length);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [running]);

  return (
    <div className="space-y-6">
      <Card className={phase === "done" && result ? "animate-success-pulse" : "animate-fade-rise"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex flex-col items-start gap-0.5">
              <span className="eyebrow">03 · Generate</span>
              <span className="flex items-center gap-2">
                <span className="font-display text-base font-semibold tracking-tight">生成测试用例</span>
                <Badge variant="outline" className="font-mono">模型：{config.model || "未选择"}</Badge>
              </span>
            </span>
          </CardTitle>
          <CardDescription>
            输入：<span className="font-mono">{textSources.length}</span> 个文档（文本 <span className="font-mono">{textChars.toLocaleString()}</span> 字符，图片 <span className="font-mono">{imgCount}</span> 张）
            {health?.mock && <> · Mock 模式</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-56 flex-col items-center justify-center gap-4">
          {phase === "idle" && (
            <div className="flex flex-col items-center gap-3 text-center">
              <Wand2 className="size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">准备就绪，请完成配置后点击“开始生成”</p>
            </div>
          )}

          {running && (
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="size-10 animate-spin text-primary" />
              <p className="w-full truncate whitespace-nowrap text-center text-sm font-medium" aria-live="polite">
                {GENERATION_STATUS_MESSAGES[statusIndex]}
              </p>
              <p className="max-w-md text-xs text-muted-foreground">
                大型文档与图片输入耗时较长（最长 10 分钟），请耐心等待；期间请不要关闭页面。
              </p>
              <Button variant="outline" onClick={cancelGeneration}>
                <Square className="size-4" /> 停止生成
              </Button>
            </div>
          )}

          {phase === "error" && (
            <div className="flex flex-col items-center gap-3 text-center">
              <AlertTriangle className="size-10 text-destructive" />
              <p className="max-w-md text-sm text-destructive">{lastError}</p>
              <div className="flex gap-2">
                <Button onClick={() => generate()}>
                  <RefreshCw className="size-4" /> 重试
                </Button>
                <Button variant="outline" onClick={handleGoBack}>返回配置页</Button>
              </div>
            </div>
          )}

          {phase === "done" && result && (
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="size-10 text-emerald-600" />
              <p className="text-sm font-medium">
                生成完成：<span className="font-mono">{result.cases.length}</span> 条用例 · <span className="font-mono">{result.confirmations.length}</span> 项待确认 ·{" "}
                <span className="font-mono">{result.risksAndAssumptions.length}</span> 条风险/假设
              </p>
              <p className="text-xs text-muted-foreground">结果已显示在下方，可直接查看并导出。</p>
              <Button variant="outline" onClick={handleGoBack}>返回配置页</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
