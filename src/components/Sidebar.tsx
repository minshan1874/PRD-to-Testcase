import { useEffect } from "react";
import type { ReactNode } from "react";
import { Bug, ClipboardList, FileSearch, Key, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/store";
import type { ActiveFeature } from "@/types";
import { effectiveCapabilities } from "@/lib/models";
import { isDemoModel } from "@/lib/sampleResults";
import { ModelSelect } from "@/components/ModelSelect";
import { Input } from "@/components/ui/input";

type NavKey = "preview" | "gen" | "review" | "bug";

const NAV_ITEMS: { key: NavKey; label: string; icon: typeof ClipboardList }[] = [
  { key: "preview", label: "需求预审", icon: FileSearch },
  { key: "gen", label: "生成测试用例", icon: ClipboardList },
  { key: "review", label: "用例评审", icon: ListChecks },
  { key: "bug", label: "Bug分析", icon: Bug },
];

const FUNCTIONAL_KEYS: NavKey[] = ["gen", "preview", "review", "bug"];

/** 分组标题：功能入口 / 模型配置同级使用 */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700/70">
        {children}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-sky-200 to-transparent" />
    </div>
  );
}

/** API Key 输入（仅存内存，刷新即清空） */
function ApiKeySection() {
  const config = useStore((s) => s.config);
  const updateConfig = useStore((s) => s.updateConfig);
  // 示例模型无需 API Key，直接隐藏整块输入提示
  if (isDemoModel(config.model)) return null;

  return (
    <div className="space-y-2.5">
      <SectionLabel>API Key</SectionLabel>
      <div className="relative">
        <Key className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="password"
          className="h-8 pl-8 text-xs"
          placeholder="输入 OpenRouter API Key"
          value={config.apiKey}
          onChange={(e) => updateConfig({ apiKey: e.target.value })}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        Key 仅存内存，刷新页面需重新输入
      </p>
    </div>
  );
}

/** 全局模型配置：生成与 AI 评审共用的模型 */
function ModelConfigSection() {
  const store = useStore();
  const { config } = store;
  const hasImages = [
    ...(store.sources ?? []),
    ...(store.prereviewSources ?? []),
    ...(store.reviewSources ?? []),
  ].some((s) => s.kind === "image" || (s.pageImages && s.pageImages.length > 0));

  useEffect(() => {
    if (store.models.length === 0 && !store.modelsError) store.loadModels();
  }, [store.models.length, store.modelsError]);

  return (
    <div className="space-y-2.5">
      <SectionLabel>模型配置</SectionLabel>
      <ModelSelect
        value={config.model}
        onValueChange={(v) => {
          if (hasImages && !effectiveCapabilities(v, store.models.find((m) => m.id === v)).supportsImage) {
            toast.error("请选择支持图片的模型");
            return;
          }
          store.updateConfig({ model: v });
        }}
        showCapabilityBadges
        triggerClassName="w-full"
      />
      {!isDemoModel(config.model) && store.modelsError && (
        <p className="text-[10px] text-destructive">{store.modelsError}</p>
      )}
      {!store.models.some((m) => m.id === config.model) && (
        <Input
          className="h-8 text-xs"
          placeholder="自定义模型 ID，如 openai/o3-mini"
          value={config.model}
          onChange={(e) => store.updateConfig({ model: e.target.value })}
        />
      )}
      {config.model && (
        <p className="truncate font-mono text-[10px] text-muted-foreground">当前：{config.model}</p>
      )}
    </div>
  );
}

export default function Sidebar() {
  const active = useStore((s) => s.activeFeature);
  const setActiveFeature = useStore((s) => s.setActiveFeature);

  const handleClick = (item: { key: NavKey; label: string }) => {
    if (FUNCTIONAL_KEYS.includes(item.key)) {
      setActiveFeature(item.key as ActiveFeature);
      return;
    }
    toast.info(`${item.label} 功能即将上线，敬请期待`);
  };

  return (
    <div className="flex flex-col p-4 md:p-5">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 shadow-sm ring-1 ring-sky-200/60">
          <svg viewBox="0 0 36 36" className="size-6" aria-hidden="true">
            <defs>
              <linearGradient id="sidebar-logo-grad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#93c5fd" />
                <stop offset="1" stopColor="#60a5fa" />
              </linearGradient>
            </defs>
            <rect width="36" height="36" rx="8" fill="url(#sidebar-logo-grad)" />
            <rect x="9.5" y="10" width="17" height="19.5" rx="3.2" fill="#ffffff" fillOpacity="0.2" stroke="#ffffff" strokeWidth="1.6" />
            <rect x="13.5" y="6.5" width="9" height="5.6" rx="1.9" fill="#e0f2fe" stroke="#0369a1" strokeWidth="1" />
            <path d="M13.3 18.7l2.5 2.2 4.7-5.1" fill="none" stroke="#0369a1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="13.5" y1="25.2" x2="21" y2="25.2" stroke="#0369a1" strokeWidth="2" strokeLinecap="round" />
            <g transform="translate(24.6 13.6)">
              <path
                d="M0 -4.6 C0.7 -2.6 2.6 -0.7 4.6 0 C2.6 0.7 0.7 2.6 0 4.6 C-0.7 2.6 -2.6 0.7 -4.6 0 C-2.6 -0.7 -0.7 -2.6 0 -4.6 Z"
                fill="#e0f2fe" transform="scale(0.92)"
              />
            </g>
          </svg>
        </div>
        <div className="min-w-0">
          <p className="font-display text-base font-bold leading-tight tracking-tight text-foreground">
            AI测试效能工作台
          </p>
        </div>
      </div>

      {/* 功能入口分组标题 */}
      <div className="mt-4">
        <SectionLabel>功能入口</SectionLabel>
      </div>

      {/* 导航 */}
      <nav
        className="mt-1 flex flex-row gap-1.5 overflow-x-auto pb-1 md:mt-2 md:flex-col md:gap-2 md:overflow-visible"
        aria-label="功能入口"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          const isFunctional = FUNCTIONAL_KEYS.includes(item.key);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleClick(item)}
              aria-current={isActive ? "page" : undefined}
              className={`group flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-[0.72rem] text-left text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                isActive
                  ? "border-transparent bg-primary font-semibold text-primary-foreground shadow-md shadow-sky-300/50"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon
                className={`size-4 shrink-0 ${
                  isActive ? "text-primary-foreground" : "text-primary/70 group-hover:text-primary"
                }`}
              />
              <span className="truncate">{item.label}</span>
              {!isFunctional && (
                <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-muted-foreground/70">
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-4 space-y-4">
        <ApiKeySection />
        <ModelConfigSection />
      </div>
    </div>
  );
}
