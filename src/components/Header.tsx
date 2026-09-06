import { ClipboardList } from "lucide-react";

export default function Header() {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ClipboardList className="size-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">AI生成测试用例</h1>
        </div>
      </div>
    </header>
  );
}
