import ExcelJS from "exceljs";
import type { FieldConfig, GenerationResult, TestCase, FieldDef } from "@/types";
import { BUILTIN_FIELDS } from "@/fieldSpec";

export interface ExportParams {
  result: GenerationResult;
  fields: FieldConfig[];
  customFields: FieldDef[];
  /** null = 导出全部；非空数组 = 仅导出勾选用例 */
  selectedIds: string[] | null;
  filenameSuffix?: string;
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
  const { result, fields, customFields, selectedIds, filenameSuffix } = params;
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

  // 3. 风险与假设
  if (result.risksAndAssumptions.length > 0) {
    const wsRisk = wb.addWorksheet("风险与假设");
    wsRisk.columns = [{ header: "序号", key: "no", width: 8 }, { header: "风险与假设", key: "risk", width: 60 }];
    styleHeaderRow(wsRisk, ["序号", "风险与假设"]);
    result.risksAndAssumptions.forEach((r, i) => wsRisk.addRow([i + 1, r]));
  }

  // 4. 待确认项
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
  a.download = `PRD测试用例_${stamp}${filenameSuffix ? `_${filenameSuffix}` : ""}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── 读取用户上传的用例 Excel ───────────────────────────────

export interface ParsedWorkbook {
  cases: TestCase[];
  columns: { key: string; label: string }[];
  fileName: string;
}

const LABEL_TO_KEY: Record<string, string> = {
  "用例编号": "id", "用例id": "id", "用例 ID": "id", "编号": "id", id: "id", "id编号": "id",
  模块: "module", module: "module", 功能模块: "module",
  功能点: "featurePoint", featurepoint: "featurePoint", 功能: "featurePoint",
  标题: "title", title: "title", 用例标题: "title",
  用例类型: "caseType", casetype: "caseType",
  测试类型: "testType", testtype: "testType",
  优先级: "priority", priority: "priority",
  前置条件: "precondition", precondition: "precondition", 前置: "precondition",
  测试数据: "testData", testdata: "testData", 输入数据: "testData",
  操作步骤: "steps", 步骤: "steps", steps: "steps",
  预期结果: "expected", expected: "expected", 预期: "expected",
  实际结果: "actualResult", actualresult: "actualResult",
  状态: "status", status: "status",
  缺陷id: "defectId", 缺陷编号: "defectId", defectid: "defectId", "bugid": "defectId",
  备注: "remark", remark: "remark",
};

const STEP_SPLIT = /\r?\n|；/;

/** 解析用户上传的用例 Excel（读取第一个工作表，按表头中文名映射列） */
export async function parseWorkbookFile(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Excel 中没有可读取的工作表");

  const header: { key: string; label: string; colNum: number }[] = [];
  const headerRow = ws.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
    const label = String(cell.value ?? "").trim();
    if (!label) return;
    const norm = label.replace(/\s+/g, "").toLowerCase();
    const entry = Object.entries(LABEL_TO_KEY).find(
      ([k]) => k.replace(/\s+/g, "").toLowerCase() === norm
    );
    const key = entry?.[1] ?? LABEL_TO_KEY[label] ?? "";
    if (key) header.push({ key, label, colNum });
  });
  if (header.length === 0) {
    throw new Error("未识别到用例列，请使用标准列名（如：模块/标题/优先级/操作步骤/预期结果）");
  }
  // 表头去重，保留首个同键列
  const seen = new Set<string>();
  const cols = header.filter((h) => {
    if (seen.has(h.key)) return false;
    seen.add(h.key);
    return true;
  });

  const idCounters = new Map<string, number>();
  const cases: TestCase[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const map: Record<string, string> = {};
    for (const c of cols) {
      const v = row.getCell(c.colNum).value;
      map[c.key] = v === null || v === undefined ? "" : String(v);
    }
    if (cols.every((c) => !map[c.key].trim())) return; // 跳过空行

    const colSet = new Set(cols.map((c) => c.key));
    const steps = map.steps
      ? map.steps.split(STEP_SPLIT).map((s) => s.trim().replace(/^\s*\d+[.、)）:：]\s*/, "")).filter(Boolean)
      : [];
    const keyId = map.id?.trim();
    const isBlankId = !keyId;
    const counter = idCounters.get("__id__") ?? 1;
    idCounters.set("__id__", counter + 1);
    const tc: TestCase = {
      id: isBlankId ? `TC-${String(counter).padStart(3, "0")}` : keyId,
      module: map.module ?? "",
      featurePoint: map.featurePoint ?? "",
      title: map.title ?? "",
      testType: map.testType ?? "功能/UI",
      caseType: map.caseType ?? "功能测试",
      priority: map.priority || "P2",
      precondition: map.precondition ?? "",
      testData: map.testData ?? "",
      steps,
      expected: map.expected ?? "",
      status: map.status ?? "未执行",
      actualResult: map.actualResult ?? "",
      defectId: map.defectId ?? "",
      remark: map.remark ?? "",
    };
    for (const key of colSet) if (!(key in tc)) (tc as unknown as Record<string, string>)[key] = map[key];
    cases.push(tc);
  });

  if (cases.length === 0) throw new Error("未能从 Excel 中解析出任何测试用例");
  return { cases, columns: cols.map(({ key, label }) => ({ key, label })), fileName: file.name };
}

/** 将用例导出为 Excel（仅含优化后用例） */
export async function exportCasesWorkbook(
  cases: TestCase[],
  columns: { key: string; label: string }[],
  filenameSuffix: string
): Promise<void> {
  const fields: FieldConfig[] = columns.map((c) => ({ key: c.key, visible: true, enabled: true }));
  const result: GenerationResult = {
    cases,
    coverage: [],
    risksAndAssumptions: [],
    confirmations: [],
    evidence: [],
    modelUsed: "",
  };
  await exportWorkbook({ result, fields, customFields: [], selectedIds: null, filenameSuffix });
}
