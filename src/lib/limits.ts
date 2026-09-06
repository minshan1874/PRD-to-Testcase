import { formatBytes } from "@/lib/utils";

/** 各种输入限制（页面展示 + 解析后校验） */
export const LIMITS = {
  /** 单文件最大字节 */
  maxFileBytes: 20 * 1024 * 1024,
  /** 文本总长上限（字符） */
  maxTextChars: 500_000,
  /** 超过该长度给出黄色警告 */
  warnTextChars: 200_000,
  /** 图片数量上限 */
  maxImages: 20,
  /** 单张图片最大字节 */
  maxImageBytes: 5 * 1024 * 1024,
  /** 扫描 PDF 页面转图最大页数 */
  maxScanPages: 10,
  /** 单个 PDF 解析最大页数 */
  maxPdfPages: 100,
  /** 判定为扫描件的每页平均文本字符阈值 */
  scanThresholdPerPage: 5,
} as const;

export interface LimitsText {
  maxFileBytes: string;
  maxTextChars: string;
  warnTextChars: string;
  maxImages: number;
  maxImageBytes: string;
  maxScanPages: number;
}

export function limitsText(): LimitsText {
  return {
    maxFileBytes: formatBytes(LIMITS.maxFileBytes),
    maxTextChars: LIMITS.maxTextChars.toLocaleString(),
    warnTextChars: LIMITS.warnTextChars.toLocaleString(),
    maxImages: LIMITS.maxImages,
    maxImageBytes: formatBytes(LIMITS.maxImageBytes),
    maxScanPages: LIMITS.maxScanPages,
  };
}