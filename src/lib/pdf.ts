import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { LIMITS } from "@/lib/limits";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfParseResult {
  text: string;
  pages: number;
  /** 扫描件渲染出的页面图片（dataURL:image/jpeg） */
  pageImages: string[];
  /** 是否判定为扫描件 */
  scanned: boolean;
}

/**
 * 解析 PDF：
 * 1. 逐页提取文本；
 * 2. 若平均每页文本太少 → 判定为扫描件，将页面渲染为 JPEG 图片（最多 maxScanPages 页）。
 */
export async function parsePdfFile(file: File): Promise<PdfParseResult> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const doc = await loadingTask.promise;

  const pageCount = Math.min(doc.numPages, LIMITS.maxPdfPages);
  const parts: string[] = [];
  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const pageText = tc.items
      .map((it) => ("str" in it && typeof it.str === "string" ? it.str : ""))
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join(" ")
      .trim();
    // 保留物理页码标记，供追溯功能引用
    if (pageText) parts.push(`【第 ${p} 页】\n${pageText}`);
    page.cleanup();
  }
  const text = parts.join("\n\n");
  const avgChars = parts.length > 0 ? text.length / parts.length : 0;
  const scanned = pageCount > 0 && avgChars < LIMITS.scanThresholdPerPage;

  let pageImages: string[] = [];
  if (scanned) {
    pageImages = await renderPagesToImages(doc, Math.min(pageCount, LIMITS.maxScanPages));
  }
  await loadingTask.destroy();
  return { text, pages: doc.numPages, pageImages, scanned };
}

async function renderPagesToImages(
  doc: pdfjsLib.PDFDocumentProxy,
  pageCount: number,
  scale = 1.5
): Promise<string[]> {
  const images: string[] = [];
  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      page.cleanup();
      continue;
    }
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.72));
    page.cleanup();
  }
  return images;
}