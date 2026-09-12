import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store";
import type { SourceItem, TestCase } from "@/types";
import { extractTestCasesRequest, generateScriptRequest } from "@/lib/api";
import { buildBody } from "@/lib/prompt";
import { ingestFile } from "@/lib/ingest";
import { isDemoModel } from "@/lib/sampleResults";
import { buildExecutableRobotScript, sanitizeAIScript } from "@/lib/robotGenerator";
import { LIMITS } from "@/lib/limits";
import { parseTestCaseExtraction } from "@/lib/scriptPrompt";
import { renumberCases } from "@/lib/schema";
import { parseWorkbookFile } from "@/lib/excel";
import { cn, formatBytes, scrollElementToStart } from "@/lib/utils";
import ScriptHighlight from "@/components/ScriptHighlight";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type ScriptPhase = "idle" | "parsing" | "generating" | "done" | "error";

interface ScriptResultItem {
  testCase: TestCase;
  script?: string;
  model: string;
  generatedAt: string;
  error?: string;
}

interface SpreadsheetFile {
  name: string;
  size: number;
  cases: TestCase[];
}

interface HtmlBlock {
  id: string;
  page: string;
  source: string;
}

function nextPageLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

const SCRIPT_STATUS_MESSAGES = [
  "正在解析测试用例文档…",
  "正在识别用例标题、步骤和预期结果…",
  "正在整理多条测试用例…",
];

const SCRIPT_GENERATION_MESSAGE = "正在为当前用例生成 Robot Framework 脚本…";

const SCRIPT_GENERATION_FAILED = "脚本生成失败，请重试";

/** 演示模型下返回的固定可执行示例（老照片修复页面），由本地生成器确定性生成 */
const DEMO_SCRIPT_CASES: TestCase[] = [
  {
    id: "RC-001",
    module: "老照片修复",
    title: "验证老照片修复页面能正常打开",
    featurePoint: "",
    testType: "功能",
    caseType: "功能测试",
    priority: "P0",
    precondition: "已部署老照片修复网页",
    testData: "浏览器",
    steps: ["打开浏览器访问老照片修复页面", "等待页面加载完成"],
    expected: "页面正常打开并显示标题「老照片修复」",
    status: "未执行",
    actualResult: "",
    defectId: "",
    remark: "",
  },
  {
    id: "RC-002",
    module: "老照片修复",
    title: "验证上传图片后可选分辨率并点击立即尝试",
    featurePoint: "",
    testType: "功能",
    caseType: "功能测试",
    priority: "P1",
    precondition: "已进入老照片修复页面",
    testData: "一张本地 JPG 图片",
    steps: ["点击图片上传区域", "上传本地图片", "选择分辨率", "点击立即尝试"],
    expected: "图片上传成功，分辨率可选项展示，点击立即尝试后进入处理中状态",
    status: "未执行",
    actualResult: "",
    defectId: "",
    remark: "",
  },
  {
    id: "RC-003",
    module: "老照片修复",
    title: "验证未上传图片时立即尝试被限制",
    featurePoint: "",
    testType: "异常",
    caseType: "功能测试",
    priority: "P1",
    precondition: "已进入老照片修复页面，未上传图片",
    testData: "",
    steps: ["点击立即尝试"],
    expected: "提示需先上传图片，无法继续执行",
    status: "未执行",
    actualResult: "",
    defectId: "",
    remark: "",
  },
];

function stripCodeFences(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:robotframework|robot|text)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

/** 解析失败时，把用户直接粘贴的叙述式文本本地拆成单条用例作为回退，保证流程可继续。 */
function deriveCaseFromInput(text: string): TestCase {
  const cleaned = text.trim();
  const expMatch = cleaned.match(/(?:预期结果|预期|结果)\s*[:：]?\s*(.+?)(?:[。.]|$)/);
  const expected = expMatch ? expMatch[1].trim() : "操作成功完成";
  const body = expMatch ? cleaned.slice(0, expMatch.index).trim() : cleaned;
  const steps = body
    .split(/[\n、]|－|\s*-\s*/u)
    .map((step) => step.trim())
    .filter(Boolean);
  return {
    id: "",
    module: "",
    featurePoint: "",
    title: body.slice(0, 24) || "用例",
    testType: "功能",
    caseType: "功能测试",
    priority: "P1",
    precondition: "",
    testData: "",
    steps,
    expected,
    status: "未执行",
    actualResult: "",
    defectId: "",
    remark: "",
  };
}

