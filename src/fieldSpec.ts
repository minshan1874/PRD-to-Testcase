import type { FieldDef } from "@/types";

/**
 * 13 个内置字段的元数据：定义 / 填写说明 / 示例。
 * 同步用于 Excel「字段说明」工作表 与 配置页字段编辑器。
 */
export const BUILTIN_FIELDS: FieldDef[] = [
  {
    key: "id",
    label: "用例 ID",
    description: "测试用例的唯一编号，用于识别与追溯。",
    example: "TC-001",
    builtin: true,
    width: 10,
  },
  {
    key: "module",
    label: "模块",
    description: "用例所属的功能模块或子系统。",
    example: "登录模块",
    builtin: true,
    width: 14,
  },
  {
    key: "title",
    label: "标题",
    description: "用例名称，一句话概括被测行为或场景。",
    example: "验证用户名或密码错误时的提示",
    builtin: true,
    width: 28,
  },
  {
    key: "testType",
    label: "测试类型",
    description: "用例的测试维度：功能/UI、接口、异常、边界、权限、安全、性能、兼容性、可用性。",
    example: "异常",
    builtin: true,
    width: 10,
  },
  {
    key: "priority",
    label: "优先级",
    description: "用例执行优先级：P0（阻塞级）、P1（高）、P2（中）、P3（低）。",
    example: "P1",
    builtin: true,
    width: 8,
  },
  {
    key: "precondition",
    label: "前置条件",
    description: "执行该用例前必须满足的环境、数据或状态。",
    example: "已注册账号且处于退出登录状态",
    builtin: true,
    width: 24,
  },
  {
    key: "testData",
    label: "测试数据",
    description: "用例需要用到的输入数据（正常/异常/边界数据）。",
    example: "用户名：user_01；密码错误：12345",
    builtin: true,
    width: 22,
  },
  {
    key: "steps",
    label: "操作步骤",
    description: "按顺序描述操作步骤，各步骤以编号列表输出，导出时自动换行。",
    example: "1. 打开登录页\n2. 输入错误的密码\n3. 点击登录",
    builtin: true,
    width: 36,
  },
  {
    key: "expected",
    label: "预期结果",
    description: "每个操作步骤后系统应有的表现，与需求一一对应。",
    example: "页面提示「用户名或密码错误」，不产生登录会话",
    builtin: true,
    width: 32,
  },
  {
    key: "status",
    label: "执行状态",
    description: "用例当前执行情况：未执行、通过、失败、阻塞、跳过。",
    example: "未执行",
    builtin: true,
    width: 10,
  },
  {
    key: "actualResult",
    label: "实际结果",
    description: "实际执行时观察到的结果，回归时填写。",
    example: "待执行后填写",
    builtin: true,
    width: 22,
  },
  {
    key: "defectId",
    label: "缺陷 ID",
    description: "失败用例关联的缺陷编号（如 Jira/禅道单号）。",
    example: "BUG-1024",
    builtin: true,
    width: 10,
  },
  {
    key: "remark",
    label: "备注",
    description: "补充说明、数据约束或其他注意事项。",
    example: "低带宽环境需额外验证",
    builtin: true,
    width: 18,
  },
  {
    key: "featurePoint",
    label: "功能点",
    description: "当前测试点所属的具体功能或父级路径，确保能够追溯到需求来源，不得留空。",
    example: "结算流程-运费",
    builtin: true,
    width: 18,
  },
  {
    key: "caseType",
    label: "用例类型",
    description: "功能测试/接口测试/性能测试/安全性测试/稳定性测试/兼容性测试之一；存在多个目标时填写最主要的类型。",
    example: "功能测试",
    builtin: true,
    width: 12,
  },
];

export const DEFAULT_CUSTOM_FIELDS: FieldDef[] = [];

export function fieldLabelByKey(
  key: string,
  config: {
    customFields: FieldDef[];
    fields: Array<{ key: string; label?: string; visible: boolean }>;
  }
): string {
  const custom = config.customFields.find((f) => f.key === key);
  if (custom) return custom.label;
  const builtin = BUILTIN_FIELDS.find((f) => f.key === key);
  return builtin?.label ?? key;
}