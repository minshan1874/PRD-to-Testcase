import { useEffect, useRef, useState, type RefObject } from "react";
import { FileDown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store";
import { exportWorkbook, visibleColumns } from "@/lib/excel";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import { ModelSelect } from "@/components/ModelSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HelpTip from "@/components/HelpTip";
import type { TestCase } from "@/types";

export default function StepResults() {
  const result = useStore((s) => s.result);
  const config = useStore((s) => s.config);
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewRef = useRef<HTMLDivElement | null>(null);
  const cols = visibleColumns(config.fields, config.customFields);
  const cases = result?.cases ?? [];

  useEffect(() => {
    if (reviewOpen && reviewRef.current) {
      reviewRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [reviewOpen]);

  if (!result) return null;
  const completedResult = result;

  async function doExport() {
    try {
      await exportWorkbook({
        result: completedResult,
        fields: config.fields,
        customFields: config.customFields,
        selectedIds: null,
      });
      toast.success("已导出全部用例");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 font-display tracking-tight">
            生成结果
            <HelpTip text="生成结果为只读内容；如需调整结果，请修改输入或配置后重新生成。" />
          </CardTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>用例 <span className="font-mono text-sm font-semibold text-foreground">{result.cases.length}</span></span>
            <span>待确认 <span className="font-mono text-sm font-semibold text-foreground">{result.confirmations.length}</span></span>
            <span>覆盖 <span className="font-mono text-sm font-semibold text-foreground">{result.coverage.length}</span></span>
            <span>风险 <span className="font-mono text-sm font-semibold text-foreground">{result.risksAndAssumptions.length}</span></span>
            {result.modelUsed && (<span className="flex items-center gap-1"><span className="hidden sm:inline">模型</span><Badge variant="outline" className="font-mono">{result.modelUsed}</Badge></span>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setReviewOpen((v) => !v)}>
            <Sparkles className="size-4" /> {reviewOpen ? "收起 AI 评审" : "AI 评审用例"}
          </Button>
          <Button onClick={() => void doExport()}>
            <FileDown className="size-4" /> 导出 Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="relative z-0">
        <Tabs defaultValue="cases" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="cases">测试用例（<span className="font-mono">{result.cases.length}</span>）</TabsTrigger>
            <TabsTrigger value="coverage">覆盖概览（<span className="font-mono">{result.coverage.length}</span>）</TabsTrigger>
            <TabsTrigger value="risks">风险与假设（<span className="font-mono">{result.risksAndAssumptions.length}</span>）</TabsTrigger>
            <TabsTrigger value="confirm">待确认项（<span className="font-mono">{result.confirmations.length}</span>）</TabsTrigger>
          </TabsList>

          <TabsContent value="cases" className="space-y-3">
            {cases.length === 0 ? <EmptyHint text="暂无测试用例" /> : cols.length === 0 ? <EmptyHint text="暂无可见字段，请先在字段配置中显示至少一个字段。" /> : (
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-max">
                  <TableHeader><TableRow>{cols.map((col) => <TableHead key={col.key} className="min-w-24 bg-muted/30">{col.label}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>{cases.map((item) => <TableRow key={item.id} className="align-top">{cols.map((col) => <TableCell key={col.key} className="max-w-[360px] whitespace-pre-wrap">{renderCaseCell(item, col.key)}</TableCell>)}</TableRow>)}</TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="coverage"><CoverageTable /></TabsContent>
          <TabsContent value="risks">{result.risksAndAssumptions.length === 0 ? <EmptyHint text="暂无风险与假设" /> : <ul className="space-y-2">{result.risksAndAssumptions.map((item, i) => <li key={i} className="flex gap-3 rounded-md border px-3 py-2 text-sm"><span className="select-none font-mono text-xs text-muted-foreground/70">{i + 1}</span><span className="min-w-0 flex-1">{item}</span></li>)}</ul>}</TabsContent>
          <TabsContent value="confirm">{result.confirmations.length === 0 ? <EmptyHint text="暂无待确认项" /> : <div className="space-y-3">{result.confirmations.map((item, i) => <div key={i} className="flex gap-3 rounded-md border p-3 text-sm"><span className="select-none pt-0.5 font-mono text-xs text-muted-foreground/70">{i + 1}</span><div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-2"><Badge variant="warning">待确认</Badge><span className="font-medium">{item.problem}</span>{item.sourceLocation && <span className="text-xs text-muted-foreground">来源：{item.sourceLocation}</span>}</div>{item.impact && <p className="text-xs text-muted-foreground">影响：{item.impact}</p>}{item.confirmSuggestion && <p className="mt-1 text-xs">建议：{item.confirmSuggestion}</p>}</div></div>)}</div>}</TabsContent>
          </Tabs>

        {reviewOpen && <ReviewPanel anchorRef={reviewRef} />}
      </CardContent>
    </Card>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

function CoverageTable() {
  const coverage = useStore((s) => s.result?.coverage ?? []);
  return <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow>{["序号", "功能点", "测试类型", "用例数量", "覆盖状态", "风险等级"].map((item) => <TableHead key={item}>{item}</TableHead>)}</TableRow></TableHeader><TableBody>{coverage.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">暂无覆盖数据</TableCell></TableRow> : coverage.map((item, i) => <TableRow key={i}><TableCell className="w-10 font-mono text-muted-foreground/70">{i + 1}</TableCell><TableCell>{item.feature}</TableCell><TableCell>{item.testType}</TableCell><TableCell><span className="font-mono">{item.count}</span></TableCell><TableCell><Badge variant={item.coverageStatus.includes("未") ? "secondary" : "success"}>{item.coverageStatus}</Badge></TableCell><TableCell><Badge variant={item.riskLevel === "高" ? "destructive" : item.riskLevel === "中" ? "warning" : "outline"}>{item.riskLevel}</Badge></TableCell></TableRow>)}</TableBody></Table></div>;
}

function cellValue(item: TestCase, key: string) {
  const value = key === "steps" ? item.steps.join("\n") : (item as unknown as Record<string, unknown>)[key];
  return value === null || value === undefined ? "" : String(value);
}

const SEVERITY_VARIANT: Record<string, "destructive" | "warning" | "outline"> = {
  高: "destructive",
  中: "warning",
  低: "outline",
};

const PRIORITY_STYLE: Record<string, string> = {
  P0: "text-red-600 border-red-200 bg-red-50",
  P1: "text-amber-700 border-amber-200 bg-amber-50",
  P2: "text-slate-600 border-slate-300 bg-slate-50",
};

function PriorityBadge({ value }: { value: string }) {
  const cls = PRIORITY_STYLE[value] ?? "text-slate-600 border-slate-300 bg-slate-50";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide ${cls}`}>{value}</span>;
}

/** steps 列：逐行渲染，行首等宽序号 + 悬挂缩进 */
function renderStepCell(value: string) {
  const steps = value
    .split("\n")
    .map((s) => s.trim().replace(/^\s*\d+\s*[.、．]\s*/, ""))
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

/** 用例单元格：优先级→彩色徽章、steps→序号列表、id→等宽 */
function renderCaseCell(item: TestCase, key: string) {
  if (key === "priority") return <PriorityBadge value={cellValue(item, key) || "P2"} />;
  if (key === "steps" || key === "expected") return renderStepCell(cellValue(item, key));
  return (
    <span className={key === "id" ? "font-mono text-xs" : "whitespace-pre-wrap"}>{cellValue(item, key)}</span>
  );
}

/** AI 审查用例面板：模型选择 + 开始审查 + 三部分结果展示 */
function ReviewPanel({ anchorRef }: { anchorRef: RefObject<HTMLDivElement | null> }) {
  const config = useStore((s) => s.config);
  const result = useStore((s) => s.result);
  const reviewModel = useStore((s) => s.reviewModel);
  const setReviewModel = useStore((s) => s.setReviewModel);
  const reviewPhase = useStore((s) => s.reviewPhase);
  const reviewError = useStore((s) => s.reviewError);
  const reviewResult = useStore((s) => s.reviewResult);
  const runReview = useStore((s) => s.runReview);
  const cancelReview = useStore((s) => s.cancelReview);
  const cols = visibleColumns(config.fields, config.customFields);

  const model = reviewModel || DEFAULT_MODEL_ID;
  const busy = reviewPhase === "requesting" || reviewPhase === "validating";

  async function exportOptimized() {
    if (!reviewResult) return;
    try {
      await exportWorkbook({
        result: {
          cases: reviewResult.optimizedCases,
          coverage: result?.coverage ?? [],
          risksAndAssumptions: result?.risksAndAssumptions ?? [],
          confirmations: result?.confirmations ?? [],
          evidence: [],
          modelUsed: reviewResult.modelUsed,
        },
        fields: config.fields,
        customFields: config.customFields,
        selectedIds: null,
      });
      toast.success("已导出优化版用例");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    }
  }

  async function exportOriginal() {
    if (!result) return;
    try {
      await exportWorkbook({
        result,
        fields: config.fields,
        customFields: config.customFields,
        selectedIds: null,
      });
      toast.success("已导出原始用例");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    }
  }

  if (reviewResult && (reviewPhase === "done" || reviewPhase === "idle")) {
    return (
      <div className="space-y-4 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex animate-success-pulse items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="font-semibold">AI 评审结果</span>
            {reviewResult.modelUsed && <Badge variant="outline" className="font-mono">{reviewResult.modelUsed}</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void exportOriginal()}>
              <FileDown className="size-4" /> 仍然导出原来的用例
            </Button>
            <Button size="sm" onClick={() => void exportOptimized()}>
              <FileDown className="size-4" /> 将原用例替换成优化后的用例并导出
            </Button>
            <Button variant="outline" size="sm" onClick={() => void runReview()}>
              重新评审
            </Button>
          </div>
        </div>

        {/* 第一部分：整体评审总结 */}
        {reviewResult.summary && (
          <div className="relative overflow-hidden rounded-md border bg-muted/30 p-3 pl-4 text-sm">
            <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-sky-400 to-indigo-500" />
            <div className="mb-1 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">01 · 评审总结</div>
            <p className="whitespace-pre-wrap">{reviewResult.summary}</p>
          </div>
        )}

        {/* 高风险点提醒 */}
        {reviewResult.highRiskNotes.length > 0 && (
          <div className="space-y-2">
            <div className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground">02 · 高风险点提醒（需人工重点确认）</div>
            {reviewResult.highRiskNotes.map((note, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                <Badge variant="destructive" className="shrink-0">高</Badge>
                <span>{note}</span>
              </div>
            ))}
          </div>
        )}

        {/* 第二部分：逐条问题清单 */}
        <div>
          <div className="mb-2 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">03 · 问题清单（<span className="font-mono">{reviewResult.issues.length}</span> 条）</div>
          {reviewResult.issues.length === 0 ? (
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
                  {reviewResult.issues.map((item, i) => (
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

        {/* 第三部分：优化版用例 */}
        <div>
          <div className="mb-2 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">04 · 优化用例（<span className="font-mono">{reviewResult.optimizedCases.length}</span> 条）</div>
          {cols.length === 0 ? <EmptyHint text="暂无可见字段。" /> : (
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-max">
                <TableHeader>
                  <TableRow>{cols.map((col) => <TableHead key={col.key} className="min-w-24 bg-muted/30">{col.label}</TableHead>)}</TableRow>
                </TableHeader>
                <TableBody>{reviewResult.optimizedCases.map((item, i) => <TableRow key={i} className="align-top">{cols.map((col) => <TableCell key={col.key} className="max-w-[360px] whitespace-pre-wrap">{renderCaseCell(item, col.key)}</TableCell>)}</TableRow>)}</TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 空态：选择模型并开始评审
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <span className="font-semibold">AI 评审用例</span>
        <span className="text-xs text-muted-foreground">对当前 <span className="font-mono">{config.fields.length}</span> 个字段下的测试用例做预审评审（AI 初筛，业务正确性仍需人工复核）</span>
      </div>

      <div ref={anchorRef} className="flex flex-wrap items-center gap-2">
        <ModelSelect
          value={model}
          onValueChange={setReviewModel}
          showCapabilityBadges={false}
          placeholder="选择评审模型…"
          triggerClassName="w-72"
        />
        {busy ? (
          <Button onClick={() => cancelReview()} disabled={false}>
            <Loader2 className="size-4 animate-spin" /> 取消评审
          </Button>
        ) : (
          <Button onClick={() => void runReview()}>
            <Sparkles className="size-4" /> 开始 AI 评审
          </Button>
        )}
        {busy && <span className="text-xs text-muted-foreground">{reviewPhase === "requesting" ? "AI 评审中，可能需要数十秒…" : "校验并整理结果…"}（评审期间请勿离开当前页面，否则评审会中断）</span>}
      </div>

      {reviewError && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{reviewError}</div>}
      {!busy && !reviewResult && <p className="text-xs text-muted-foreground">提示：评审会将当前用例与原始 PRD 需求一并交给模型，输出整体总结、逐条问题清单与优化后的完整用例。用例较多时云端单次评审可能超时，可改用较快的模型。</p>}
    </div>
  );
}
