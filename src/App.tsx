import { useEffect, useRef } from "react";
import { useStore } from "@/store";
import { scrollElementBottomFlush, scrollElementToStart } from "@/lib/utils";
import Sidebar from "@/components/Sidebar";
import PreReview from "@/components/PreReview";
import ReviewPage from "@/components/ReviewPage";
import BugAnalyse from "@/components/BugAnalyse";
import ScriptModule from "@/components/ScriptModule";
import StepUpload from "@/components/steps/StepUpload";
import StepConfig from "@/components/steps/StepConfig";
import StepGenerate from "@/components/steps/StepGenerate";
import StepResults from "@/components/steps/StepResults";

const RUNNING_PHASES = ["requesting", "validating", "repairing"] as const;

export default function App() {
  const activeFeature = useStore((s) => s.activeFeature);
  const phase = useStore((s) => s.phase);
  const result = useStore((s) => s.result);
  const loadHealth = useStore((s) => s.loadHealth);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const prevPhase = useRef(phase);
  useEffect(() => {
    const prev = prevPhase.current;
    const isRunning = (RUNNING_PHASES as readonly string[]).includes(phase);
    const wasRunning = (RUNNING_PHASES as readonly string[]).includes(prev);
    // 开始生成：让生成中模块完整露出（底部对齐页面底部）
    if (isRunning && !wasRunning) {
      const gen = document.getElementById("gen-status");
      if (gen) scrollElementBottomFlush(gen);
    }
    // 生成完成：让生成结果模块从页面顶部开始展示
    if (phase === "done" && prev !== "done" && result) {
      const res = document.getElementById("results-view");
      if (res) scrollElementToStart(res);
    }
    prevPhase.current = phase;
  }, [phase, result]);

  const started = phase !== "idle";
  const showResult = phase === "done" && Boolean(result);

  return (
    <div className="flex min-h-screen flex-col bg-blueprint md:flex-row">
      <aside className="z-30 shrink-0 border-b border-sky-100 bg-sky-50/70 backdrop-blur-md md:sticky md:top-0 md:min-h-screen md:w-64 md:border-b-0 md:border-r md:border-sky-100">
        <Sidebar />
      </aside>
      <main className="w-full min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 pb-16">
          <div className={activeFeature === "script" ? "mt-8" : "hidden"}>
            <ScriptModule />
          </div>
          {activeFeature !== "script" && (activeFeature === "preview" ? (
            <div className="mt-8">
              <PreReview />
            </div>
          ) : activeFeature === "review" ? (
            <div className="mt-8">
              <ReviewPage />
            </div>
          ) : activeFeature === "bug" ? (
            <div className="mt-8">
              <BugAnalyse />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="mt-8">
                <h1 className="font-display text-xl font-semibold tracking-tight">生成测试用例</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  上传 PRD 文档并配置字段与模型，一键生成结构化测试用例；生成完成后在下方直接预览与导出结果。
                </p>
              </div>
              <StepUpload />
              <StepConfig />
              {started && <StepGenerate />}
              {showResult && <StepResults />}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
