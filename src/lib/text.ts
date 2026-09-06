/** 读取纯文本文件（MD/TXT） */
export async function readTextFile(file: File): Promise<string> {
  return (await file.text()).trim();
}

/** 读取图片文件为 dataURL */
export function readImageDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}