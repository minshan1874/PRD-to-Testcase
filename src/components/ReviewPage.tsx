import { useEffect, useRef, useState } from "react";
import {
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
import type { TestCase } from "@/types";
import { exportCasesWorkbook, parseWorkbookFile } from "@/lib/excel";
import { scrollElementToStart } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import SourceUploader from "@/components/SourceUploader";
import { cn } from "@/lib/utils";

const SEVERITY_VARIANT: Record<string, "destructive" | "warning" | "outline"> = {
  高: "destructive",
  中: "warning",
  低: "outline",
};

export default function ReviewPage() {
  const store = useStore();
  const {
    sources,
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
  const excelInputRef = useRef<HTMLInputElement>(null);

  const busy = standalonePhase === "requesting" || standalonePhase === "validating";
  const prdReady = sources.some((s) => s.status === "success");
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
        <h1 className="font-display text-xl font-semibold tracking-tight">AI 用例评审</h1>
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
          <CardDescription>与生成测试用例 / 需求预审共用同一输入池，切换功能后内容保留。</CardDescription>
        </CardHeader>
        <CardContent>
          <SourceUploader />
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
            {standaloneResult.summary && (
              <div className="relative overflow-hidden rounded-md border bg-muted/30 p-3 pl-4 text-sm">
                <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-sky-400 to-indigo-500" />
                <div className="mb-1 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">01 · 评审总结</div>
                <p className="whitespace-pre-wrap">{standaloneResult.summary}</p>
              </div>
            )}

            {standaloneResult.highRiskNotes.length > 0 && (
              <div className="space-y-2">
                <div className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground">02 · 高风险点提醒（需人工重点确认）</div>
                {standaloneResult.highRiskNotes.map((note, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                    <Badge variant="destructive" className="shrink-0">高</Badge>
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="mb-2 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">03 · 问题清单（<span className="font-mono">{standaloneResult.issues.length}</span> 条）</div>
              {standaloneResult.issues.length === 0 ? (
                <div className="rounded-md border px-3 py-4 text-center text-sm text-muted-foreground">未发现问题，用例整体规范。</div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table className="min-w-max">
                    <TableHeader>
                      <TableRow>
                        <TableHead>用例编号</TableHead>
                        <TableHead>问题描述</TableHead>
                        <TableHead>严重等级</TableHead>
                        <TableHead>修改建议</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {standaloneResult.issues.map((item, i) => (
                        <TableRow key={i} className="align-top">
                          <TableCell className="whitespace-nowrap font-mono text-xs">{item.caseId || "-"}</TableCell>
                          <TableCell className="max-w-[360px] whitespace-pre-wrap">{item.issue}</TableCell>
                          <TableCell><Badge variant={SEVERITY_VARIANT[item.severity] ?? "outline"}>{item.severity}</Badge></TableCell>
                          <TableCell className="max-w-[360px] whitespace-pre-wrap">{item.suggestion}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">04 · 优化用例（<span className="font-mono">{standaloneResult.optimizedCases.length}</span> 条）</div>
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
  const v = (c as unknown as Record<string, unknown>)[key];
  return v === null || v === undefined ? "" : String(v);
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