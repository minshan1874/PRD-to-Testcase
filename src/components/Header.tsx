export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3.5">
        <div className="flex size-9 items-center justify-center">
          <svg viewBox="0 0 36 36" className="size-9 drop-shadow-sm" aria-hidden="true">
            <defs>
              <linearGradient id="header-logo-grad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#93c5fd" />
                <stop offset="1" stopColor="#60a5fa" />
              </linearGradient>
            </defs>
            {/* 渐变圆角方块 */}
            <rect width="36" height="36" rx="8" fill="url(#header-logo-grad)" />
            {/* 剪贴板主体（半透明白 + 白描边） */}
            <rect x="9.5" y="10" width="17" height="19.5" rx="3.2" fill="#ffffff" fillOpacity="0.2" stroke="#ffffff" strokeWidth="1.6" />
            {/* 顶端夹子 */}
            <rect x="13.5" y="6.5" width="9" height="5.6" rx="1.9" fill="#e0f2fe" stroke="#0369a1" strokeWidth="1" />
            {/* 清单行 1：对勾 */}
            <path d="M13.3 18.7l2.5 2.2 4.7-5.1" fill="none" stroke="#0369a1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {/* 清单行 2：横线 */}
            <line x1="13.5" y1="25.2" x2="21" y2="25.2" stroke="#0369a1" strokeWidth="2" strokeLinecap="round" />
            {/* 右上角 AI 星火（浅蓝系） */}
            <g transform="translate(24.6 13.6)">
              <path
                d="M0 -4.6 C0.7 -2.6 2.6 -0.7 4.6 0 C2.6 0.7 0.7 2.6 0 4.6 C-0.7 2.6 -2.6 0.7 -4.6 0 C-2.6 -0.7 -0.7 -2.6 0 -4.6 Z"
                fill="#e0f2fe" transform="scale(0.92)"
              />
            </g>
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-lg font-semibold leading-tight tracking-tight">AI生成测试用例</h1>
        </div>
      </div>
    </header>
  );
}