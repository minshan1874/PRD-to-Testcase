import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store";
import type { ReviewIssue, ReviewResult, TestCase } from "@/types";
import { exportCasesWorkbook, parseWorkbookFile } from "@/lib/excel";
import { scrollElementToStart } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import SourceUploader from "@/components/SourceUploader";

export default function ReviewPage() {
  const store = useStore();
  const {
    reviewSources,
    config,
    standaloneExcel,
    setStandaloneExcel,
    standalonePhase,
    standaloneError,
    standaloneResult,
    runStandaloneReview,
    cancelStandaloneReview,
  } = store;

  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [optimizeOpen, setOptimizeOpen] = useState(true);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const busy = standalonePhase === "requesting" || standalonePhase === "validating";
  const prdReady = reviewSources.some((s) => s.status === "success");
  const excelReady = Boolean(standaloneExcel && standaloneExcel.cases.length > 0);

  // 评审完成：将结果模块从页面顶部开始展示
  const prevPhase = useRef(standalonePhase);
  useEffect(() => {
    if (standalonePhase === "done" && prevPhase.current !== "done" && standaloneResult) {
      const el = document.getElementById("review-page-result");
      if (el) scrollElementToStart(el);
    }
    prevPhase.current = standalonePhase;
  }, [standalonePhase, standaloneResult]);

  const isFileDrag = (event: React.DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const handleExcel = async (file: File | undefined) => {
    if (!file) return;
    const okType =
      /\.(xlsx|xlsm)$/i.test(file.name) || file.type.includes("spreadsheet");
    if (!okType) {
      toast.error("仅支持 .xlsx / .xlsm 格式的 Excel 用例文档");
      return;
    }
    setParsing(true);
    try {
      const parsed = await parseWorkbookFile(file);
      setStandaloneExcel(parsed);
      toast.success(`已解析 ${parsed.cases.length} 条测试用例`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "用例解析失败");
    } finally {
      setParsing(false);
    }
  };

  const canRun = prdReady && excelReady && Boolean(config.model) && !busy;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">用例评审</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          上传需求文档与测试用例 Excel，AI 对用例做预审评审（AI 初筛，业务正确性仍需人工复核），输出问题清单并生成优化版用例。
        </p>
      </div>

      {/* 需求文档 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
            <FileText className="size-4 text-primary" /> 需求文档（PRD）
          </CardTitle>
          <CardDescription>以下需求文档输入池独立，仅作用于本页 AI 用例评审，不会影响生成测试用例 / 需求预审的输入。</CardDescription>
        </CardHeader>
        <CardContent>
          <SourceUploader pool="review" />
        </CardContent>
      </Card>

      {/* 测试用例 Excel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
            <FileSpreadsheet className="size-4 text-primary" /> 测试用例 Excel
          </CardTitle>
          <CardDescription>支持 .xlsx / .xlsm，读取第一个工作表；标准列名（模块、标题、优先级、操作步骤、预期结果等）会被自动识别。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {standaloneExcel ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm">
              <FileSpreadsheet className="size-4 text-emerald-600" />
              <span className="min-w-0 flex-1 truncate">{standaloneExcel.fileName}</span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline"><span className="font-mono">{standaloneExcel.cases.length}</span> 条用例</Badge>
                <Badge variant="outline"><span className="font-mono">{standaloneExcel.columns.length}</span> 列</Badge>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setStandaloneExcel(null)}>
                <Trash2 className="size-4" /> 移除
              </Button>
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
                void handleExcel(file);
              }}
              onClick={() => excelInputRef.current?.click()}
              className={cn(
                "group flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all",
                dragOver
                  ? "border-primary bg-primary/5 shadow-[0_0_0_4px_oklch(0.6_0.12_255/0.15)]"
                  : "border-border hover:border-primary/60 hover:bg-primary/[0.03]"
              )}
            >
              {parsing ? (
                <Loader2 className="size-6 animate-spin text-primary" />
              ) : (
                <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <UploadCloud className="size-5" />
                </div>
              )}
              <p className="text-sm font-medium">{parsing ? "正在解析用例…" : "点击选择或拖拽 Excel 到此处"}</p>
              <p className="text-xs text-muted-foreground">仅支持 .xlsx / .xlsm，单个文件</p>
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={(e) => {
                  void handleExcel(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 操作区 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
            AI 评审操作区
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!canRun} onClick={() => void runStandaloneReview()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {!prdReady ? "请先上传需求文档" : !excelReady ? "请先上传用例 Excel" : busy ? (standalonePhase === "validating" ? "校验结构化输出中…" : "AI 评审中，可能需要数十秒…") : "开始评审"}
            </Button>
            {busy && (
              <Button variant="outline" onClick={cancelStandaloneReview}>
                <Square className="size-4" /> 取消
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {standaloneExcel && <span className="mr-3">待评审用例 <span className="font-mono">{standaloneExcel.cases.length}</span> 条</span>}
            评审会将需求与用例一并交给模型，输出整体总结、逐条问题清单与优化后的完整用例。评审期间请勿离开当前页面。
          </p>
          {standaloneError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {standaloneError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 评审完成状态 */}
      {standalonePhase === "done" && standaloneResult && (
        <Card id="review-page-result" className="border-emerald-200/60">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <CardTitle className="font-display text-base font-semibold tracking-tight">AI 评审结果</CardTitle>
              {standaloneResult.modelUsed && (
                <Badge variant="outline" className="font-mono">{standaloneResult.modelUsed}</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={doExportOptimized}>
                <FileDown className="size-4" /> 下载优化后的用例
              </Button>
              <Button variant="outline" size="sm" onClick={() => void runStandaloneReview()}>
                <RefreshCw className="size-4" /> 重新评审
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 模块1：评审总览摘要 */}
            <ReviewOverview result={standaloneResult} />

            {/* 模块2：阻断缺陷 */}
            <ReviewSection
              title="阻断缺陷"
              tag="🔴"
              badge="高优先级 · 需修复"
              badgeClass="bg-red-100 text-red-700"
              note="以下为阻断性缺陷，不修复会导致用例无法执行，必须处理。"
              items={standaloneResult.blockingIssues ?? []}
              emptyText="未发现阻断缺陷，用例均可执行。"
              ring="border-red-200"
            />

            {/* 模块3：待人工业务核验清单 */}
            <ReviewSection
              title="待人工业务核验清单"
              tag="🟠"
              badge="不属于用例缺陷"
              badgeClass="bg-amber-100 text-amber-700"
              note="不属于用例缺陷。AI 无法自动判定业务规则/环境边界，需要业务人员人工确认。"
              items={standaloneResult.manualIssues ?? []}
              emptyText="无需人工核验的业务项。"
              ring="border-amber-200"
              manual
            />

            {/* 模块4：可选优化建议（默认折叠） */}
            <OptimizeSection
              open={optimizeOpen}
              setOpen={setOptimizeOpen}
              items={standaloneResult.optimizeIssues ?? []}
              count={(standaloneResult.optimizeIssues ?? []).length}
            />

            {/* 优化后的用例 */}
            <div>
              <div className="mb-2 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
                优化用例（<span className="font-mono">{standaloneResult.optimizedCases.length}</span> 条）
              </div>
              <RaceTable cases={standaloneResult.optimizedCases} columns={standaloneExcel?.columns ?? []} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  async function doExportOptimized() {
    if (!standaloneResult || !standaloneExcel) return;
    try {
      await exportCasesWorkbook(standaloneResult.optimizedCases, standaloneExcel.columns, "优化版本");
      toast.success("已导出优化后的用例");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    }
  }
}

function cellValue(c: TestCase, key: string) {
  const raw = (c as unknown as Record<string, unknown>)[key];
  if (key === "steps" && Array.isArray(raw)) return raw.join("\n");
  return raw === null || raw === undefined ? "" : String(raw);
}

function CellContent({ c, field }: { c: TestCase; field: string }) {
  if (field === "steps" || field === "expected") {
    const steps = cellValue(c, field)
      .split("\n")
      .map((s) => s.trim().replace(/^\s*\d+\s*[.、)）:：]\s*/, ""))
      .filter(Boolean);
    if (steps.length === 0) return "";
    return (
      <div className="space-y-1">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-2">
            <span className="select-none font-mono text-xs text-muted-foreground/70">{i + 1}.</span>
            <span className="min-w-0 flex-1">{step}</span>
          </div>
        ))}
      </div>
    );
  }
  return <span className={field === "id" ? "font-mono text-xs" : "whitespace-pre-wrap"}>{cellValue(c, field)}</span>;
}

