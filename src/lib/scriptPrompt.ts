import type { TestCase } from "@/types";
import { renumberCases, salvageJson, tryParseJson, validateGeneration } from "@/lib/schema";

/**
 * HTML 源码已提供：解析 HTML 提取真实 id/xpath 定位符，生成尽量可直接运行的脚本。
 */
export const SCRIPT_PROMPT_WITH_HTML = `你是专业自动化脚本生成工具。
输入包含手工测试用例、网页HTML源码。
任务：解析提供的HTML源码，找出操作步骤对应的页面控件，提取真实id或者简洁xpath定位器，生成Robot Framework + SeleniumLibrary WebUI自动化脚本。

严格遵守规则：
1、输出完整标准robot脚本，包含***Settings***、***Test Cases***段落，使用SeleniumLibrary官方原生关键字。
2、优先使用id定位元素，没有id就写简短稳定xpath；禁止使用绝对xpath。
3、根据用例操作步骤：打开页面、输入文本、点击元素、页面等待；根据预期结果自动编写断言关键字。
4、加入合理Sleep等待，适配页面加载。
5、脚本缩进格式严格正确，只输出脚本内容，不要任何解释、不要markdown多余文字。`;

/**
 * HTML 源码为空：生成带注释占位符的脚本骨架，由用户自行替换元素定位。
 */
export const SCRIPT_PROMPT_WITHOUT_HTML = `你是专业的自动化脚本生成工具，根据用户提供的手工测试用例，生成标准 Robot Framework + SeleniumLibrary WebUI 自动化脚本。

严格遵守规则：
1、输出完整标准robot脚本，包含***Settings***、***Test Cases***段落，使用SeleniumLibrary官方原生关键字。
2、所有页面元素使用带注释的占位符，格式 \${变量名} #这里写元素中文说明，提示用户替换为真实id/xpath定位。
3、根据操作步骤完成逻辑：打开浏览器、输入、点击、等待；根据预期结果生成断言。
4、脚本缩进格式整洁规范。
5、只输出robot脚本，不要任何额外解释文字。`;

/** 测试用例文档解析使用的固定提示词。输出只保留手工用例，不生成脚本。 */
export const SCRIPT_EXTRACTION_SYSTEM_PROMPT = `你是测试用例文档解析助手。请从用户提供的测试用例文档中提取已有的手工测试用例，并整理为 JSON。

必须遵守以下规则：
1. 只提取文档中明确存在的测试用例，不要根据常识补造业务场景，不要把需求说明、字段说明或目录当成测试用例。
2. 将每条用例的标题、前置条件、操作步骤和预期结果准确保留；操作步骤必须按原文顺序放入 steps 字符串数组。
3. 文档中的编号、模块、功能点、测试类型、用例类型、优先级、测试数据、备注等信息有就保留，没有就输出空字符串；id 由本地程序重新连续编号。
4. 只输出一个 JSON 对象，不要输出 Markdown 代码围栏、解释或其他文字。JSON 顶层必须包含 cases 数组。
5. cases 中每条对象必须包含这些键：id、module、featurePoint、title、testType、caseType、priority、precondition、testData、steps、expected、status、actualResult、defectId、remark。

输出示例结构（内容仅示意，不能照抄）：
{"cases":[{"id":"","module":"登录","featurePoint":"密码校验","title":"验证密码为空时提示必填","testType":"异常","caseType":"功能测试","priority":"P1","precondition":"已进入登录页","testData":"密码为空","steps":["输入用户名","点击登录"],"expected":"密码输入框展示必填提示","status":"未执行","actualResult":"","defectId":"","remark":""}]}`;

function valueOrNone(value: string | undefined | null): string {
  const text = value?.trim();
  return text || "无";
}

/** 组装单条测试用例的脚本生成消息。htmlSource 非空时使用带 HTML 解析的 Prompt，为空时使用占位符骨架 Prompt。 */
export function buildScriptMessages(
  testCase: TestCase,
  htmlSource?: string,
): Array<{ role: "system" | "user"; content: string }> {
  const hasHtml = Boolean(htmlSource?.trim());
  const steps = testCase.steps?.length > 0 ? testCase.steps.join("\n") : "无";
  const caseSections = [
    `【用例 ID】${valueOrNone(testCase.id)}`,
    `【用例标题】${valueOrNone(testCase.title)}`,
    `【前置条件】${valueOrNone(testCase.precondition)}`,
    "【操作步骤】",
    steps,
    `【预期结果】${valueOrNone(testCase.expected)}`,
  ].join("\n");

  const userContent = hasHtml
    ? ["【手工测试用例】", caseSections, "", "【网页HTML源码】", htmlSource!.trim()].join("\n")
    : [
        "请将下面这条手工测试用例转换为 Robot Framework + SeleniumLibrary WebUI 自动化脚本。",
        "",
        caseSections,
        "只输出 Robot Framework 纯文本脚本，不要输出 Markdown 代码围栏或解释。",
      ].join("\n");

  return [
    { role: "system", content: hasHtml ? SCRIPT_PROMPT_WITH_HTML : SCRIPT_PROMPT_WITHOUT_HTML },
    { role: "user", content: userContent },
  ];
}

/** 组装测试用例文档解析消息。marker 供 mock 模式识别，不影响真实模型语义。 */
export function buildTestCaseExtractionMessages(documentText: string): Array<{ role: "system" | "user"; content: string }> {
  const content = documentText.trim() || "（文档未提取到文本，请结合附件图片识别用例。）";
  return [
    { role: "system", content: SCRIPT_EXTRACTION_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "SCRIPT_CASE_EXTRACTION",
        "请解析下面的测试用例文档，提取全部测试用例并按文档原始顺序输出。",
        "如果同一条用例跨多行，请合并到对应字段；不要遗漏后续用例。",
        "====== 测试用例文档 ======",
        content,
      ].join("\n\n"),
    },
  ];
}

export type TestCaseExtractionOutcome =
  | { ok: true; cases: TestCase[] }
  | { ok: false; reason: string };

/** 解析模型返回的测试用例 JSON，兼容裸数组、代码围栏和缺省辅助字段。 */
export function parseTestCaseExtraction(content: string): TestCaseExtractionOutcome {
  let candidate = tryParseJson(content);
  if (candidate === null) candidate = salvageJson(content);
  if (Array.isArray(candidate)) candidate = { cases: candidate };
  if (candidate && typeof candidate === "object") {
    try {
      const checked = validateGeneration(JSON.stringify(candidate), [], [
        "id",
        "module",
        "featurePoint",
        "title",
        "testType",
        "caseType",
        "priority",
        "precondition",
        "testData",
        "steps",
        "expected",
        "status",
        "actualResult",
        "defectId",
        "remark",
      ]);
      if (checked.ok) {
        const cases = checked.result.cases.filter(
          (item) => item.title.trim() || item.steps.length > 0 || item.expected.trim(),
        );
        if (cases.length > 0) return { ok: true, cases: renumberCases(cases) };
      }
    } catch {
      // 统一返回可读错误，避免把解析器内部异常暴露给用户。
    }
  }
  return { ok: false, reason: "未能从文档中解析出测试用例，请检查文档内容或换一种格式重试" };
}
