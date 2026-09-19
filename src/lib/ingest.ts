import type { SourceItem } from "@/types";
import { parsePdfFile } from "@/lib/pdf";
import { parseDocxFile } from "@/lib/docx";
import { readImageDataUrl, readTextFile } from "@/lib/text";
import * as UTIF from "utif";

const TEXT_EXT = new Set(["md", "markdown", "txt", "text"]);
const DOCX_EXT = new Set(["docx"]);
const PDF_EXT = new Set(["pdf"]);
const IMG_EXT = new Set(["png", "jpg", "jpeg", "webp", "tiff", "tif"]);
const IMG_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/jpg", "image/tiff", "image/tif"]);
const TIFF_EXT = new Set(["tiff", "tif"]);

function extOf(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

export type ParseMessage = { ok: true; item: SourceItem } | { ok: false; item: SourceItem };

/** 依据扩展名/mime 将文件解析为 SourceItem（含失败原因） */
export async function ingestFile(file: File): Promise<ParseMessage> {
  const id = crypto.randomUUID();
  const ext = extOf(file.name);
  const base: SourceItem = {
    id,
    name: file.name,
    kind: IMG_EXT.has(ext) || IMG_MIME.has(file.type) ? "image" : "text",
    size: file.size,
    status: "parsing",
    mime: file.type,
    forceAsImage: false,
  };

  try {
    if (PDF_EXT.has(ext) || file.type === "application/pdf") {
      return pdfToItem(base, file);
    }
    if (DOCX_EXT.has(ext) || file.type.includes("wordprocessingml")) {
      return docxToItem(base, file);
    }
    if (TEXT_EXT.has(ext) || file.type.startsWith("text/")) {
      return textToItem(base, file);
    }
    if (IMG_EXT.has(ext) || IMG_MIME.has(file.type)) {
      return imageToItem(base, file);
    }
    return fail(base, `不支持的文件类型（.${ext || file.type || "未知"}）`);
  } catch (err) {
    return fail(base, err instanceof Error ? err.message : "解析失败");
  }
}

async function pdfToItem(base: SourceItem, file: File): Promise<ParseMessage> {
  const r = await parsePdfFile(file);
  if (r.scanned && r.pageImages.length === 0 && r.text.length === 0) {
    return fail(base, "PDF 文本提取与页面渲染均失败");
  }
  return {
    ok: true,
    item: {
      ...base,
      kind: "pdf",
      text: r.text,
      pages: r.pages,
      pageImages: r.pageImages,
      status: "success",
      error: r.scanned
        ? `已判定为扫描件，页面已转为图片（前 ${r.pageImages.length} 页）`
        : undefined,
    },
  };
}

async function docxToItem(base: SourceItem, file: File): Promise<ParseMessage> {
  const r = await parseDocxFile(file);
  if (!r.text) return fail(base, "DOCX 未提取到正文，可能是空文档或加密文件");
  return { ok: true, item: { ...base, kind: "docx", text: r.text, status: "success" } };
}

async function textToItem(base: SourceItem, file: File): Promise<ParseMessage> {
  const text = await readTextFile(file);
  if (!text) return fail(base, "文件内容为空");
  return { ok: true, item: { ...base, text, status: "success" } };
}

async function imageToItem(base: SourceItem, file: File): Promise<ParseMessage> {
  const ext = extOf(file.name);
  // TIFF 浏览器不原生支持，需解码后转 PNG
  if (TIFF_EXT.has(ext)) {
    const dataUrl = await tiffToPngDataUrl(file);
    return { ok: true, item: { ...base, kind: "image", image: dataUrl, status: "success" } };
  }
  const dataUrl = await readImageDataUrl(file);
  return { ok: true, item: { ...base, kind: "image", image: dataUrl, status: "success" } };
}

/** 将 TIFF 文件解码并转为 PNG dataURL */
async function tiffToPngDataUrl(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  if (!ifds || ifds.length === 0) throw new Error("TIFF 解码失败：未找到图像数据");
  const ifd = ifds[0];
  UTIF.decodeImage(buffer, ifd);
  const rgba = UTIF.toRGBA8(ifd);
  const canvas = document.createElement("canvas");
  canvas.width = ifd.width;
  canvas.height = ifd.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("TIFF 转 PNG 失败：无法创建画布");
  const imgData = new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height);
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

export function fail(base: SourceItem, reason: string): ParseMessage {
  return { ok: false, item: { ...base, status: "error", error: reason } };
}

/** 粘贴文本构造 SourceItem */
export function pasteItem(text: string): SourceItem {
  return {
    id: crypto.randomUUID(),
    name: "粘贴文本",
    kind: "txt",
    size: new Blob([text]).size,
    status: "success",
    text: text.trim(),
  };
}