function RaceTable({
  cases,
  columns,
}: {
  cases: TestCase[];
  columns: { key: string; label: string }[];
}) {
  if (cases.length === 0) {
    return <div className="rounded-md border px-3 py-4 text-center text-sm text-muted-foreground">暂无优化用例。</div>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table className="min-w-max">
        <TableHeader>
          <TableRow>{columns.map((col) => <TableHead key={col.key} className="min-w-24 bg-muted/30">{col.label}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {cases.map((item, i) => (
            <TableRow key={i} className="align-top">
              {columns.map((col) => (
                <TableCell key={col.key} className="max-w-[360px] whitespace-pre-wrap align-top">
                  <CellContent c={item} field={col.key} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ReviewOverview({ result }: { result: ReviewResult }) {
  const stat = result.stat;
  const score = result.score ?? 100;
  const scoreText = result.scoreText;
  return (
    <div className="space-y-3">
      {/* 基础统计 + 质量评分 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <OverviewStat label="总用例数量" value={stat?.totalCases ?? result.optimizedCases.length} tone="default" />
        <OverviewStat label="阻断缺陷" value={stat?.blocking ?? 0} tone="red" />
        <OverviewStat label="待人工核验项" value={stat?.manual ?? 0} tone="amber" />
        <OverviewStat label="可选优化建议" value={stat?.optimize ?? 0} tone="gray" />
      </div>
      {typeof stat !== "undefined" && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-semibold">质量评分</span>
            <span className={cn("font-mono text-xl font-bold", score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-red-600")}>
              {score} 分
            </span>
            <span className="text-xs text-muted-foreground">基础 100 分：阻断缺陷每条 -10，优化建议每条 -2，待核验不扣分</span>
          </div>
          <p className="text-sm text-muted-foreground">{scoreText}</p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{result.summary}</p>
        </div>
      )}
      {result.highRiskNotes.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold tracking-wider text-muted-foreground">高风险点提醒（需人工重点确认）</div>
          {result.highRiskNotes.map((note, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
              <Badge variant="destructive" className="shrink-0">高</Badge>
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OverviewStat({ label, value, tone }: { label: string; value: number; tone: "default" | "red" | "amber" | "gray" }) {
  const toneClass: Record<string, string> = {
    default: "text-sky-700",
    red: "text-red-600",
    amber: "text-amber-600",
    gray: "text-slate-600",
  };
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-mono text-2xl font-bold", toneClass[tone])}>{value}</div>
    </div>
  );
}

function ReviewSection({
  title,
  tag,
  badge,
  badgeClass,
  note,
  items,
  emptyText,
  ring,
  manual,
}: {
  title: string;
  tag: string;
  badge: string;
  badgeClass: string;
  note: string;
  items: ReviewIssue[];
  emptyText: string;
  ring: string;
  manual?: boolean;
}) {
  return (
    <div className={cn("space-y-2 rounded-md border p-3", ring)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base">{tag}</span>
        <span className="font-semibold">{title}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", badgeClass)}>{badge}</span>
        {items.length > 0 && <span className="ml-auto font-mono text-xs text-muted-foreground">共 {items.length} 条</span>}
      </div>
      <p className="text-xs text-muted-foreground">{note}</p>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-3 text-center text-sm text-muted-foreground">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table className="min-w-max">
            <TableHeader>
              <TableRow>
                <TableHead>用例编号</TableHead>
                <TableHead>{manual ? "待核验描述" : "缺陷描述"}</TableHead>
                <TableHead>{manual ? "核验提示" : "修改建议"}</TableHead>
                <TableHead>置信度</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={i} className="align-top">
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {(item.caseIds ?? [item.caseId]).map((id, idx) => <div key={idx} className={idx > 0 ? "mt-0.5 text-muted-foreground/60" : ""}>{id || "-"}</div>)}
                  </TableCell>
                  <TableCell className="max-w-[360px] whitespace-pre-wrap">{item.issue}</TableCell>
                  <TableCell className="max-w-[360px] whitespace-pre-wrap">{item.suggestion}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {typeof item.confidence === "number" ? <span className={cn("font-mono", item.confidence >= 0.8 ? "text-red-600" : "text-muted-foreground")}>{Math.round(item.confidence * 100)}%</span> : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function OptimizeSection({
  open,
  setOpen,
  items,
  count,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  items: ReviewIssue[];
  count: number;
}) {
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full flex-wrap items-center gap-2 text-left"
      >
        <span className="text-base">🟡</span>
        <span className="font-semibold text-slate-600">可选优化建议</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">低优先级 · 按需修改</span>
        <span className="ml-auto flex items-center gap-2">
          {count > 0 && <span className="font-mono text-xs text-muted-foreground">共 {count} 条</span>}
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>
      <p className="text-xs text-muted-foreground">
        仅提升用例可读性，不影响用例执行，按需选择是否修改。
      </p>
      {open && (
        items.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-3 text-center text-sm text-muted-foreground">暂无优化建议。</div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-max">
              <TableHeader>
                <TableRow>
                  <TableHead>用例编号</TableHead>
                  <TableHead>优化描述</TableHead>
                  <TableHead>优化建议</TableHead>
                  <TableHead>置信度</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, i) => (
                  <TableRow key={i} className="align-top">
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {(item.caseIds ?? [item.caseId]).map((id, idx) => <div key={idx} className={idx > 0 ? "mt-0.5 text-muted-foreground/60" : ""}>{id || "-"}</div>)}
                    </TableCell>
                    <TableCell className="max-w-[360px] whitespace-pre-wrap">{item.issue}</TableCell>
                    <TableCell className="max-w-[360px] whitespace-pre-wrap">{item.suggestion}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{typeof item.confidence === "number" ? <span className="font-mono text-muted-foreground">{Math.round(item.confidence * 100)}%</span> : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}
    </div>
  );
}