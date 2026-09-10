import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, ChevronDown, PencilLine } from "lucide-react";
import { useStore } from "@/store";
import { effectiveCapabilities, POPULAR_MODELS } from "@/lib/models";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function isBatchModel(value: string) {
  return /batch\s*$/i.test(value.trim());
}

export function formatModelPricing(pricing?: { prompt?: string; completion?: string }) {
  if (!pricing) return "价格未知";
  const input = Number(pricing.prompt ?? 0) * 1_000_000;
  const output = Number(pricing.completion ?? 0) * 1_000_000;
  if (input === 0 && output === 0) return "免费";
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  return `输入 ${fmt.format(input)} / 输出 ${fmt.format(output)} / 百万 tokens`;
}

interface CapabilityLike {
  supportsImage: boolean;
  supportsJsonSchema: boolean;
}

interface ModelSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  /** 是否显示〔图片〕/〔结构化〕能力徽标（审查为纯文本场景可关闭） */
  showCapabilityBadges?: boolean;
  placeholder?: string;
  triggerClassName?: string;
  /** 是否显示「自定义模型 ID…」入口 */
  showCustom?: boolean;
}

interface Option {
  id: string;
  name: string;
  pricing?: { prompt?: string; completion?: string };
  supportsImage: boolean;
  supportsJsonSchema: boolean;
}

/** 与「模型配置」一致的模型选择器：搜索 + 最新发布/全部目录分组 + 价格备注 + 自定义入口。
 *  自定义下拉实现（非 Radix），确保移动端搜索框可输入、选项点击准确。 */
export function ModelSelect({
  value,
  onValueChange,
  showCapabilityBadges = true,
  placeholder = "选择模型…",
  triggerClassName,
  showCustom = true,
}: ModelSelectProps) {
  const models = useStore((s) => s.models);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const availableModels = models.filter((m) => !isBatchModel(m.id) && !isBatchModel(m.name));
  const catalogById = new Map(availableModels.map((m) => [m.id, m]));
  const sortedCatalogModels = [...availableModels].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  const latestCatalogModels = sortedCatalogModels.slice(0, 10);
  const featuredModels = latestCatalogModels.length > 0 ? latestCatalogModels : POPULAR_MODELS;
  const popularOptions: Option[] = featuredModels.map((p) => {
    const found = catalogById.get(p.id);
    const eff = effectiveCapabilities(p.id, found);
    return {
      id: p.id,
      name: p.name,
      pricing: found?.pricing,
      supportsImage: found ? found.supportsImage : eff.supportsImage,
      supportsJsonSchema: found ? found.supportsJsonSchema : eff.supportsJsonSchema,
    };
  });
  const catalogOptions = [...availableModels]
    .filter((m) => !featuredModels.some((p) => p.id === m.id))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
  const normalizedSearch = search.trim().toLowerCase();
  const matches = (name: string, id: string, description = "") =>
    !normalizedSearch || `${name} ${id} ${description}`.toLowerCase().includes(normalizedSearch);
  const filteredPopularOptions = popularOptions.filter((o) => matches(o.name, o.id));
  const filteredCatalogOptions = catalogOptions.filter((m) => matches(m.name, m.id, m.description));
  const allModelIds = new Set([...featuredModels.map((m) => m.id), ...availableModels.map((m) => m.id)]);
  const inList = allModelIds.has(value);
  const current = catalogById.get(value);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const renderBadges = (m: CapabilityLike) =>
    showCapabilityBadges && (
      <>
        {m.supportsImage && <Badge variant="secondary" className="text-[10px]">图片</Badge>}
        {m.supportsJsonSchema && <Badge variant="outline" className="text-[10px]">结构化</Badge>}
      </>
    );

  const pick = (id: string) => {
    onValueChange(id);
    setOpen(false);
    setSearch("");
  };

  const itemBtn = (
    o: { id: string },
    label: string,
    sub: string,
    badges: ReactNode,
  ) => (
    <button
      key={o.id}
      type="button"
      role="option"
      aria-selected={value === o.id}
      onClick={() => pick(o.id)}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none focus-visible:bg-accent",
        value === o.id ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate" title={label}>{label}</span>
        <span className="truncate font-mono text-[10px] text-muted-foreground" title={sub}>{sub}</span>
      </span>
      {badges}
    </button>
  );

  return (
    <div className={cn("relative inline-block", triggerClassName)} ref={rootRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm whitespace-nowrap shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
          current || inList ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="truncate" title={current?.name ?? (inList ? value : "")}>
          {current?.name ?? (inList ? value : placeholder)}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-full left-0 z-50 mt-1 max-h-80 w-full min-w-[16rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <div className="sticky top-0 z-10 bg-popover p-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="搜索模型名称或 ID…"
              aria-label="搜索模型"
              className="h-8"
            />
          </div>

          {filteredPopularOptions.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                最新发布模型（<span className="font-mono">{filteredPopularOptions.length}</span>）
              </div>
              {filteredPopularOptions.map((o) =>
                itemBtn(
                  o,
                  o.name,
                  formatModelPricing(o.pricing),
                  <span className="flex shrink-0 items-center gap-1.5">
                    {renderBadges(o)}
                    {value === o.id && <Check className="size-4 text-primary" />}
                  </span>,
                ),
              )}
            </>
          )}

          {filteredCatalogOptions.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                OpenRouter 目录（<span className="font-mono">{filteredCatalogOptions.length}</span>）
              </div>
              {filteredCatalogOptions.map((m) =>
                itemBtn(
                  m,
                  m.name,
                  formatModelPricing(m.pricing),
                  <span className="flex shrink-0 items-center gap-1.5">
                    {renderBadges(m)}
                    {value === m.id && <Check className="size-4 text-primary" />}
                  </span>,
                ),
              )}
            </>
          )}

          {showCustom && (
            <>
              <div className="px-2 py-1.5 text-xs text-muted-foreground">其他</div>
              <button
                type="button"
                role="option"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent/60"
              >
                <PencilLine className="size-3.5 text-muted-foreground" /> 自定义模型 ID…
              </button>
            </>
          )}

          {normalizedSearch && filteredPopularOptions.length === 0 && filteredCatalogOptions.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">未找到匹配模型</p>
          )}
        </div>
      )}
    </div>
  );
}