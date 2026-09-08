import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 平滑滚动，将目标元素的顶部对齐到视口顶部 */
export function scrollElementToStart(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + rect.top, behavior: "smooth" });
}

/** 平滑滚动，使目标元素的底部对齐到视口底部（元素高于视口时退化为顶部对齐） */
export function scrollElementBottomFlush(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const target = window.scrollY + rect.top - Math.max(0, window.innerHeight - el.offsetHeight);
  window.scrollTo({ top: Math.max(target, 0), behavior: "smooth" });
}

export function formatBytes(bytes: number, decimals = 1): string {
  const precision = Math.max(0, decimals);
  const format = (value: number) => {
    const formatted = value.toFixed(precision);
    return precision === 0 ? formatted : formatted.replace(/\.?0+$/, "");
  };

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${format(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${format(bytes / 1024 / 1024)} MB`;
  return `${format(bytes / 1024 / 1024 / 1024)} GB`;
}
