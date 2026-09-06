import * as mammoth from "mammoth";

export interface DocxParseResult {
  text: string;
  warnings: string[];
}

/** 解压并抽取 DOCX 正文纯文本 */
export async function parseDocxFile(file: File): Promise<DocxParseResult> {
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return {
    text: (result.value ?? "").trim(),
    warnings: result.messages
      .filter((m) => m.type === "warning")
      .map((m) => m.message),
  };
}