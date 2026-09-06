import ExcelJS from "exceljs";
import type { FieldConfig, GenerationResult, TestCase, FieldDef } from "@/types";
import { BUILTIN_FIELDS } from "@/fieldSpec";

export interface ExportParams {
  result: GenerationResult;
  fields: FieldConfig[];
  customFields: FieldDef[];
  /** null = 导出全部；非空数组 = 仅导出勾选用例 */
  selectedIds: string[] | null;
  traceEnabled: boolean;
}

export interface Column {
  key: string;
  label: string;
  width: number;
  wrap: boolean;
}

const WRAP_KEYS = new Set(["precondition", "testData", "steps", "expected", "actualResult", "remark", "title"]);

export function visibleColumns(fields: FieldConfig[], customFields: FieldDef[]): Column[] {
  const byKey = new Map<string, FieldDef>();
  for (const f of BUILTIN_FIELDS) byKey.set(f.key, f);
  for (const f of customFields) byKey.set(f.key, f);
  return fields
    .filter((f) => f.visible)
    .map((f) => {
      const meta = byKey.get(f.key);
      // 自定义字段在用例对象与模型输出中以 custom_<key> 存储
      const colKey = f.key.startsWith("cf_") ? `custom_${f.key}` : f.key;
      return {
        key: colKey,
        label: meta?.label ?? f.key,
        width: meta?.width ?? 16,
        wrap: WRAP_KEYS.has(f.key),
      };
    });
}

function stepsText(c: TestCase): string {
  return (c.steps ?? []).join("\n");
}

function cellValue(c: TestCase, key: string): string | number {
  if (key === "steps") return stepsText(c);
  const v = (c as unknown as Record<string, unknown>)[key];
  return v === null || v === undefined ? "" : String(v);
}

function styleHeaderRow(ws: ExcelJS.Worksheet, labelRow: string[]) {
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  header.alignment = { vertical: "middle" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + labelRow.length)}1` };
}

function recomputeCoverage(selectedCases: TestCase[], original: GenerationResult["coverage"]): GenerationResult["coverage"] {
  const counts = new Map<string, { module: string; testType: string; count: number }>();
  for (const c of selectedCases) {
    const key = `${c.module}::${c.testType}`;
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { module: c.module, testType: c.testType, count: 1 });
  }
  return [...counts.values()].map(({ module, testType, count }) => {
    const orig = original.find((o) => o.feature === module && o.testType === testType);
    return {
      feature: module || "未分类",
      testType,
      count,
      coverageStatus: orig?.coverageStatus ?? (count > 0 ? "已覆盖" : "未覆盖"),
      riskLevel: orig?.riskLevel ?? "低",
    };
  });
}

/** 浏览器端生成 Excel 工作簿并触发下载 */
export async function exportWorkbook(params: ExportParams): Promise<void> {
  const { result, fields, customFields, selectedIds, traceEnabled } = params;
  const selectedSet = selectedIds ? new Set(selectedIds) : null;
  const exportedCases = selectedSet
    ? result.cases.filter((c) => selectedSet.has(c.id))
    : result.cases;

  const cols = visibleColumns(fields, customFields);
  const wb = new ExcelJS.Workbook();
  wb.creator = "PRD 测试用例生成器";
  wb.created = new Date();

  // 1. 测试用例
  const wsCases = wb.addWorksheet("测试用例");
  if (cols.length === 0) throw new Error("未配置可见字段，无法导出");
  wsCases.columns = cols.map((c) => ({ header: c.label, key: c.key, width: c.width }));
  styleHeaderRow(wsCases, cols.map((c) => c.label));
  for (const c of exportedCases) {
    const row: Record<string, string | number> = {};
    for (const col of cols) row[col.key] = cellValue(c, col.key);
    const r = wsCases.addRow(row);
    for (const col of cols) {
      const cell = r.getCell(col.key);
      if (col.wrap) cell.alignment = { wrapText: true, vertical: "top" };
    }
  }

  // 2. 覆盖概览
  const wsCover = wb.addWorksheet("覆盖概览");
  const coverHeaders = ["功能点", "测试类型", "用例数量", "覆盖状态", "风险等级"];
  wsCover.columns = coverHeaders.map((h) => ({ header: h, key: h, width: 14 }));
  styleHeaderRow(wsCover, coverHeaders);
  const coverRows = selectedSet
    ? recomputeCoverage(exportedCases, result.coverage)
    : result.coverage;
  for (const row of coverRows) wsCover.addRow([row.feature, row.testType, row.count, row.coverageStatus, row.riskLevel]);

  // 3. 待确认项
  const wsConf = wb.addWorksheet("待确认项");
  const confHeaders = ["问题描述", "影响", "来源位置", "建议确认内容"];
  wsConf.columns = confHeaders.map((h) => ({ header: h, key: h, width: 28 }));
  styleHeaderRow(wsConf, confHeaders);
  for (const c of result.confirmations) wsConf.addRow([c.problem, c.impact, c.sourceLocation, c.confirmSuggestion]);

  // 4. 字段说明
  const wsField = wb.addWorksheet("字段说明");
  const fieldHeaders = ["字段", "填写说明", "示例"];
  wsField.columns = fieldHeaders.map((h) => ({ header: h, key: h, width: 24 }));
  styleHeaderRow(wsField, fieldHeaders);
  const fieldDict = [...BUILTIN_FIELDS, ...customFields].filter((f) => fields.some((c) => c.key === f.key && c.visible));
  for (const f of fieldDict) wsField.addRow([f.label, f.description, f.example]);

  // 5. 生成依据（仅追溯开启）
  if (traceEnabled) {
    const wsEvid = wb.addWorksheet("生成依据");
    const evidHeaders = ["用例 ID", "PRD 片段", "位置（页码/章节）"];
    wsEvid.columns = evidHeaders.map((h) => ({ header: h, key: h, width: 32 }));
    styleHeaderRow(wsEvid, evidHeaders);
    const evidRows = selectedSet ? result.evidence.filter((e) => selectedSet.has(e.caseId)) : result.evidence;
    for (const e of evidRows) wsEvid.addRow([e.caseId, e.prdSnippet, e.location]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  a.href = url;
  a.download = `PRD测试用例_${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
