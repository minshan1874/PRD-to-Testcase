import type { GenerateConfig, SourceItem } from "@/types";
import { BUILTIN_FIELDS } from "@/fieldSpec";
import { LIMITS } from "@/lib/limits";

const SCALE_GUIDES: Record<GenerateConfig["scale"], string> = {
  精简: "每个功能点 3~8 条，聚焦主干流程与关键异常",
  标准: "每个功能点 8~15 条，覆盖主流程、分支与常见异常/边界",
  全面: "每个功能点 15 条以上，穷举正常、边界、异常、安全、性能等维度",
};

const LANG_GUIDES: Record<GenerateConfig["lang"], string> = {
  自动识别: "使用与 PRD 文档相同的语言输出，若文档混用则以正文主体语言为准",
  中文: "全部内容使用简体中文输出",
  英文: "全部内容使用英文输出",
};

export interface BuiltPrompt {
  messages: Array<{ role: string; content: string }>;
  images: Array<{ mime: string; dataUrl: string }>;
  /** 文本总字符数（含截断提示），供统计展示 */
  textChars: number;
}

/** 当前可见且启用的字段 key 列表（决定生成内容与输出列） */
export function outputFieldKeys(config: GenerateConfig): string[] {
  return config.fields.filter((field) => field.visible && field.enabled).map((field) => field.key);
}

function enabledCustomKeys(config: GenerateConfig): string[] {
  return config.customFields
    .filter((f) => outputFieldKeys(config).includes(f.key))
    .map((f) => f.key);
}

