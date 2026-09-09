import { useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  FileSearch,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store";
import type { PrereviewConclusion, PrereviewResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import SourceUploader from "@/components/SourceUploader";

const RULE_SETS = [
  { value: "默认规则", label: "默认规则" },
  { value: "安全合规校验", label: "安全合规校验" },
  { value: "研发可行性校验", label: "研发可行性校验" },
  { value: "业务完整性校验", label: "业务完整性校验" },
] as const;

const CONCLUSION_META: Record<
  PrereviewConclusion,
  { label: string; variant: "destructive" | "warning" | "success"; dot: string }
> = {
  驳回: { label: "AI建议驳回", variant: "destructive", dot: "bg-red-500" },
  补充材料: { label: "需要补充材料", variant: "warning", dot: "bg-amber-500" },
  通过: { label: "通过AI预审", variant: "success", dot: "bg-emerald-500" },
};

const SEVERITY_META: Record<string, { label: string; variant: "destructive" | "warning" | "secondary" | "default" | "success"; className?: string }> = {
  高: { label: "高", variant: "destructive" },
  中: { label: "中", variant: "warning" },
  低: { label: "低", variant: "secondary" },
  通过: { label: "通过", variant: "success", className: "bg-emerald-600 text-white" },
};

function SeverityBadge({ level }: { level: string }) {
  const meta = SEVERITY_META[level] ?? SEVERITY_META.低;
  return (
    <Badge variant={meta.variant as "destructive" | "warning" | "secondary"} className={meta.className}>
      {meta.label}
    </Badge>
  );
}

const CHECK_ICONS = [
  { icon: ClipboardList, tint: "bg-sky-500/10 text-sky-600" },
  { icon: ShieldCheck, tint: "bg-violet-500/10 text-violet-600" },
  { icon: FileSearch, tint: "bg-orange-500/10 text-orange-600" },
  { icon: FileSearch, tint: "bg-sky-500/10 text-sky-600" },
];

function orderedRoles(result: PrereviewResult): PrereviewResult["roleQuestions"] {
  return [
    ...result.roleQuestions.filter((r) => r.role === "测试工程师"),
    ...result.roleQuestions.filter((r) => r.role !== "测试工程师"),
  ];
}

function buildReportText(result: PrereviewResult, ruleSet: string): string {
  const lines: string[] = [];
  lines.push("AI 需求预审报告");
  lines.push("=".repeat(40));
  lines.push(`预审规则集：${ruleSet}`);
  lines.push(`结论：${CONCLUSION_META[result.conclusion].label}`);
  lines.push(`AI综合评分：${result.score}/100`);
  lines.push(`预审摘要：${result.summary}`);
  lines.push("");
  lines.push("一、分项校验结果");
  result.checks.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.dimension}【${c.riskLevel}】`);
    lines.push(`   AI分析：${c.analysis}`);
    lines.push(`   建议：${c.suggestion || "—"}`);
  });
  lines.push("");
  lines.push("二、逐条问题清单");
  if (result.issues.length === 0) {
    lines.push("（无）");
  } else {
    result.issues.forEach((it) => {
      const flag = it.needConfirmation ? "【需要人工会议确认】" : "";
      lines.push(`${it.id || "-"} [${it.severity}] ${it.location}：${it.description}${flag}`);
      lines.push(`   修改建议：${it.suggestion || "—"}`);
    });
  }
  lines.push("");
  lines.push("三、三角色评审会议提问");
  orderedRoles(result).forEach((r) => {
    lines.push(`【${r.role}】`);
    r.questions.forEach((q, qi) => lines.push(`  ${qi + 1}. ${q}`));
  });
  lines.push("");
  lines.push(`使用模型：${result.modelUsed || "—"}`);
  return lines.join("\n");
}

function ResultDetail({ result }: { result: PrereviewResult }) {
  const store = useStore();
  const meta = CONCLUSION_META[result.conclusion];
  const [copied, setCopied] = useState(false);
  const ruleSet = store.prereviewRuleSet ?? "默认规则";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildReportText(result, ruleSet));
      setCopied(true);
      toast.success("完整报告已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败，请手动选择文本");
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部信息栏 */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-mono text-[11px] tracking-wide text-muted-foreground">
                预审时间：{new Date().toLocaleString("zh-CN", { hour12: false })}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span className={cn("size-2 rounded-full", meta.dot)} />
                  {meta.label}
                </span>
                <span className="text-xs text-muted-foreground">评分 {result.score}/100</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 模块1：AI预审总览 */}
      <Card>
        <CardHeader>
          <CardTitle>AI 预审总览</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-2xl border bg-muted/30">
              <span className="font-display text-2xl font-semibold tabular-nums">{result.score}</span>
              <span className="text-[10px] text-muted-foreground">综合评分</span>
            </div>
            <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm leading-relaxed">
              {result.summary}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => store.clearPrereview()}>
              <RotateCcw className="size-4" /> 返回修改需求
            </Button>
            <Button variant="outline" size="sm" onClick={() => store.runPrereview()}>
              <RefreshCw className="size-4" /> 重新执行AI预审
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 模块2：分项校验结果 */}
      <Card>
        <CardHeader>
          <CardTitle>分项 AI 校验结果</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(result.checks.length > 0
            ? result.checks
            : [
                { dimension: "信息完整性校验", riskLevel: "通过", analysis: "无", suggestion: "" },
                { dimension: "合规&风险校验", riskLevel: "通过", analysis: "无", suggestion: "" },
                { dimension: "研发可行性初判", riskLevel: "通过", analysis: "无", suggestion: "" },
                { dimension: "需求清晰度校验", riskLevel: "通过", analysis: "无", suggestion: "" },
              ]
          ).map((c, i) => {
            const Icon = CHECK_ICONS[i % CHECK_ICONS.length].icon;
            return (
              <div key={c.dimension} className="flex gap-3 rounded-lg border bg-background p-4">
                <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", CHECK_ICONS[i % CHECK_ICONS.length].tint)}>
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{c.dimension}</span>
                    <Badge variant={c.riskLevel === "通过" ? "success" : c.riskLevel === "高" ? "destructive" : c.riskLevel === "中" ? "warning" : "secondary"}>
                      风险：{String(c.riskLevel)}
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">AI分析：</span>
                    {c.analysis}
                  </p>
                  {c.suggestion && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">建议：</span>
                      {c.suggestion}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 模块3：完整报告（问题清单 + 三角色提问） */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>AI 预审完整报告</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <CheckCircle2 className="size-4" /> : <Copy className="size-4" />}
              {copied ? "已复制" : "复制"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Download className="size-4" /> 导出PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 逐条问题清单 */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">逐条问题清单</h3>
            {result.issues.length === 0 ? (
              <p className="rounded-md bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">
                未发现问题。
              </p>
            ) : (
              <div className="divide-y rounded-lg border">
                {result.issues.map((it) => (
                  <div key={it.id} className="space-y-1.5 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{it.id || "•"}</span>
                      <SeverityBadge level={it.severity} />
                      <span className="text-sm font-medium">{it.location}</span>
                      {it.needConfirmation && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700">
                          需要人工会议确认
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{it.description}</p>
                    {it.suggestion && (
                      <p className="text-sm leading-relaxed">
                        <span className="font-medium">修改建议：</span>
                        {it.suggestion}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 三角色提问 */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">三角色评审会议提问</h3>
            <div className="grid gap-3 md:grid-cols-3">
              {orderedRoles(result).map((r) => (
                <div key={r.role} className="rounded-lg border bg-muted/20 p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                    <SparkleIcon />
                    {r.role}
                  </div>
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                    {r.questions.map((q, i) => (
                      <li key={i} className="leading-relaxed">{q}</li>
                    ))}
                  </ol>
                </div>
              ))}
              {result.roleQuestions.length === 0 && (
                <p className="text-sm text-muted-foreground">无角色提问。</p>
              )}
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function SparkleIcon() {
  return <span className="text-primary">✦</span>;
}

export default function PreReview() {
  const store = useStore();
  const { prereviewSources, prereviewPhase, prereviewResult, prereviewError, prereviewRuleSet, setPrereviewRuleSet } = store;
  const busy = prereviewPhase === "requesting" || prereviewPhase === "validating";

  const active = prereviewSources.filter((s) => s.status === "success");

  return (
    <div className="min-h-0">
      {/* 页面头部 */}
      <div className="mb-5">
        <h1 className="font-display text-xl font-semibold tracking-tight">AI 需求预审</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          需求提报之后、人工评审之前，由 AI 做前置预审，过滤明显不合规、信息残缺、风险类需求，输出预审报告供参考。
        </p>
      </div>

      {prereviewResult ? (
        <ResultDetail result={prereviewResult} />
      ) : (
        <div className="space-y-6">
          {/* 需求基础信息：上传需求文档 */}
          <Card>
            <CardHeader>
              <CardTitle>需求基础信息</CardTitle>
            </CardHeader>
            <CardContent>
              <SourceUploader pool="prereview" />
            </CardContent>
          </Card>

          {/* AI 预审操作区 */}
          <Card>
            <CardHeader>
              <CardTitle>AI 预审操作区</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-40">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">预审规则集</span>
                  <Select value={prereviewRuleSet} onValueChange={setPrereviewRuleSet}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="选择规则模板" />
                    </SelectTrigger>
                    <SelectContent>
                      {RULE_SETS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={busy || active.length === 0}
                  onClick={() => store.runPrereview()}
                  className="h-9"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  {busy
                    ? prereviewPhase === "validating"
                      ? "校验结构化输出中…"
                      : "AI正在解析需求文档、校验规则、识别风险点…"
                    : "启动AI预审"}
                </Button>
                {busy && (
                  <Button variant="outline" onClick={() => store.cancelPrereview()}>
                    取消
                  </Button>
                )}
              </div>

              <div className="mt-4 rounded-lg bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                读取当前需求全部表单与附件（共 {active.length} 份）执行 AI 推理。预审完成后可复制完整报告或导出 PDF。
              </div>

              {prereviewError && (
                <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {prereviewError}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

