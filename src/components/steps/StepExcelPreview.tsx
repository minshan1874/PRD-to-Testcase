import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store";
import { visibleColumns, exportWorkbook } from "@/lib/excel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TestCase } from "@/types";

export default function StepExcelPreview() {
  const result = useStore((s) => s.result);
  const config = useStore((s) => s.config);
  const cols = visibleColumns(config.fields, config.customFields);
  const previewCols = cols;

  async function doExport() {
    if (!result) return;
    try {
      await exportWorkbook({
        result,
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

  if (!result) {
    return <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">生成完成后将在此显示 Excel 只读预览。</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            Excel 预览
            <Badge variant="outline">{result.cases.length} 条用例</Badge>
          </CardTitle>
          <div className="flex gap-2">
            <Button onClick={() => doExport()}><FileDown className="size-4" /> 导出 Excel</Button>
          </div>
        </CardHeader>
        <CardContent>
          {previewCols.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">暂无可见字段，请先在字段配置中显示至少一个字段。</p> : <div className="max-h-[min(68vh,720px)] overflow-auto rounded-md border">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  {previewCols.map((col) => (
                    <th key={col.key} className="border-b border-r px-3 py-2 text-left font-semibold whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.cases.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-muted/40">
                    {previewCols.map((col) => (
                      <td key={col.key} className="max-w-[360px] border-b border-r px-3 py-2 whitespace-pre-wrap">
                        {cellValue(item, col.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </CardContent>
      </Card>
    </div>
  );
}

function cellValue(item: TestCase, key: string) {
  const value = key === "steps" ? item.steps.join("\n") : (item as unknown as Record<string, unknown>)[key];
  return value === null || value === undefined ? "" : String(value);
}
