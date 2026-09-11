import type { TestCase } from "@/types";
import { renumberCases, salvageJson, tryParseJson, validateGeneration } from "@/lib/schema";

/**
 * 固定的自动化脚本生成约束。
 * 这里生成的是便于人工补齐定位符的 Robot Framework WebUI 骨架，
 * 不尝试访问真实页面，也不把脚本输出包装成 JSON。
 */
export const SCRIPT_SYSTEM_PROMPT = `你是资深 Web UI 自动化测试工程师。请把用户提供的一条手工测试用例转换为 Robot Framework + SeleniumLibrary 的 WebUI 自动化脚本骨架。

必须遵守以下规则：
1. 只根据测试用例的标题、前置条件、操作步骤和预期结果生成脚本，不要臆造需求中没有出现的业务规则。
2. 只输出完整的 Robot Framework 纯文本脚本，不要输出 Markdown 代码围栏、解释、分析或其他前后缀。
3. 脚本必须包含 *** Settings *** 段，并引入 SeleniumLibrary；必须包含 *** Test Cases *** 段和一个清晰的测试用例名称。
4. 把手工步骤映射为可读的 SeleniumLibrary 关键字，例如 Open Browser、Input Text、Input Password、Click Element、Wait Until Element Is Visible、Page Should Contain、Sleep、Close Browser。根据原用例语义选择关键字，不要为了凑数量添加无关操作。
5. 页面 URL 未明确时使用占位符 \${url}；元素定位统一使用占位符 \${locator}，可以按用途区分为 \${username_locator}、\${password_locator} 等变量，但不要编造真实 CSS、XPath、ID 或 URL。
6. 将预期结果转换为明确的断言或验证步骤；无法自动断言的内容用注释标明需要人工补充，不要假装已经验证。
7. 前置条件需要在脚本中以注释或初始化步骤体现；步骤应保持原始顺序，必要时添加合理的等待关键字。
8. 脚本应具备可读的缩进、变量命名和注释，末尾负责清理浏览器资源。不要生成接口测试、移动端 App 测试或其他非 WebUI 脚本。

输出目标：一个可供测试工程师继续补充定位符和环境配置的 Robot Framework WebUI 脚本骨架。`;

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

/** 组装单条测试用例的脚本生成消息。 */
export function buildScriptMessages(testCase: TestCase): Array<{ role: "system" | "user"; content: string }> {
  const steps = testCase.steps?.length > 0 ? testCase.steps.join("\n") : "无";
  const userContent = [
    "请将下面这条手工测试用例转换为 Robot Framework + SeleniumLibrary WebUI 自动化脚本。",
    "",
    `【用例 ID】${valueOrNone(testCase.id)}`,
    `【用例标题】${valueOrNone(testCase.title)}`,
    `【前置条件】${valueOrNone(testCase.precondition)}`,
    "【操作步骤】",
    steps,
    `【预期结果】${valueOrNone(testCase.expected)}`,
    "",
    "补充约束（固定，不可修改）：页面 URL 未明确时使用占位符 \${url}；元素定位统一使用 \${locator}；只输出 Robot Framework 纯文本脚本，不要输出 Markdown 代码围栏或解释。",
  ].join("\n");

  return [
    { role: "system", content: SCRIPT_SYSTEM_PROMPT },
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
