import type { TestCase } from "@/types";

/**
 * 本地确定性可执行 Robot Framework 脚本生成器。
 * 不依赖 AI：按语义规则把一条手工测试用例编译成语法合法、可直接 `robot` 运行的 .robot 骨架。
 * 页面 URL 与元素定位留作可编辑变量（带默认值保证脚本能启动），由测试工程师按真实页面替换。
 */

function toCaseName(title: string, fallback: string): string {
  const name = (title || fallback).trim().replace(/[\[\]\r\n]/g, "");
  return name || "自动化用例";
}

/** 抽取步骤里中文/英文引号包裹的内容作为取值文本 */
function quotedText(step: string): string | null {
  const match = step.match(/[“"“”『「]([^”"”』」]+)[”"”』」]/);
  return match ? match[1].trim() : null;
}

interface CompiledCase {
  /** *** Variables *** 段新增的定位符等绑定 */
  bindings: Record<string, string>;
  /** Test Case 体内指令 */
  lines: string[];
}

/** 把一条用例编译成可执行的 .robot（变量 + 指令）。 */
function compileCase(testCase: TestCase, opts: { baseUrl: string; browser: string }): CompiledCase {
  const bindings: Record<string, string> = {
    BASE_URL: opts.baseUrl,
    BROWSER: opts.browser,
    FILE_PATH: "C:/path/to/your/file",
  };
  let counter = 0;
  const newLocator = (): string => {
    counter += 1;
    const key = `locator_${counter}`;
    bindings[key] = `id=element_${counter}`;
    return key;
  };

  const lines: string[] = [];
  const has = (step: string, keys: string[]) => keys.some((k) => step.includes(k));

  for (const step of testCase.steps ?? []) {
    const raw = step.trim();
    if (!raw) continue;
    const s = raw;

    if (has(s, ["打开浏览器", "访问", "跳转", "打开地址", "前往"])) {
      lines.push("    Open Browser    ${BASE_URL}    ${BROWSER}");
    } else if (has(s, ["输入密码", "填写密码"])) {
      const loc = newLocator();
      const value = quotedText(s) ?? "test_password";
      lines.push(`    Input Password    ${"${" + loc + "}"}    ${value}`);
    } else if (has(s, ["输入", "填写", "键入"])) {
      const loc = newLocator();
      const value = quotedText(s) ?? "test_value";
      lines.push(`    Input Text    ${"${" + loc + "}"}    ${value}`);
    } else if (has(s, ["点击", "按下", "选中", "勾选", "确认", "提交", "登录"])) {
      const loc = newLocator();
      lines.push(`    Click Element    ${"${" + loc + "}"}`);
    } else if (has(s, ["选择", "切换"])) {
      const loc = newLocator();
      const value = quotedText(s) ?? "选项";
      lines.push(`    Select From List By Label    ${"${" + loc + "}"}    ${value}`);
    } else if (has(s, ["上传", "选择文件"])) {
      const loc = newLocator();
      lines.push(`    Choose File    ${"${" + loc + "}"}    ${"${FILE_PATH}"}`);
    } else if (has(s, ["等待", "直至", "直到", "sleep"])) {
      lines.push("    Sleep    1s");
    } else if (has(s, ["清空"])) {
      const loc = newLocator();
      lines.push(`    Clear Element Text    ${"${" + loc + "}"}`);
    } else if (has(s, ["断言", "校验", "验证", "应展示", "应显示", "应提示", "页面显示", "页面包含"])) {
      const text = quotedText(s) ?? s;
      lines.push(`    Page Should Contain    ${text}`);
    } else {
      // 无法识别的步骤以注释保留，便于人工补充关键字
      lines.push(`    # 待补充：${raw}`);
    }
  }

  // 预期结果转文本断言；无法可靠断言时以注释提示
  if (testCase.expected?.trim()) {
    lines.push(`    # 预期结果：${testCase.expected.trim()}`);
    lines.push(`    Page Should Contain    ${testCase.expected.trim().slice(0, 60)}`);
  }
  lines.push("    Close Window");

  return { bindings, lines };
}

/** 生成一份完整可执行的 .robot 文本 */
export function buildExecutableRobotScript(
  testCase: TestCase,
  opts?: { baseUrl?: string; browser?: string },
): string {
  const { baseUrl, browser } = opts ?? {};
  const compiled = compileCase(testCase, {
    baseUrl: baseUrl ?? "http://localhost:5173",
    browser: browser ?? "chrome",
  });

  const variables = Object.entries(compiled.bindings)
    .map(([key, value]) => `${"${" + key + "}"}    ${value}`)
    .join("\n");

  const caseName = toCaseName(testCase.title, testCase.id || "自动化用例");
  const doc = [testCase.precondition, testCase.expected].filter(Boolean).join("；") || caseName;

  return [
    "*** Settings ***",
    "Library    SeleniumLibrary",
    "Suite Teardown    Close All Browsers",
    "",
    "*** Variables ***",
    variables,
    "",
    "*** Test Cases ***",
    caseName,
    `    [Documentation]    ${doc}`,
    "    [Timeout]    60s",
    ...compiled.lines,
    "",
    `# 由「本地确定性生成」产生，可执行。${"${BASE_URL}"} 与各 ${"${locator_N}"} 请按被测页面替换。`,
  ].join("\n");
}