function downloadRobotScript(item: ScriptResultItem): void {
  if (!item.script) return;
  const safeTitle = (item.testCase.title || item.testCase.id || "script")
    .trim()
    .replace(/[\\/:*?"<>|\r\n]/g, "_");
  const fileName = `${item.testCase.id || "TC"}_${safeTitle}.robot`;
  const blob = new Blob([item.script], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function sourceTextItem(text: string): SourceItem {
  return {
    id: "script-input-text",
    name: "输入框内容",
    kind: "txt",
    size: new Blob([text]).size,
    status: "success",
    text: text.trim(),
  };
}

function textForSearch(item: TestCase): string {
  return [item.id, item.module, item.title, item.precondition, item.expected]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export default function ScriptModule() {
  const config = useStore((s) => s.config);
  const setActiveFeature = useStore((s) => s.setActiveFeature);
  const [inputText, setInputText] = useState("");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [spreadsheetFiles, setSpreadsheetFiles] = useState<SpreadsheetFile[]>([]);
  const [parsedCases, setParsedCases] = useState<TestCase[]>([]);
  const [scriptResults, setScriptResults] = useState<ScriptResultItem[]>([]);
  const [phase, setPhase] = useState<ScriptPhase>("idle");
  const [mode, setMode] = useState<"fast" | "ai">("fast");
  const [htmlBlocks, setHtmlBlocks] = useState<HtmlBlock[]>([{ id: "html-1", page: "页面A", source: "" }]);
  const [statusIndex, setStatusIndex] = useState(0);
  const [statusDetail, setStatusDetail] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const busy = phase === "parsing" || phase === "generating";
  const htmlChars = htmlBlocks.reduce((total, block) => total + block.source.length, 0);
  const htmlSource = useMemo(
    () =>
      htmlBlocks
        .map((block) => (block.page.trim() ? `【页面标识】${block.page.trim()}\n${block.source}` : block.source))
        .join("\n\n"),
    [htmlBlocks],
  );
  const successfulSources = sources.filter((item) => item.status === "success");
  const textChars = inputText.length + successfulSources.reduce((total, item) => total + (item.text?.length ?? 0), 0);
  const imageCount = successfulSources.reduce(
    (total, item) => total + (item.kind === "image" ? 1 : item.pageImages?.length ?? 0),
    0,
  );
  const hasInput = Boolean(inputText.trim()) || successfulSources.length > 0 || spreadsheetFiles.length > 0;
  const canRun = hasInput && Boolean(config.model.trim()) && !busy && textChars <= LIMITS.maxTextChars;

  const filteredResults = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return scriptResults;
    return scriptResults.filter((item) => textForSearch(item.testCase).includes(normalized));
  }, [query, scriptResults]);

  useEffect(() => {
    if (phase === "parsing" || phase === "generating") {
      const timer = window.setInterval(() => {
        setStatusIndex((current) => (current + 1) % SCRIPT_STATUS_MESSAGES.length);
      }, 1800);
      return () => window.clearInterval(timer);
    }
    setStatusIndex(0);
  }, [phase]);

  useEffect(() => {
    if (phase !== "done" || scriptResults.length === 0) return;
    const result = document.getElementById("script-results");
    if (result) scrollElementToStart(result);
  }, [phase, scriptResults.length]);

  const onFiles = useCallback(async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    if (files.length > 10) {
      toast.error("一次最多上传 10 个文件");
      return;
    }

    for (const file of files) {
      if (/\.(xlsx|xlsm)$/i.test(file.name) || file.type.includes("spreadsheet")) {
        try {
          const parsed = await parseWorkbookFile(file);
          setSpreadsheetFiles((current) => [
            ...current.filter((item) => !(item.name === file.name && item.size === file.size)),
            { name: file.name, size: file.size, cases: parsed.cases },
          ]);
          toast.success(`已解析 ${parsed.cases.length} 条测试用例：${file.name}`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `用例文档解析失败：${file.name}`);
        }
        continue;
      }

      const parsed = await ingestFile(file);
      setSources((current) => {
        const duplicate = current.some((item) => item.name === parsed.item.name && item.size === parsed.item.size);
        return duplicate ? current : [...current, parsed.item];
      });
      if (!parsed.ok) toast.error(`${file.name}：${parsed.item.error ?? "解析失败"}`);
    }
  }, []);

  const isFileDrag = (event: React.DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  function clearInput() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setInputText("");
    setSources([]);
    setSpreadsheetFiles([]);
    setParsedCases([]);
    setScriptResults([]);
    setPhase("idle");
    setStatusDetail("");
    setError("");
  }

  function addHtmlBlock() {
    setHtmlBlocks((current) => [
      ...current,
      { id: `html-${Date.now()}`, page: `页面${nextPageLabel(current.length)}`, source: "" },
    ]);
  }

  function removeHtmlBlock(id: string) {
    setHtmlBlocks((current) => {
      const next = current.filter((block) => block.id !== id);
      return next.length > 0 ? next : [{ id: `html-${Date.now()}`, page: "页面A", source: "" }];
    });
  }

  function updateHtmlBlock(id: string, patch: Partial<Pick<HtmlBlock, "page" | "source">>) {
    setHtmlBlocks((current) => current.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  }

  async function generateScripts() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase("parsing");
    setStatusIndex(0);
    setStatusDetail("正在解析测试用例文档…");
    setError("");
    setParsedCases([]);
    setScriptResults([]);

    if (!config.model.trim()) {
      setPhase("error");
      setError("请先在侧边栏选择模型");
      return;
    }
    if (!hasInput) {
      setPhase("error");
      setError("请先输入或上传测试用例文档");
      return;
    }
    if (textChars > LIMITS.maxTextChars) {
      setPhase("error");
      setError(`文本内容超过 ${LIMITS.maxTextChars.toLocaleString()} 字符上限，请删减后重试`);
      return;
    }

    try {
      // 演示模型：无论输入什么，固定返回可执行示例脚本
      if (isDemoModel(config.model)) {
        const now = new Date().toLocaleString("zh-CN", { hour12: false });
        const demos: ScriptResultItem[] = DEMO_SCRIPT_CASES.map((testCase) => ({
          testCase,
          script: buildExecutableRobotScript(testCase),
          model: config.model,
          generatedAt: now,
        }));
        setParsedCases(DEMO_SCRIPT_CASES);
        setScriptResults(demos);
        setPhase("done");
        setStatusDetail(`演示模型：返回 ${demos.length} 条固定可执行示例脚本`);
        return;
      }

      const promptSources = inputText.trim() ? [...sources, sourceTextItem(inputText)] : sources;
      const body = buildBody(promptSources);
      let cases: TestCase[] = spreadsheetFiles.flatMap((file) => file.cases);

      if (body.text.trim() || body.images.length > 0) {
        setStatusDetail("正在解析测试用例文档…");
        const response = await extractTestCasesRequest({
          documentText: body.text,
          images: body.images,
          model: config.model,
          apiKey: config.apiKey || undefined,
          signal: controller.signal,
        });
        const extracted = parseTestCaseExtraction(response.content);
        if (extracted.ok) {
          cases = [...cases, ...extracted.cases];
        } else if (inputText.trim()) {
          cases = [...cases, deriveCaseFromInput(inputText)];
          setStatusDetail("AI 未能解析为结构化用例，已按输入文本本地拆分为单条用例继续生成…");
        } else {
          throw new Error(extracted.reason);
        }
      }

      cases = renumberCases(
        cases.filter((item, index, all) =>
          all.findIndex((other) =>
            other.title.trim() === item.title.trim() &&
            other.expected.trim() === item.expected.trim() &&
            other.steps.join("\n") === item.steps.join("\n"),
          ) === index,
        ),
      );
      if (cases.length === 0) throw new Error("未能从文档中解析出测试用例，请检查文档内容或换一种格式重试");

      setParsedCases(cases);

      // 快速可执行模式：本地确定性生成，不依赖 AI，输出可直接运行的 .robot
      if (mode === "fast") {
        const now = new Date().toLocaleString("zh-CN", { hour12: false });
        const generated: ScriptResultItem[] = cases.map((testCase) => ({
          testCase,
          script: buildExecutableRobotScript(testCase),
          model: config.model,
          generatedAt: now,
        }));
        setScriptResults(generated);
        setPhase("done");
        setStatusDetail(`生成完成：${generated.length} 条可执行脚本（本地确定性生成，未调用模型）`);
        return;
      }

      setPhase("generating");
      const generated: ScriptResultItem[] = [];
      for (let index = 0; index < cases.length; index += 1) {
        if (controller.signal.aborted) throw new DOMException("请求已停止", "AbortError");
        const testCase = cases[index];
        setStatusDetail(`正在生成第 ${index + 1}/${cases.length} 条自动化测试脚本…`);
        try {
          const response = await generateScriptRequest(testCase, {
            model: config.model,
            apiKey: config.apiKey || undefined,
            signal: controller.signal,
            htmlSource,
          });
          const script = sanitizeAIScript(stripCodeFences(response.content));
          if (!script) throw new Error("模型未返回脚本内容");
          generated.push({
            testCase,
            script,
            model: response.model || config.model,
            generatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
          });
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") throw err;
          generated.push({
            testCase,
            model: config.model,
            generatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
            error: SCRIPT_GENERATION_FAILED,
          });
        }
        setScriptResults([...generated]);
      }

      if (generated.every((item) => !item.script)) throw new Error("所有测试用例的脚本生成均失败，请重试");
      setPhase("done");
      setStatusDetail(`生成完成：${generated.filter((item) => item.script).length}/${generated.length} 条脚本`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setPhase("idle");
        setStatusDetail("");
        return;
      }
      setPhase("error");
      setError(err instanceof Error ? err.message : "自动化脚本生成失败");
      setStatusDetail("");
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  function cancelGeneration() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setPhase("idle");
    setStatusDetail("");
  }

  async function copyScript(script: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("当前浏览器不支持剪贴板操作");
      await navigator.clipboard.writeText(script);
      toast.success("脚本已复制");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "复制失败，请手动复制");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold tracking-tight">生成自动化测试脚本</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          输入或上传已有测试用例文档，AI 会自动解析全部用例，并为每条用例生成 Robot Framework + SeleniumLibrary WebUI 脚本骨架。
        </p>
      </div>

      <Card className="overflow-hidden border-sky-200/70 bg-gradient-to-br from-sky-50/80 via-background to-indigo-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
            <FileCode2 className="size-4 text-primary" /> 输入测试用例文档
          </CardTitle>
          <CardDescription>
              支持直接粘贴文本，或上传 PDF / DOCX / MD / TXT / 图片 / Excel 用例文档；可一次处理多条用例。
              选择「快速可执行」由本地程序即时生成可直接运行的 .robot（不调用模型）；选择「AI 生成」则调用所选模型生成更贴近语义的脚本。
              脚本中的 {`${"${BASE_URL}"}`} 与 {`${"${locator_N}"}`} 需按实际页面替换。
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="size-4 text-primary" /> 用例文本输入
            </h3>
          <Textarea
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            placeholder="请粘贴测试用例文档，例如：用例标题、前置条件、操作步骤、预期结果……"
            className="min-h-[190px] resize-y text-sm leading-relaxed"
            disabled={busy}
            aria-label="测试用例文档输入框"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className={cn(textChars > LIMITS.maxTextChars ? "text-destructive" : "text-muted-foreground")}>
              文本 <span className="font-mono">{textChars.toLocaleString()}</span> / {LIMITS.maxTextChars.toLocaleString()} 字符
              {imageCount > 0 && <> · 图片 <span className="font-mono">{imageCount}</span> 张</>}
            </span>
            {textChars > LIMITS.maxTextChars && <span className="text-destructive">内容超出字符上限</span>}
          </div>
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <UploadCloud className="size-4 text-primary" /> 用例文档上传
            </h3>
          <div
            role="button"
            tabIndex={0}
            onDragEnter={(event) => {
              if (!isFileDrag(event) || busy) return;
              event.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(event) => {
              if (!isFileDrag(event) || busy) return;
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              if (!busy && isFileDrag(event)) void onFiles(event.dataTransfer.files);
            }}
            onClick={() => {
              if (!busy) fileInputRef.current?.click();
            }}
            onKeyDown={(event) => {
              if (!busy && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={cn(
              "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-7 text-center transition-all",
              busy && "cursor-not-allowed opacity-60",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-primary/[0.03]",
            )}
          >
            <div className={cn("flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary", !busy && "transition-transform group-hover:-translate-y-1")}>
              <UploadCloud className="size-5" />
            </div>
            <p className="text-sm font-medium">点击选择或拖拽测试用例文档到此处</p>
            <p className="text-xs text-muted-foreground">支持 PDF / DOCX / MD / TXT / PNG / JPG / WEBP / XLSX / XLSM，可多选</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.md,.markdown,.txt,.xlsx,.xlsm,.png,.jpg,.jpeg,.webp"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                void onFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>

          {(sources.length > 0 || spreadsheetFiles.length > 0) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">已添加文档</p>
                <Button variant="ghost" size="sm" onClick={clearInput} disabled={busy}>
                  <Trash2 className="size-4" /> 清空
                </Button>
              </div>
              {sources.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-background/70 px-3 py-2 text-sm">
                  {item.status === "parsing" ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <FileText className="size-4 text-emerald-600" />}
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="text-xs text-muted-foreground">{item.status === "success" ? `${formatBytes(item.size)} · 已解析` : item.error ?? "解析失败"}</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setSources((current) => current.filter((source) => source.id !== item.id))} disabled={busy} aria-label={`删除 ${item.name}`}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              {spreadsheetFiles.map((item) => (
                <div key={`${item.name}-${item.size}`} className="flex flex-wrap items-center gap-2 rounded-md border bg-background/70 px-3 py-2 text-sm">
                  <FileSpreadsheet className="size-4 text-emerald-600" />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="text-xs text-muted-foreground">{formatBytes(item.size)} · 已解析 {item.cases.length} 条用例</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setSpreadsheetFiles((current) => current.filter((file) => !(file.name === item.name && file.size === item.size)))} disabled={busy} aria-label={`删除 ${item.name}`}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <FileCode2 className="size-4 text-primary" /> 网页HTML源码（支持多页面，选填）
            </h3>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{htmlBlocks.length} 个页面 · 共 <span className="font-mono">{htmlChars.toLocaleString()}</span> 字符</span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={addHtmlBlock} disabled={busy}>
                    <Plus className="size-4" /> 添加页面
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {htmlBlocks.map((block, index) => (
                  <div key={block.id} className="space-y-2 rounded-md border border-border/80 bg-background/50 p-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={block.page}
                        onChange={(event) => updateHtmlBlock(block.id, { page: event.target.value })}
                        placeholder="页面A / 页面B / 页面C…"
                        aria-label={`第 ${index + 1} 个源码所属页面标识`}
                        disabled={busy}
                        className="h-8 w-full max-w-[200px] rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                      />
                      {htmlBlocks.length > 1 && (
                        <button
                          type="button"
                          className="ml-auto rounded p-1.5 text-muted-foreground hover:text-destructive"
                          onClick={() => removeHtmlBlock(block.id)}
                          disabled={busy}
                          aria-label={`删除 ${block.page || "页面"}源码`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                    <Textarea
                      value={block.source}
                      onChange={(event) => updateHtmlBlock(block.id, { source: event.target.value })}
                      placeholder="浏览器F12，复制该页面完整HTML源码粘贴到此处；用例发生页面跳转时请为每个页面分别粘贴并填写页面标识"
                      className="h-[180px] resize-none overflow-auto font-mono text-xs leading-relaxed"
                      disabled={busy}
                      spellCheck={false}
                      aria-label={`${block.page || "页面"}的HTML源码`}
                    />
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                直接在浏览器按 F12 复制各页面完整 HTML，并为每段填写页面标识（页面A/页面B…）。模型会按「页面标识 → 源码」解析每个页面的真实 id / xpath；用例发生 A 跳转到 B 时自动切换对应页面的元素定位。全程不填则生成带注释占位符的脚本骨架。
              </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1 self-start rounded-md border bg-muted/50 p-0.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => setMode("fast")}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                  mode === "fast" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                快速可执行
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setMode("ai")}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                  mode === "ai" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                AI 生成
              </button>
            </div>
            <div className="flex items-center gap-2">
              {busy && <Button variant="outline" onClick={cancelGeneration}><Square className="size-4" /> 停止生成</Button>}
              <Button disabled={!canRun} onClick={() => void generateScripts()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <FileCode2 className="size-4" />}
                {phase === "done" ? "重新生成自动化测试脚本" : "生成自动化测试脚本"}
              </Button>
            </div>
          </div>
          {!config.model.trim() && <p className="text-right text-xs text-destructive">请先在左侧模型配置中选择模型</p>}
          </section>
        </CardContent>
      </Card>

      {phase !== "idle" && (
        <Card id="script-generation-status" className={phase === "done" ? "animate-success-pulse" : "animate-fade-rise"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
              {phase === "error" ? <AlertTriangle className="size-4 text-destructive" /> : phase === "done" ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Loader2 className="size-4 animate-spin text-primary" />}
              自动化脚本生成状态
              <Badge variant="outline" className="font-mono">模型：{config.model || "未选择"}</Badge>
            </CardTitle>
            <CardDescription>
              {phase === "parsing" ? SCRIPT_STATUS_MESSAGES[statusIndex] : phase === "generating" ? statusDetail || SCRIPT_GENERATION_MESSAGE : phase === "done" ? statusDetail : "生成失败，可修改输入后重试。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-32 flex-col items-center justify-center gap-3 text-center">
            {(phase === "parsing" || phase === "generating") && <Loader2 className="size-9 animate-spin text-primary" />}
            {phase === "parsing" && <p className="text-sm text-muted-foreground">正在从文档中提取全部测试用例，请稍候…</p>}
            {phase === "generating" && <p className="text-sm text-muted-foreground">已解析 {parsedCases.length} 条用例，脚本会按原始顺序逐条生成。</p>}
            {phase === "done" && <p className="text-sm font-medium">已解析 {parsedCases.length} 条用例，生成结果已展示在下方。</p>}
            {phase === "error" && (
              <>
                <AlertTriangle className="size-9 text-destructive" />
                <p className="max-w-2xl text-sm text-destructive">{error}</p>
                <Button variant="outline" onClick={() => void generateScripts()} disabled={!hasInput || !config.model.trim()}>
                  <RefreshCw className="size-4" /> 重试
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {scriptResults.length > 0 && (
        <Card id="script-results">
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
                生成结果 <Badge variant="secondary" className="font-mono">{scriptResults.filter((item) => item.script).length}/{scriptResults.length}</Badge>
              </CardTitle>
              <CardDescription>每条用例对应一份可执行的 Robot Framework + SeleniumLibrary WebUI 脚本。快速可执行模式为本地确定性生成，语法合法可直接运行；AI 生成模式则调用模型生成更丰富的步骤。</CardDescription>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索用例标题或模块"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] sm:w-64"
              aria-label="搜索生成结果"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {filteredResults.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">没有匹配的生成结果</p>
            ) : (
              filteredResults.map((item) => <ScriptResultCard key={item.testCase.id} item={item} onCopy={copyScript} />)
            )}
          </CardContent>
        </Card>
      )}

      {!hasInput && phase === "idle" && (
        <Card>
          <CardContent className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
            <FileCode2 className="size-8 text-primary" />
            <p className="text-sm text-muted-foreground">输入或上传测试用例文档后，即可批量生成自动化测试脚本。</p>
            <Button variant="outline" onClick={() => setActiveFeature("gen")}>没有测试用例？先去生成测试用例</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScriptResultCard({ item, onCopy }: { item: ScriptResultItem; onCopy: (script: string) => void }) {
  const { testCase } = item;
  return (
    <div className="space-y-3 rounded-lg border bg-background/70 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{testCase.id}</span>
            {testCase.module && <Badge variant="outline">{testCase.module}</Badge>}
            {testCase.priority && <Badge variant={testCase.priority === "P0" ? "destructive" : testCase.priority === "P1" ? "warning" : "secondary"}>{testCase.priority}</Badge>}
            <Badge variant="outline">Robot Framework WebUI</Badge>
          </div>
          <h3 className="text-sm font-semibold">{testCase.title || "未命名用例"}</h3>
          <p className="text-xs text-muted-foreground">步骤 {testCase.steps.length} 步 · 预期：{testCase.expected || "无"}</p>
        </div>
        {item.script && (
          <div className="flex w-full shrink-0 flex-row gap-2 sm:w-auto">
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => onCopy(item.script!)}><Clipboard className="size-4" /> 复制脚本</Button>
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => downloadRobotScript(item)}><Download className="size-4" /> 下载脚本</Button>
          </div>
        )}
      </div>

      {item.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          <div className="flex items-center gap-2"><AlertTriangle className="size-4" />{item.error}</div>
        </div>
      ) : item.script ? (
        <ScriptHighlight code={item.script} />
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>生成时间：{item.generatedAt}</span>
        <span>模型：<span className="font-mono">{item.model}</span></span>
      </div>
    </div>
  );
}
