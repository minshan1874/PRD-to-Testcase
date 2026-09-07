import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useStore } from "@/store";
import Header from "@/components/Header";
import StepUpload from "@/components/steps/StepUpload";
import StepConfig from "@/components/steps/StepConfig";
import StepGenerate from "@/components/steps/StepGenerate";
import StepResults from "@/components/steps/StepResults";
import { Button } from "@/components/ui/button";

export default function App() {
  const phase = useStore((s) => s.phase);
  const result = useStore((s) => s.result);
  const openResults = useStore((s) => s.openResults);
  const loadHealth = useStore((s) => s.loadHealth);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const generationPage = phase !== "idle";

  const steps = [
    { index: 1, label: "上传文档", active: !generationPage },
    { index: 2, label: "配置字段与模型", active: !generationPage },
    { index: 3, label: "生成与评审", active: generationPage },
  ];

  return (
    <div className="min-h-screen bg-blueprint">
      <div className="mx-auto min-h-screen bg-gradient-to-b from-transparent via-transparent to-background">
        <Header />
        <main className="mx-auto max-w-6xl px-4 pb-16">
          <div className="mt-4 flex items-center justify-center gap-2 sm:gap-3" aria-hidden="true">
            {steps.map((s, i) => (
              <div key={s.index} className="flex items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-[11px] font-medium tracking-wider ${s.active ? "text-primary" : "text-muted-foreground/60"}`}>
                    {String(s.index).padStart(2, "0")}
                  </span>
                  <span className={`text-[11px] tracking-wide ${s.active ? "font-medium text-foreground" : "text-muted-foreground/70"}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && <span className="h-px w-6 bg-border sm:w-10" />}
              </div>
            ))}
          </div>

          {(!generationPage && result) && (
            <div className="sticky top-3 z-20 mt-4 flex justify-end">
              <Button variant="outline" onClick={openResults}>
                <ArrowLeft className="size-4" /> 返回结果页（保留生成与评审结果）
              </Button>
            </div>
          )}
          <div className="mt-6 space-y-6">
            {!generationPage && (
              <fieldset
                disabled={false}
                className="min-w-0 space-y-6"
                aria-label="输入与配置"
              >
                <StepUpload />
                <StepConfig />
              </fieldset>
            )}

            {generationPage && <section className="min-w-0 space-y-6" aria-label="生成结果">
              <StepGenerate />
              <StepResults />
            </section>}
          </div>
        </main>
      </div>
    </div>
  );
}
