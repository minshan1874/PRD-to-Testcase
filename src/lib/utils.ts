import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