/** 组装发给本地代理 → OpenRouter 的 messages 与图片 */
export function buildPrompt(sources: SourceItem[], config: GenerateConfig): BuiltPrompt {
  const customFieldKeys = enabledCustomKeys(config);
  const outputKeys = outputFieldLabels(config);
  const scale = SCALE_GUIDES[config.scale];
  const lang = LANG_GUIDES[config.lang];
  const testTypes = config.testTypes.join("、");

  const fieldSection = [
    "每条例用例必须包含以下字段（键名以 JSON key 为准）：",
    outputKeys.map((k) => `- ${k.key}：${k.label}`).join("\n"),
    "只生成上面字段清单中的字段；字段配置中隐藏或停用的字段禁止出现在 cases 中。",
    "id 必须输出空字符串，由本地程序统一连续编号，禁止自行编号；",
    customFieldKeys.length > 0
      ? `自定义字段（${customFieldKeys.map((k) => `custom_${k}`).join("、")}）：无内容时输出空字符串。`
      : "",
    "steps 为字符串数组，每步一条。",
  ]
    .filter(Boolean)
    .join("\n");

  const fieldRulesSection = [
    "各字段填写规则（只对本次实际存在的字段生效）：",
    "- id：输出空字符串（本地统一连续编号）。",
    "- module（模块）：填写测试点实际所属的一级功能模块，不得用整份需求文档的标题代替，不得留空。",
    "- featurePoint（功能点）：填写当前测试点所属的具体功能或父级路径，确保能够追溯到需求来源，不得留空。",
    "- title（用例标题）：采用『功能模块 - 具体功能描述』格式，见名知意、体现具体场景；存在不确定内容时在末尾标注『待人工确认』；禁止『验证功能是否正常』等模糊标题。",
    "- precondition（前置条件）：只填写执行用例必须满足的状态，不得包含具体操作步骤；没有必要前置条件时填空字符串。",
    "- steps（操作步骤）：带序号的单步可执行操作，每步是测试人员能执行的动作；合并多种触发方式时分别列出每种方式。",
    "- testData（测试数据）：填写需要的输入值、文件类型、边界值、账号状态、任务状态或参数组合；必须来源于需求或由需求合理推导。需求没有给出真实 ID、文件或账号时，不得填写『需求未提供具体测试数据』，应填写不依赖虚构具体值的语义化场景数据，例如『有效 job_id』『不存在的 job_id』『已过期的 job_id』『积分余额不足的账号』『会触发内容违规的测试素材』；只有测试场景、输入类别或参数含义都无法从需求确定时，才允许标记待人工确认。",
    "- expected（预期结果）：明确、可观察、可验证，必要时与步骤按序号对应；不得只写『功能正常』『结果正确』『符合预期』『显示正常』等不可验证描述。需求未明确的结果不得自行推断，应保留可确认部分并明确标记待人工确认。",
    "- priority（优先级）：只能填 P0/P1/P2/P3。P0=阻塞发布、严重数据或安全风险、核心功能完全不可用；P1=核心主流程、关键正向场景和主要业务功能；P2=一般交互、次要流程、常规异常与边界场景；P3=UI 细节、提示文案、体验优化和极端低概率场景。必须按绝对风险定义判断，不得按当前模块用例数量凑比例；仅当需求明确支持发布阻塞、严重数据或安全风险时才使用 P0。",
    "- caseType（用例类型）：只能填 功能测试/接口测试/性能测试/安全性测试/稳定性测试/兼容性测试 之一；存在多个目标时填写最主要的类型，没有明确非功能测试目标时优先使用功能测试或接口测试。",
    "- testType（测试类型）：按本次配置填写：${testTypes}。",
    "- status/actualResult/defectId（执行状态/实际结果/缺陷 ID）：输出空字符串（执行阶段填写）。",
    "- remark（备注）：用于『待人工确认：<具体事项>』『补充测试点』『下版本』等说明；不确定内容必须说明具体待确认事项，不能只写『待人工确认』；没有备注时填空字符串。",
  ].join("\n");

  const system = [
    "你是资深软件测试工程师。请根据用户提供的需求文档，生成标准化、可执行、可验证、可追溯的中文测试用例。",
    "输出约束：只能输出一个有效 JSON 对象。禁止输出 Markdown、代码围栏、CSV、解释、前后缀文字或思考过程。" + lang,
    "",
    "测试设计方法：针对每个测试点，根据需求特点综合使用：",
    "1. 场景法：基于完整业务流程、用户路径和状态变化设计用例；",
    "2. 等价类划分：识别有效等价类和无效等价类，选择有代表性的输入；",
    "3. 边界值分析：覆盖边界值、边界内一点和边界外一点；",
    "4. 正交分析法：当存在多个独立因素和大量组合时，选择有代表性的组合，避免组合爆炸；",
    "5. 错误推测：根据常见缺陷模式补充重复操作、快速操作、异常顺序、空值、错误格式、资源不足和操作中断等场景；",
    "6. 因果图：多个输入条件共同决定输出时，分析条件组合与结果之间的因果关系；",
    "7. 接口测试：若需求涉及接口，覆盖正常请求、异常请求、边界参数、鉴权、限流、幂等性、错误处理和状态变化，但不编造需求中没有的接口字段、状态码或业务规则；",
    "8. 非功能测试：仅在需求能够支持时补充性能、安全性、稳定性和兼容性测试。",
    "",
    "测试点覆盖规则：",
    "1. 不遗漏需求中明确描述的功能点、限制条件、状态和异常情况；",
    "2. 识别需求能够合理推导出的隐含测试点；",
    "3. 对合理推导但原需求没有直接写明的测试点，在备注中标记『补充测试点』（需求中已明确出现的任何内容都不是补充测试点，禁止误标）；",
    "4. 不得编造需求中没有给出的接口字段、业务规则、状态码、页面元素、验收标准或具体数值；",
    "5. 对需求中的『需要确认』『待确认』『下版本』『暂未确定』等内容，保留其原意，并在备注中填写『待人工确认：<具体未知点>』；不得因为某个局部信息未知，就把整条用例或整格测试数据笼统写成待人工确认；",
    "6. 如果预期结果无法从需求确定，不得自行确定；先填写能够确认的可观察结果，再只对无法确定的业务结论、具体数值或冲突点标记待人工确认。",
    "",
    "用例合并规则：",
    "1. 只有 前置条件、业务结果、优先级和用例类型 均相同，且仅触发方式不同 的测试点，才允许合并为一条用例；",
    "2. 合并后，应在测试步骤或测试数据中完整列出每种触发方式；",
    "3. 不同前置状态、不同业务结果、不同优先级或不同用例类型的测试点不得强行合并；",
    "4. 不得为了减少用例数量而损失测试点覆盖；",
    "5. 不同状态码、业务结果、状态、文件类型、边界值或操作状态的测试点必须拆成独立用例；",
    "6. 每条用例只聚焦一个核心验证目标；多个场景能够分别执行、分别判断通过或失败时，禁止压缩成一条『大而全』用例；",
    "7. 避免生成测试目的、步骤和预期结果完全相同的重复用例。",
    "",
    fieldRulesSection,
    "",
    "待人工确认使用规则：",
    "1. 『待人工确认』只用于需求确实缺失、相互冲突、疑似笔误或尚未确定的业务信息，不得作为缺少真实测试账号、文件、ID 或请求样例时的通用占位文字；",
    "2. 能从用例标题、前置条件、步骤或需求路径确定输入类别和状态时，必须将其转换为语义化测试数据，不得留空，也不得整格只写『待人工确认』；",
    "3. 业务规则只有一部分未知时，只标记未知部分：例如测试数据写『时长 7s』，预期结果填写能够确认的接口行为，备注写『待人工确认：最终输出视频时长』；",
    "4. 场景明确但构造方法依赖后端、测试环境或数据准备时，应保留场景化测试数据，并把『如何稳定构造该场景』写入备注待确认。",
    "",
    "生成前检查：",
    "1. 需求中的每个测试点是否至少有一条用例覆盖；",
    "2. 正常、异常、边界和状态变化场景是否合理覆盖；",
    "3. 是否存在可以合并的重复用例；",
    "4. 用例标题是否见名知意；",
    "5. 步骤是否清晰可执行；",
    "6. 预期结果是否明确可验证；",
    "7. 补充测试点是否已标记；",
    "8. 待人工确认是否只标记了具体未知点，没有把可描述的测试场景笼统替换成待人工确认；",
    "9. 优先级是否符合绝对风险定义，相似风险使用一致优先级；",
    "10. 完成检查后，只输出符合约定的 JSON 对象。",
    "",
    "其他约束：",
    `用例规模：${config.scale}（${scale}）`,
    "仅输出 JSON；不要输出任何解释、markdown 代码块标记或多余文字。",
  ]
    .filter(Boolean)
    .join("\n");

  const coverageSection = [
    "metrics：",
    "- coverage：记录每个「功能点 × 测试类型」的用例数量、覆盖状态（已覆盖/部分覆盖/未覆盖）与风险等级（低/中/高）；",
    "- risksAndAssumptions：生成过程中的风险与假设（标注『假设值，需确认』）；",
    "- confirmations：所有待确认项（需求缺失/冲突/未确定的业务信息），每条含问题描述、影响、来源位置、建议确认内容；",
    config.trace.enabled
      ? "- evidence：每条用例对应的 PRD 片段与来源位置（PDF 用「第 N 页」，其他文档用章节标题）；"
      : "- evidence：输出空数组（未开启追溯）；",
    "- modelUsed：固定返回 \"${config.model}\"。",
  ].join("\n");

  const body = buildBody(sources);

  const user = [
    "请根据以下需求内容与配置生成测试用例。",
    `测试类型：${testTypes}`,
    fieldSection,
    coverageSection,
    "输出 JSON 结构（顶层 keys 必须完整，cases 中每条的 id 为 \"\"；cases 只能包含字段清单中的字段）：",
    `{ "cases": [{ ${outputKeys.map((k) => `${k.key}${k.key === "id" ? ': ""' : ""}`).join(", ")} }], "coverage": [{ feature, testType, count, coverageStatus, riskLevel }], "risksAndAssumptions": ["..."], "confirmations": [{ problem, impact, sourceLocation, confirmSuggestion }], "evidence": [{ caseId, prdSnippet, location }], "modelUsed": "..." }`,
    "====== 需求内容 ======",
    body.text,
  ].join("\n\n");

  return { messages: [{ role: "system", content: system }, { role: "user", content: user }], images: body.images, textChars: body.text.length };
}

