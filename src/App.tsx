import { useEffect } from "react";
import { useStore } from "@/store";
import Header from "@/components/Header";
import StepUpload from "@/components/steps/StepUpload";
import StepConfig from "@/components/steps/StepConfig";
import StepGenerate from "@/components/steps/StepGenerate";
import StepResults from "@/components/steps/StepResults";

export default function App() {
  const phase = useStore((s) => s.phase);
  const loadHealth = useStore((s) => s.loadHealth);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const generationPage = phase !== "idle";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-16">
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
  );
}
