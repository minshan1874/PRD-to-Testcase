import type { GenerationResult, ReviewResult } from "@/types";
import type { CatalogModel } from "@/lib/api";

// ===== 示例模型与固定演示结果（由 output/*.xlsx 一次性解析生成，勿手改） =====

export const DEMO_MODEL_ID = "demo/sample-flow";

export const DEMO_MODEL: CatalogModel = {
  id: DEMO_MODEL_ID,
  name: "SampleFlow Demo",
  description: "固定演示流程：不调用真实模型，生成/评审各模拟约 10 秒后输出示例结果",
  created: 2020000000,
  pricing: { prompt: "0", completion: "0" },
  supportsImage: true,
  supportsJsonSchema: true,
};

export function isDemoModel(id: string): boolean {
  return id === DEMO_MODEL_ID;
}

/** 假 loading：监听 signal，支持被 AbortController 取消 */
export function delay(ms: number, controller: AbortController): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(t); controller.signal.removeEventListener("abort", onAbort); reject(new DOMException("请求已停止", "AbortError")); };
    const t = setTimeout(() => { controller.signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
}

export const SAMPLE_GENERATION_RESULT: GenerationResult = {
  "cases": [
    {
      "id": "",
      "module": "TC-001",
      "title": "图生视频",
      "priority": "验证图生视频页面展示模型、图片上传、描述输入及生成配置控件",
      "precondition": "P0",
      "testData": "已打开图生视频页面",
      "steps": [
        "无"
      ],
      "expected": "1. 查看页面顶部标题及模型区域。\n2. 查看图片上传区域、描述输入区域、音效开关、多镜头开关、时长选项、分辨率选项和“创作”按钮。",
      "actualResult": "1. 页面展示“图生视频”标题，模型区域展示“PixVerse 6”。\n2. 页面展示图片上传区域，并显示支持格式提示“仅支持上传 JPG、PNG、JPEG 和 WEBP”；描述输入区域显示字符计数“0/1500”；页面展示音效、多镜头、时长、分辨率和“创作”控件。",
      "remark": "",
      "caseType": "主流程页面基础展示；页面截图为唯一需求来源。",
      "featurePoint": "",
      "testType": "主流程页面基础展示；页面截图为唯一需求来源。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-002",
      "title": "图生视频",
      "priority": "验证图生视频-上传JPG、PNG、JPEG和WEBP图片可被选择",
      "precondition": "P1",
      "testData": "已打开图生视频页面，设备中准备可正常读取的图片文件",
      "steps": [
        "参数化文件集：test-valid.jpg（JPG，1920×1080，5MB）、test-valid.png（PNG，1920×1080，5MB）、test-valid.jpeg（JPEG，1920×1080，5MB）、test-valid.webp（WEBP，1920×1080，5MB）"
      ],
      "expected": "1. 点击图片上传区域，选择test-valid.jpg，检查选择结果。\n2. 清空已选图片或重新打开上传区域，选择test-valid.png，检查选择结果。\n3. 清空已选图片或重新打开上传区域，选择test-valid.jpeg，检查选择结果。\n4. 清空已选图片或重新打开上传区域，选择test-valid.webp，检查选择结果。",
      "actualResult": "1. JPG文件可被选择并在图片上传区域展示已选图片状态。\n2. PNG文件可被选择并在图片上传区域展示已选图片状态。\n3. JPEG文件可被选择并在图片上传区域展示已选图片状态。\n4. WEBP文件可被选择并在图片上传区域展示已选图片状态。",
      "remark": "",
      "caseType": "格式支持来自截图；文件尺寸为可复现代表性测试数据，需求未规定图片大小限制，尺寸限制规则待人工确认。",
      "featurePoint": "",
      "testType": "格式支持来自截图；文件尺寸为可复现代表性测试数据，需求未规定图片大小限制，尺寸限制规则待人工确认。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-003",
      "title": "图生视频",
      "priority": "验证图生视频-选择GIF等不支持格式图片时拒绝选择",
      "precondition": "P1",
      "testData": "已打开图生视频页面，设备中准备可正常读取的非支持格式文件",
      "steps": [
        "test-unsupported.gif（GIF，1920×1080，5MB）"
      ],
      "expected": "1. 点击图片上传区域。\n2. 在文件选择器中选择test-unsupported.gif。\n3. 观察选择器和图片上传区域状态。",
      "actualResult": "不支持的GIF文件不能作为有效图片进入上传区域；页面保持未上传有效图片状态，并给出可观察的拒绝表现。具体提示文案待人工确认。",
      "remark": "",
      "caseType": "『补充测试点』；需求明确支持格式，但未明确拒绝发生在文件选择器还是上传后。待人工确认：拒绝时机及提示文案。",
      "featurePoint": "",
      "testType": "『补充测试点』；需求明确支持格式，但未明确拒绝发生在文件选择器还是上传后。待人工确认：拒绝时机及提示文案。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-004",
      "title": "图生视频",
      "priority": "验证图生视频-上传空图片和损坏图片时拒绝处理",
      "precondition": "P1",
      "testData": "已打开图生视频页面，设备中准备文件",
      "steps": [
        "参数化文件集：empty.jpg（JPG，0字节）；corrupted.png（PNG扩展名但文件内容损坏，0字节）"
      ],
      "expected": "1. 点击图片上传区域，选择empty.jpg，观察上传区域状态。\n2. 清空已选文件或重新打开页面，选择corrupted.png，观察上传区域状态。",
      "actualResult": "1. 空文件不能作为有效图片完成上传，页面展示失败或拒绝状态。\n2. 损坏图片不能作为有效图片完成上传，页面展示失败或拒绝状态。\n具体提示文案和校验发生阶段待人工确认。",
      "remark": "",
      "caseType": "『补充测试点』；待人工确认：空文件和损坏文件的校验阶段、提示文案及是否允许重新选择。",
      "featurePoint": "",
      "testType": "『补充测试点』；待人工确认：空文件和损坏文件的校验阶段、提示文案及是否允许重新选择。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-005",
      "title": "图生视频",
      "priority": "验证图生视频-描述输入1500个字符达到最大长度限制",
      "precondition": "P1",
      "testData": "已打开图生视频页面",
      "steps": [
        "描述文本：1500个中文字符，不含换行；计数按页面字符计数规则验证"
      ],
      "expected": "1. 点击描述输入区域。\n2. 输入1500个中文字符。\n3. 查看输入框内容和字符计数。",
      "actualResult": "输入框可展示已输入内容，字符计数显示“1500/1500”；输入未超过页面显示的1500上限。",
      "remark": "",
      "caseType": "需求明确上限为1500，但未明确中文、英文、emoji和换行的计数规则；本用例使用中文字符，其他字符计数规则待人工确认。",
      "featurePoint": "",
      "testType": "需求明确上限为1500，但未明确中文、英文、emoji和换行的计数规则；本用例使用中文字符，其他字符计数规则待人工确认。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-006",
      "title": "图生视频",
      "priority": "验证图生视频-描述输入超过1500个字符时限制继续输入",
      "precondition": "P1",
      "testData": "已打开图生视频页面",
      "steps": [
        "描述文本：1501个中文字符，不含换行；计数按页面字符计数规则验证"
      ],
      "expected": "1. 点击描述输入区域。\n2. 输入1501个中文字符。\n3. 查看输入框内容和字符计数。",
      "actualResult": "页面不接受超过1500上限的第1501个字符，或对超出内容进行明确拒绝；字符计数不超过“1500/1500”。具体截断或提示方式待人工确认。",
      "remark": "",
      "caseType": "边界值测试；待人工确认：超限时采用截断、报错或其他处理方式。",
      "featurePoint": "",
      "testType": "边界值测试；待人工确认：超限时采用截断、报错或其他处理方式。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-007",
      "title": "图生视频",
      "priority": "验证图生视频-描述输入为空时创作操作给出校验反馈",
      "precondition": "P1",
      "testData": "已打开图生视频页面，未上传图片，描述输入为空",
      "steps": [
        "图片：未选择；描述：空字符串；音效和多镜头保持页面当前状态；时长5s；分辨率720p"
      ],
      "expected": "1. 确认图片上传区域没有有效图片，描述输入框内容为空。\n2. 点击“创作”按钮。\n3. 观察页面是否创建任务及控件状态。",
      "actualResult": "页面不应在缺少输入内容时直接产生成功的图生视频任务；页面展示可观察的校验反馈或保持不可提交状态。具体必填项规则及提示文案待人工确认。",
      "remark": "",
      "caseType": "『补充测试点』；待人工确认：图片和描述是否均为必填项，以及“创作”按钮的禁用和提示规则。",
      "featurePoint": "",
      "testType": "『补充测试点』；待人工确认：图片和描述是否均为必填项，以及“创作”按钮的禁用和提示规则。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-008",
      "title": "图生视频",
      "priority": "验证图生视频-切换音效和多镜头开关后开关状态正确",
      "precondition": "P1",
      "testData": "已打开图生视频页面",
      "steps": [
        "音效：开启、关闭；多镜头：开启、关闭"
      ],
      "expected": "1. 查看“开启音效”开关当前状态。\n2. 点击“开启音效”开关一次，检查开关状态。\n3. 再次点击“开启音效”开关，检查开关状态。\n4. 查看“多镜头”开关当前状态。\n5. 点击“多镜头”开关一次，检查开关状态。\n6. 再次点击“多镜头”开关，检查开关状态。",
      "actualResult": "1. 两个开关均展示明确的当前选中或未选中状态。\n2. 音效开关每次点击后在开启与关闭状态之间切换一次。\n3. 多镜头开关每次点击后在开启与关闭状态之间切换一次。\n4. 两个开关的状态互不误改。",
      "remark": "",
      "caseType": "需求仅展示开关，未明确默认状态及状态是否持久化；待人工确认：默认值、刷新后状态及提交参数映射。",
      "featurePoint": "",
      "testType": "需求仅展示开关，未明确默认状态及状态是否持久化；待人工确认：默认值、刷新后状态及提交参数映射。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-009",
      "title": "图生视频",
      "priority": "验证图生视频-选择5s、10s和15s时长后选中状态正确",
      "precondition": "P1",
      "testData": "已打开图生视频页面",
      "steps": [
        "时长参数集：5s、10s、15s"
      ],
      "expected": "1. 点击5s选项，检查选中样式。\n2. 点击10s选项，检查选中样式。\n3. 点击15s选项，检查选中样式。",
      "actualResult": "1. 点击5s后仅5s显示选中状态。\n2. 点击10s后仅10s显示选中状态。\n3. 点击15s后仅15s显示选中状态。",
      "remark": "",
      "caseType": "需求明确三个可选时长；待人工确认：默认时长及切换后的参数提交规则。",
      "featurePoint": "",
      "testType": "需求明确三个可选时长；待人工确认：默认时长及切换后的参数提交规则。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-010",
      "title": "图生视频",
      "priority": "验证图生视频-选择360p、540p、720p和1080p分辨率后选中状态正确",
      "precondition": "P1",
      "testData": "已打开图生视频页面",
      "steps": [
        "分辨率参数集：360p、540p、720p、1080p"
      ],
      "expected": "1. 点击360p选项，检查选中样式。\n2. 点击540p选项，检查选中样式。\n3. 点击720p选项，检查选中样式。\n4. 点击1080p选项，检查选中样式。",
      "actualResult": "1. 点击360p后仅360p显示选中状态。\n2. 点击540p后仅540p显示选中状态。\n3. 点击720p后仅720p显示选中状态。\n4. 点击1080p后仅1080p显示选中状态。",
      "remark": "",
      "caseType": "需求明确四个可选分辨率；待人工确认：默认分辨率及切换后的参数提交规则。",
      "featurePoint": "",
      "testType": "需求明确四个可选分辨率；待人工确认：默认分辨率及切换后的参数提交规则。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-011",
      "title": "图生视频",
      "priority": "验证图生视频-选择图片、填写描述并提交配置后创作状态正确",
      "precondition": "P0",
      "testData": "已打开图生视频页面，准备有效图片文件",
      "steps": [
        "图片：test-valid.jpg（JPG，1920×1080，5MB）；描述：生成一只小狗在草地上奔跑；音效：开启；多镜头：关闭；时长：10s；分辨率：1080p"
      ],
      "expected": "1. 选择test-valid.jpg，确认图片上传区域展示已选图片状态。\n2. 输入描述“生成一只小狗在草地上奔跑”，确认字符计数发生变化。\n3. 将音效设置为开启、多镜头设置为关闭，逐项检查开关状态。\n4. 选择10s并检查选中状态。\n5. 选择1080p并检查选中状态。\n6. 点击“创作”按钮一次。\n7. 观察页面任务、按钮状态或生成结果变化。",
      "actualResult": "1. 有效图片和描述内容保留在页面中，所选开关、时长和分辨率状态与测试数据一致。\n2. 点击“创作”后页面出现可观察的创作处理状态或生成结果，且不产生与本次提交无关的配置。具体任务标识、处理中状态及完成结果展示待人工确认。",
      "remark": "",
      "caseType": "核心主流程；待人工确认：创建成功标识、任务状态、生成结果页面及失败表现。",
      "featurePoint": "",
      "testType": "核心主流程；待人工确认：创建成功标识、任务状态、生成结果页面及失败表现。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-012",
      "title": "图生视频",
      "priority": "验证图生视频-连续点击创作不会重复提交同一任务",
      "precondition": "P1",
      "testData": "已打开图生视频页面，已选择有效图片并填写有效描述，已完成时长和分辨率选择",
      "steps": [
        "图片：test-valid.jpg（JPG，1920×1080，5MB）；描述：生成一只小狗在草地上奔跑；连续快速点击“创作”3次"
      ],
      "expected": "1. 按测试数据完成图片、描述、开关、时长和分辨率配置。\n2. 在短时间内连续点击“创作”按钮3次。\n3. 检查页面是否出现重复任务或重复生成记录。",
      "actualResult": "页面对连续提交操作给出单一、可观察的处理结果，不应因3次点击产生重复的同一创作任务。具体按钮禁用状态或幂等提示待人工确认。",
      "remark": "",
      "caseType": "『补充测试点』；待人工确认：创作接口或页面是否支持幂等及重复点击期间的按钮状态。",
      "featurePoint": "",
      "testType": "『补充测试点』；待人工确认：创作接口或页面是否支持幂等及重复点击期间的按钮状态。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-013",
      "title": "图生视频",
      "priority": "验证图生视频-在兼容设备上页面布局和配置控件可正常操作",
      "precondition": "P2",
      "testData": "准备需求目标支持的移动设备及系统环境，已打开图生视频页面",
      "steps": [
        "兼容环境参数集：iOS移动设备竖屏；不同屏幕尺寸的移动设备各1台"
      ],
      "expected": "1. 在每个测试设备上打开图生视频页面。\n2. 检查标题、模型、上传区域、描述框、开关、时长、分辨率和“创作”按钮是否完整可见。\n3. 在每个设备上分别点击一个时长选项和一个分辨率选项，检查选中状态。\n4. 点击图片上传区域，检查文件选择交互是否可用。",
      "actualResult": "页面主要控件均可见且不发生遮挡、重叠或明显错位；时长、分辨率和图片选择控件可执行对应操作。具体支持的系统版本、设备型号和屏幕适配范围待人工确认。",
      "remark": "",
      "caseType": "『补充测试点』；待人工确认：正式兼容性矩阵及最低支持系统版本。",
      "featurePoint": "",
      "testType": "『补充测试点』；待人工确认：正式兼容性矩阵及最低支持系统版本。",
      "status": "未执行",
      "defectId": ""
    }
  ],
  "coverage": [
    {
      "feature": "",
      "testType": "页面基础展示",
      "count": 0,
      "coverageStatus": "1",
      "riskLevel": "已覆盖"
    },
    {
      "feature": "",
      "testType": "支持图片格式上传",
      "count": 0,
      "coverageStatus": "1",
      "riskLevel": "已覆盖"
    },
    {
      "feature": "",
      "testType": "不支持及异常图片校验",
      "count": 0,
      "coverageStatus": "2",
      "riskLevel": "已覆盖"
    },
    {
      "feature": "",
      "testType": "描述输入长度限制",
      "count": 0,
      "coverageStatus": "2",
      "riskLevel": "已覆盖"
    },
    {
      "feature": "",
      "testType": "必填输入校验",
      "count": 0,
      "coverageStatus": "1",
      "riskLevel": "部分覆盖"
    },
    {
      "feature": "",
      "testType": "音效和多镜头配置",
      "count": 0,
      "coverageStatus": "1",
      "riskLevel": "已覆盖"
    },
    {
      "feature": "",
      "testType": "时长配置",
      "count": 0,
      "coverageStatus": "1",
      "riskLevel": "已覆盖"
    },
    {
      "feature": "",
      "testType": "分辨率配置",
      "count": 0,
      "coverageStatus": "1",
      "riskLevel": "已覆盖"
    },
    {
      "feature": "",
      "testType": "创作提交主流程",
      "count": 0,
      "coverageStatus": "1",
      "riskLevel": "部分覆盖"
    },
    {
      "feature": "",
      "testType": "重复提交控制",
      "count": 0,
      "coverageStatus": "1",
      "riskLevel": "部分覆盖"
    },
    {
      "feature": "",
      "testType": "移动设备兼容性",
      "count": 0,
      "coverageStatus": "1",
      "riskLevel": "部分覆盖"
    },
    {
      "feature": "",
      "testType": "接口请求与参数校验",
      "count": 0,
      "coverageStatus": "0",
      "riskLevel": "未覆盖"
    },
    {
      "feature": "",
      "testType": "登录、会员或权限控制",
      "count": 0,
      "coverageStatus": "0",
      "riskLevel": "未覆盖"
    },
    {
      "feature": "",
      "testType": "安全与内容合规",
      "count": 0,
      "coverageStatus": "0",
      "riskLevel": "未覆盖"
    },
    {
      "feature": "",
      "testType": "性能与响应时间",
      "count": 0,
      "coverageStatus": "0",
      "riskLevel": "未覆盖"
    },
    {
      "feature": "",
      "testType": "可用性",
      "count": 0,
      "coverageStatus": "0",
      "riskLevel": "未覆盖"
    }
  ],
  "risksAndAssumptions": [],
  "confirmations": [
    {
      "problem": "",
      "impact": "不支持文件的校验发生在文件选择器阶段还是上传后阶段，拒绝提示文案是什么",
      "sourceLocation": "影响异常上传用例的判定点、自动化定位和用户反馈验收",
      "confirmSuggestion": "截图中图片上传区域文案“仅支持上传 JPG、PNG、JPEG 和 WEBP”"
    },
    {
      "problem": "",
      "impact": "图片是否为创作必填项，描述是否为创作必填项，空输入点击“创作”的按钮状态和提示规则是什么",
      "sourceLocation": "影响提交前置条件及空输入异常场景的唯一预期结果",
      "confirmSuggestion": "截图中的图片上传区域、描述输入框和“创作”按钮"
    },
    {
      "problem": "",
      "impact": "描述框1500的计数规则是否按字符计数，中文、英文、emoji和换行如何计数",
      "sourceLocation": "影响长度边界测试和前后端参数校验一致性",
      "confirmSuggestion": "截图中描述输入框右下角“0/1500”"
    },
    {
      "problem": "",
      "impact": "音效和多镜头开关的默认状态、提交参数映射及刷新或重新进入页面后的状态是否保留",
      "sourceLocation": "影响配置项默认值、状态持久化和创作结果验证",
      "confirmSuggestion": "截图中的“开启音效”和“多镜头”开关"
    },
    {
      "problem": "",
      "impact": "时长5s、10s、15s和分辨率360p、540p、720p、1080p的默认值及提交参数规则是什么",
      "sourceLocation": "影响配置项初始化和创作请求参数校验",
      "confirmSuggestion": "截图中的“时长”和“分辨率”选项"
    },
    {
      "problem": "",
      "impact": "创作成功后的任务标识、处理中状态、完成结果、失败提示、超时和重试规则是什么",
      "sourceLocation": "影响核心主流程、异常流程、接口测试和稳定性测试的验收",
      "confirmSuggestion": "截图中的“创作”按钮；截图未展示提交后的页面"
    },
    {
      "problem": "",
      "impact": "是否存在登录、会员、额度、次数或模型权限限制",
      "sourceLocation": "权限测试无法确定账号状态、拦截点和预期结果",
      "confirmSuggestion": "现有截图未展示权限信息"
    },
    {
      "problem": "",
      "impact": "正式支持的系统版本、设备型号、屏幕尺寸和横竖屏范围是什么",
      "sourceLocation": "影响兼容性测试范围和缺陷判定",
      "confirmSuggestion": "截图为移动端页面，未提供兼容性矩阵"
    }
  ],
  "evidence": [
    {
      "caseId": "",
      "prdSnippet": "",
      "location": "顶部标题“图生视频”，模型区域显示“PixVerse 6”，页面包含图片上传区域、描述输入区域、音效、多镜头、时长、分辨率和“创作”按钮。"
    },
    {
      "caseId": "",
      "prdSnippet": "",
      "location": "仅支持上传 JPG、PNG、JPEG 和 WEBP"
    },
    {
      "caseId": "",
      "prdSnippet": "",
      "location": "描述输入框字符计数“0/1500”"
    },
    {
      "caseId": "",
      "prdSnippet": "",
      "location": "开启音效、多镜头"
    },
    {
      "caseId": "",
      "prdSnippet": "",
      "location": "时长选项：5s、10s、15s；分辨率选项：360p、540p、720p、1080p"
    },
    {
      "caseId": "",
      "prdSnippet": "",
      "location": "页面底部展示“创作”按钮"
    }
  ],
  "modelUsed": ""
};

export const SAMPLE_REVIEW_RESULT: ReviewResult = {
  "summary": "评审完成：共 13 条优化后用例。已修复原用例中优先级滥用（P0/P1 占比）、测试数据占位为「无」、前置条件与操作步骤不自洽、预期结果表述条件化/不可判定等共性问题；模型名称、支持格式、字符上限及部分默认值仍标注「需人工确认」。本示例仅为演示固定输出，真实评审请选用非演示模型。",
  "highRiskNotes": [],
  "issues": [],
  "optimizedCases": [
    {
      "id": "",
      "module": "TC-001",
      "title": "图生视频",
      "priority": "验证图生视频页面主要标题、模型及创作配置控件展示",
      "precondition": "P1",
      "testData": "当前处于图生视频页面；页面加载完成；模型名称、支持格式、字符上限及控件默认值已由需求确认。",
      "steps": [
        "页面预期模型：PixVerse 6；支持格式提示：仅支持上传 JPG、PNG、JPEG 和 WEBP；描述字符上限：1500；其他控件默认值：按需求确认。"
      ],
      "expected": "1. 查看页面顶部标题和模型区域。\n2. 查看图片上传区域及支持格式提示。\n3. 查看描述输入区域及字符计数。\n4. 查看音效、多镜头、时长、分辨率和“创作”控件。",
      "actualResult": "页面展示“图生视频”标题，模型区域展示“PixVerse 6”；图片上传区域展示指定格式提示；描述区域字符计数显示“0/1500”；音效、多镜头、时长、分辨率和“创作”控件均可见且无重叠遮挡。默认值按已确认需求判定。",
      "remark": "",
      "caseType": "模型名称、提示文案及默认值需人工确认。",
      "featurePoint": "",
      "testType": "模型名称、提示文案及默认值需人工确认。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-002",
      "title": "图生视频",
      "priority": "验证支持格式图片可选择并完成图片上传",
      "precondition": "P1",
      "testData": "当前处于图生视频页面；设备中准备可正常读取的测试文件；上传大小限制已由需求确认。",
      "steps": [
        "参数化文件集：test-valid.jpg（JPG，1920×1080，5MB）、test-valid.png（PNG，1920×1080，5MB）、test-valid.jpeg（JPEG，1920×1080，5MB）、test-valid.webp（WEBP，1920×1080，5MB）。"
      ],
      "expected": "1. 点击图片上传区域，选择test-valid.jpg，检查选择结果。\n2. 确认test-valid.jpg完成上传或进入需求定义的有效图片状态。\n3. 清除当前图片，选择test-valid.png，检查选择结果并确认其进入有效图片状态。\n4. 清除当前图片，选择test-valid.jpeg，检查选择结果并确认其进入有效图片状态。\n5. 清除当前图片，选择test-valid.webp，检查选择结果并确认其进入有效图片状态。",
      "actualResult": "四种支持格式文件均可被选择，并在需求定义的校验阶段进入有效图片状态；上传区域展示对应图片或已选图片状态，不出现格式错误。",
      "remark": "",
      "caseType": "需人工确认5MB是否在允许范围内，以及选择和上传是否为不同校验阶段。",
      "featurePoint": "",
      "testType": "需人工确认5MB是否在允许范围内，以及选择和上传是否为不同校验阶段。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-003",
      "title": "图生视频",
      "priority": "验证不支持格式图片被拒绝",
      "precondition": "P1",
      "testData": "当前处于图生视频页面；设备中准备可正常读取的非支持格式文件；不支持格式的校验阶段和提示文案已由需求确认。",
      "steps": [
        "test-unsupported.gif（GIF，1920×1080，5MB）。"
      ],
      "expected": "1. 点击图片上传区域。\n2. 在文件选择器中选择test-unsupported.gif。\n3. 观察文件选择结果和图片上传区域状态。",
      "actualResult": "test-unsupported.gif在需求定义的校验阶段被拒绝；图片上传区域不进入有效图片状态，并展示已确认的拒绝提示或文件选择器过滤结果。",
      "remark": "",
      "caseType": "校验发生阶段及固定提示文案需人工确认。",
      "featurePoint": "",
      "testType": "校验发生阶段及固定提示文案需人工确认。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-004",
      "title": "图生视频",
      "priority": "验证空文件和非空损坏图片被拒绝",
      "precondition": "P1",
      "testData": "当前处于图生视频页面；设备中准备可读取的空文件和非空但内容损坏的图片；校验阶段及错误提示已由需求确认。",
      "steps": [
        "empty.jpg（JPG，0字节）；corrupted.png（PNG扩展名，非空文件，文件内容损坏，具体字节大小已由测试环境固定）。"
      ],
      "expected": "1. 点击图片上传区域，选择empty.jpg，观察需求定义的校验阶段和上传区域状态。\n2. 清除当前文件，重新选择corrupted.png，观察需求定义的校验阶段和上传区域状态。",
      "actualResult": "empty.jpg和corrupted.png均不能进入有效图片状态；每个文件均展示已确认的唯一失败提示或拒绝结果，且不能用于创作。",
      "remark": "",
      "caseType": "需准备非空损坏文件并人工确认校验阶段。",
      "featurePoint": "",
      "testType": "需准备非空损坏文件并人工确认校验阶段。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-005",
      "title": "图生视频",
      "priority": "验证描述输入达到1500字符上限",
      "precondition": "P1",
      "testData": "当前处于图生视频页面；描述输入框为空；页面字符计数规则已确认。",
      "steps": [
        "固定描述文本：1500个中文字符，不含换行；另准备同一文本删减1个字符的1499字符版本；按页面字符计数规则统计。"
      ],
      "expected": "1. 点击描述输入区域。\n2. 输入1499个中文字符，查看内容和字符计数。\n3. 继续输入第1500个中文字符，查看内容和字符计数。",
      "actualResult": "输入1499个字符时计数显示“1499/1500”；输入第1500个字符后计数显示“1500/1500”，内容完整保留且未超过上限。",
      "remark": "",
      "caseType": "固定文本或生成脚本需纳入测试资产。",
      "featurePoint": "",
      "testType": "固定文本或生成脚本需纳入测试资产。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-006",
      "title": "图生视频",
      "priority": "验证描述输入超过1500字符时按上限限制输入",
      "precondition": "P1",
      "testData": "当前处于图生视频页面；描述输入框为空；超限处理策略已由需求确认。",
      "steps": [
        "固定描述文本：1501个中文字符，不含换行；按页面字符计数规则统计。"
      ],
      "expected": "1. 点击描述输入区域。\n2. 输入前1500个中文字符，确认计数为“1500/1500”。\n3. 继续输入第1501个中文字符。\n4. 查看输入框内容、字符计数及需求定义的超限反馈。",
      "actualResult": "第1501个字符按已确认策略被拒绝或截断；输入框最终最多保留1500个字符，字符计数不超过“1500/1500”，并展示已确认的超限反馈（如需求要求）。",
      "remark": "",
      "caseType": "截断、拒绝及提示方式需人工确认后固定。",
      "featurePoint": "",
      "testType": "截断、拒绝及提示方式需人工确认后固定。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-007",
      "title": "图生视频",
      "priority": "验证缺少必填创作输入时无法创建任务",
      "precondition": "P1",
      "testData": "当前处于图生视频页面；图片未选择；描述输入框为空；必填项规则和校验提示已由需求确认。",
      "steps": [
        "图片：未选择；描述：空字符串；音效和多镜头：按页面当前状态；时长：5s；分辨率：720p。另准备“仅缺图片”和“仅缺描述”参数场景，具体是否执行由需求确认。"
      ],
      "expected": "1. 确认图片上传区域无有效图片，描述输入框为空。\n2. 点击“创作”按钮，或确认按钮处于不可提交状态。\n3. 观察页面校验反馈、任务记录和控件状态。",
      "actualResult": "页面按已确认的必填校验规则阻止创作；不创建任务、不产生成功结果，并展示唯一的校验反馈或保持按钮不可提交。",
      "remark": "",
      "caseType": "需人工确认图片和描述是否均为必填，以及反馈形式。",
      "featurePoint": "",
      "testType": "需人工确认图片和描述是否均为必填，以及反馈形式。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-008",
      "title": "图生视频",
      "priority": "验证音效和多镜头开关可独立切换",
      "precondition": "P1",
      "testData": "当前处于图生视频页面；两个开关均已加载；默认状态是否固定由需求确认。",
      "steps": [
        "音效：开启、关闭；多镜头：开启、关闭。"
      ],
      "expected": "1. 记录音效开关和多镜头开关的初始状态。\n2. 点击音效开关一次，检查其状态变化。\n3. 再次点击音效开关，检查其恢复状态。\n4. 点击多镜头开关一次，检查其状态变化。\n5. 再次点击多镜头开关，检查其恢复状态。\n6. 在每次操作后检查另一开关状态未被改变。",
      "actualResult": "每次点击仅改变被点击开关一次；音效和多镜头均可在开启与关闭之间切换；两个开关状态互不影响。",
      "remark": "",
      "caseType": "默认值及开关值是否传入创作请求需在TC-011中验证。",
      "featurePoint": "",
      "testType": "默认值及开关值是否传入创作请求需在TC-011中验证。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-009",
      "title": "图生视频",
      "priority": "验证时长参数可逐项选择且选中状态互斥",
      "precondition": "P1",
      "testData": "当前处于图生视频页面；时长选项已加载；时长为单选还是可多选已由需求确认。",
      "steps": [
        "时长参数集：5s、10s、15s。"
      ],
      "expected": "1. 点击5s选项，检查5s及其他时长选项状态。\n2. 点击10s选项，检查10s及其他时长选项状态。\n3. 点击15s选项，检查15s及其他时长选项状态。",
      "actualResult": "每次点击后，被点击的时长显示选中状态；若需求定义为单选，则同一时刻仅该时长选中，前一选中项取消选中。",
      "remark": "",
      "caseType": "单选规则及默认选中项需人工确认。",
      "featurePoint": "",
      "testType": "单选规则及默认选中项需人工确认。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-010",
      "title": "图生视频",
      "priority": "验证分辨率参数可逐项选择且选中状态互斥",
      "precondition": "P1",
      "testData": "当前处于图生视频页面；分辨率选项已加载；分辨率是否单选及与其他参数的联动规则已由需求确认。",
      "steps": [
        "分辨率参数集：360p、540p、720p、1080p。"
      ],
      "expected": "1. 点击360p选项，检查360p及其他分辨率选项状态。\n2. 点击540p选项，检查540p及其他分辨率选项状态。\n3. 点击720p选项，检查720p及其他分辨率选项状态。\n4. 点击1080p选项，检查1080p及其他分辨率选项状态。",
      "actualResult": "每次点击后，被点击的分辨率显示选中状态；若需求定义为单选，则同一时刻仅该分辨率选中，前一选中项取消选中。",
      "remark": "",
      "caseType": "单选规则、默认值及联动限制需人工确认。",
      "featurePoint": "",
      "testType": "单选规则、默认值及联动限制需人工确认。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-011",
      "title": "图生视频",
      "priority": "验证完整创作配置提交后创建唯一任务并正确进入处理状态",
      "precondition": "P0",
      "testData": "当前处于图生视频页面；用户具备需求要求的登录、权限和额度；服务可用；准备有效图片文件；任务查询或结果观察入口可用。",
      "steps": [
        "图片：test-valid.jpg（JPG，1920×1080，5MB）；描述：生成一只小狗在草地上奔跑；音效：开启；多镜头：关闭；时长：10s；分辨率：1080p。"
      ],
      "expected": "1. 选择test-valid.jpg，确认其进入有效图片状态。\n2. 输入描述“生成一只小狗在草地上奔跑”，确认字符计数与文本内容正确。\n3. 将音效设置为开启、多镜头设置为关闭，分别确认状态。\n4. 选择10s，确认其为当前选中时长。\n5. 选择1080p，确认其为当前选中分辨率。\n6. 点击“创作”按钮一次。\n7. 记录页面返回的任务ID、任务记录或其他唯一提交标识。\n8. 检查任务进入需求定义的处理中状态，并核对任务请求中的图片、描述、音效、多镜头、时长和分辨率与页面配置一致。",
      "actualResult": "系统仅创建一条本次创作任务并返回需求定义的唯一可观测标识；任务进入已确认的处理中状态或完成状态，且请求参数与页面配置一致；若创作失败，应展示已确认的失败状态和错误信息，不能伪装为成功。",
      "remark": "",
      "caseType": "任务ID、状态、结果展示、失败表现及额度/计费影响需人工确认。",
      "featurePoint": "",
      "testType": "任务ID、状态、结果展示、失败表现及额度/计费影响需人工确认。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-012",
      "title": "图生视频",
      "priority": "验证创作按钮连续点击的重复提交幂等性",
      "precondition": "P1",
      "testData": "当前处于图生视频页面；用户具备需求要求的登录、权限和额度；已选择有效图片、填写有效描述并完成时长、分辨率及开关配置；可查询任务记录或任务ID。",
      "steps": [
        "图片：test-valid.jpg（JPG，1920×1080，5MB）；描述：生成一只小狗在草地上奔跑；连续快速点击“创作”3次，点击间隔按测试工具固定为不超过100毫秒。"
      ],
      "expected": "1. 按测试数据完成图片、描述、开关、时长和分辨率配置。\n2. 在不超过100毫秒的间隔内连续点击“创作”按钮3次。\n3. 记录页面响应、按钮状态、接口响应或任务ID。\n4. 查询本次操作产生的任务记录数量及资源/额度变化。",
      "actualResult": "同一组配置在本次连续点击窗口内仅产生一条创作任务和一个有效任务ID；后续点击被按钮禁用、防抖或服务端幂等机制拦截；不得产生重复任务，也不得重复扣减额度或其他资源。",
      "remark": "",
      "caseType": "幂等窗口、任务查询方式及资源扣减规则需人工确认。",
      "featurePoint": "",
      "testType": "幂等窗口、任务查询方式及资源扣减规则需人工确认。",
      "status": "未执行",
      "defectId": ""
    },
    {
      "id": "",
      "module": "TC-013",
      "title": "图生视频",
      "priority": "验证目标移动设备上的图生视频页面布局和配置控件可操作性",
      "precondition": "P2",
      "testData": "准备需求目标支持的移动设备、系统版本、浏览器版本、屏幕分辨率及网络环境；具体兼容矩阵已由需求确认；尚未打开图生视频页面。",
      "steps": [
        "兼容环境参数集：具体iOS设备型号、系统版本、浏览器版本、屏幕尺寸和分辨率各1组；屏幕方向：竖屏；设备清单由需求兼容矩阵提供。"
      ],
      "expected": "1. 在每个指定测试设备和环境上打开图生视频页面。\n2. 检查标题、模型、上传区域、描述框、开关、时长、分辨率和“创作”按钮的可见性及布局。\n3. 在每个设备上点击一个需求允许的时长选项，检查选中状态。\n4. 在每个设备上点击一个需求允许的分辨率选项，检查选中状态。\n5. 点击图片上传区域，检查文件选择交互是否可用。",
      "actualResult": "在兼容矩阵中的每个设备和环境上，主要控件均可见，无遮挡、重叠或明显错位；时长、分辨率和图片选择控件均能完成需求定义的对应操作。",
      "remark": "",
      "caseType": "具体系统版本、设备型号、浏览器版本、屏幕范围及是否支持横屏需人工确认。",
      "featurePoint": "",
      "testType": "具体系统版本、设备型号、浏览器版本、屏幕范围及是否支持横屏需人工确认。",
      "status": "未执行",
      "defectId": ""
    }
  ],
  "modelUsed": ""
};