function buildBody(sources: SourceItem[]): { text: string; images: Array<{ mime: string; dataUrl: string }> } {
  const sections: string[] = [];
  const images: Array<{ mime: string; dataUrl: string }> = [];
  let chars = 0;

  for (const s of sources) {
    if (s.status !== "success") continue;
    // 扫描件 PDF：页面图片（跟随来源原始顺序）
    if (s.kind === "pdf" && s.pageImages && s.pageImages.length > 0 && s.forceAsImage) {
      for (let i = 0; i < s.pageImages.length; i++) {
        images.push({ mime: "image/jpeg", dataUrl: s.pageImages[i] });
        sections.push(`[来源：${s.name} - 图片第 ${i + 1} 页]`);
      }
      continue;
    }
    if (s.kind === "pdf" && s.pageImages && s.pageImages.length > 0 && !s.text) {
      for (let i = 0; i < s.pageImages.length; i++) {
        images.push({ mime: "image/jpeg", dataUrl: s.pageImages[i] });
      }
      sections.push(`[来源：${s.name}（扫描件，共 ${s.pageImages.length} 页图片，按图片顺序视为页码）]`);
      continue;
    }
    if (s.kind === "image" && s.image) {
      images.push({ mime: mimeFromDataUrl(s.image), dataUrl: s.image });
      sections.push(`[来源：${s.name}（截图）]`);
      continue;
    }
    if (s.text && s.text.length > 0) {
      let t = s.text;
      // 超长保护：截断并提示
      const remaining = LIMITS.maxTextChars - chars;
      if (t.length > remaining) {
        t = t.slice(0, Math.max(0, remaining));
        sections.push(`[来源：${s.name}（内容过长，已截断至前 ${t.length.toLocaleString()} 字符，超出部分忽略）]`);
      } else {
        sections.push(`[来源：${s.name}]`);
      }
      chars += t.length;
      sections.push(`\`\`\`\n${t}\n\`\`\``);
    } else if (s.error) {
      sections.push(`[来源：${s.name} 解析失败，已跳过：${s.error}]`);
    }
  }

  return { text: sections.join("\n\n"), images };
}

function mimeFromDataUrl(dataUrl: string): string {
  return dataUrl.slice(5, dataUrl.indexOf(";")) || "image/png";
}

/** 输出字段清单：按字段配置顺序返回当前可见且启用的字段 */
export function outputFieldLabels(config: GenerateConfig): Array<{ key: string; label: string }> {
  const definitions = new Map([...BUILTIN_FIELDS, ...config.customFields].map((field) => [field.key, field]));
  return config.fields
    .filter((field) => field.visible && field.enabled)
    .map((field) => {
      const definition = definitions.get(field.key);
      return {
        key: field.key.startsWith("cf_") ? `custom_${field.key}` : field.key,
        label: definition?.label ?? field.key,
      };
    });
}
