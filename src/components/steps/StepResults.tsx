import { useMemo, useState } from "react";
import { FileDown, Search } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store";
import { exportWorkbook, visibleColumns } from "@/lib/excel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HelpTip from "@/components/HelpTip";
import type { TestCase } from "@/types";

const TEST_TYPE_OPTIONS = ["功能/UI", "接口", "异常", "边界", "权限", "安全", "性能", "兼容性", "可用性"];
const PRIORITIES = ["P0", "P1", "P2", "P3"];

export default function StepResults() {
  const result = useStore((s) => s.result);
  const config = useStore((s) => s.config);
  const [search, setSearch] = useState("");
  const [testType, setTestType] = useState("全部");
  const [priority, setPriority] = useState("全部");
  const [module, setModule] = useState("全部");
  const cols = visibleColumns(config.fields, config.customFields);
  const cases = result?.cases ?? [];
  const modules = useMemo(() => [...new Set(cases.map((c) => c.module).filter(Boolean))], [cases]);
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return cases.filter((item) => {
      if (testType !== "全部" && item.testType !== testType) return false;
      if (priority !== "全部" && item.priority !== priority) return false;
      if (module !== "全部" && item.module !== module) return false;
      if (!keyword) return true;
      return [item.id, item.module, item.title, item.remark, item.precondition]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [cases, module, priority, search, testType]);

  if (!result) return null;
  const completedResult = result;

  async function doExport() {
    try {
      await exportWorkbook({
        result: completedResult,
        fields: config.fields,
        customFields: config.customFields,
        selectedIds: null,
        traceEnabled: config.trace.enabled,
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
          <CardTitle className="flex items-center gap-2">
            生成结果
            <HelpTip text="生成结果为只读内容；如需调整结果，请修改左侧输入或配置后重新生成。" />
          </CardTitle>
          <CardDescription>
            共 {result.cases.length} 条用例 · {result.confirmations.length} 项待确认 · 实际模型 {result.modelUsed || config.model}
          </CardDescription>
        </div>
        <Button onClick={() => void doExport()}>
          <FileDown className="size-4" /> 导出 Excel
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="cases" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="cases">测试用例（{result.cases.length}）</TabsTrigger>
            <TabsTrigger value="coverage">覆盖概览（{result.coverage.length}）</TabsTrigger>
            <TabsTrigger value="risks">风险与假设（{result.risksAndAssumptions.length}）</TabsTrigger>
            <TabsTrigger value="confirm">待确认项（{result.confirmations.length}）</TabsTrigger>
            {config.trace.enabled && <TabsTrigger value="evidence">生成依据（{result.evidence.length}）</TabsTrigger>}
          </TabsList>

          <TabsContent value="cases" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="w-56 pl-8" placeholder="搜索标题/模块/ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={testType} onValueChange={setTestType}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="全部">全部类型</SelectItem>{TEST_TYPE_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={module} onValueChange={setModule}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="全部">全部模块</SelectItem>{modules.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="全部">全部优先级</SelectItem>{PRIORITIES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {filtered.length === 0 ? <EmptyHint text="没有匹配的用例，请调整筛选条件。" /> : cols.length === 0 ? <EmptyHint text="暂无可见字段，请先在字段配置中显示至少一个字段。" /> : (
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-max">
                  <TableHeader><TableRow>{cols.map((col) => <TableHead key={col.key} className="min-w-24 bg-muted/30">{col.label}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>{filtered.map((item) => <TableRow key={item.id} className="align-top">{cols.map((col) => <TableCell key={col.key} className="max-w-[360px] whitespace-pre-wrap">{cellValue(item, col.key)}</TableCell>)}</TableRow>)}</TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="coverage"><CoverageTable /></TabsContent>
          <TabsContent value="risks">{result.risksAndAssumptions.length === 0 ? <EmptyHint text="暂无风险与假设" /> : <ul className="space-y-2">{result.risksAndAssumptions.map((item, i) => <li key={i} className="rounded-md border px-3 py-2 text-sm">{item}</li>)}</ul>}</TabsContent>
          <TabsContent value="confirm">{result.confirmations.length === 0 ? <EmptyHint text="暂无待确认项" /> : <div className="space-y-3">{result.confirmations.map((item, i) => <div key={i} className="rounded-md border p-3 text-sm"><div className="mb-1 flex flex-wrap items-center gap-2"><Badge variant="warning">待确认</Badge><span className="font-medium">{item.problem}</span>{item.sourceLocation && <span className="text-xs text-muted-foreground">来源：{item.sourceLocation}</span>}</div>{item.impact && <p className="text-xs text-muted-foreground">影响：{item.impact}</p>}{item.confirmSuggestion && <p className="mt-1 text-xs">建议：{item.confirmSuggestion}</p>}</div>)}</div>}</TabsContent>
          {config.trace.enabled && <TabsContent value="evidence">{result.evidence.length === 0 ? <EmptyHint text="未生成追溯依据" /> : <div className="space-y-2">{result.evidence.map((item, i) => <div key={i} className="flex flex-wrap items-start gap-3 rounded-md border px-3 py-2 text-sm"><Badge variant="outline">{item.caseId || "-"}</Badge><span className="min-w-0 flex-1 text-muted-foreground">{item.prdSnippet}</span><span className="shrink-0 text-xs text-muted-foreground">📍 {item.location}</span></div>)}</div>}</TabsContent>}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

function CoverageTable() {
  const coverage = useStore((s) => s.result?.coverage ?? []);
  return <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow>{["功能点", "测试类型", "用例数量", "覆盖状态", "风险等级"].map((item) => <TableHead key={item}>{item}</TableHead>)}</TableRow></TableHeader><TableBody>{coverage.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">暂无覆盖数据</TableCell></TableRow> : coverage.map((item, i) => <TableRow key={i}><TableCell>{item.feature}</TableCell><TableCell>{item.testType}</TableCell><TableCell>{item.count}</TableCell><TableCell><Badge variant={item.coverageStatus.includes("未") ? "secondary" : "success"}>{item.coverageStatus}</Badge></TableCell><TableCell><Badge variant={item.riskLevel === "高" ? "destructive" : item.riskLevel === "中" ? "warning" : "outline"}>{item.riskLevel}</Badge></TableCell></TableRow>)}</TableBody></Table></div>;
}

function cellValue(item: TestCase, key: string) {
  const value = key === "steps" ? item.steps.join("\n") : (item as unknown as Record<string, unknown>)[key];
  return value === null || value === undefined ? "" : String(value);
}
