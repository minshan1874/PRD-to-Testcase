import type { ReviewCategory, ReviewIssue, ReviewResult, ReviewStat } from "@/types";

const MANUAL_PATTERN = /人工确认/;

/** 判断单条 issue 的分类：待核验 → 阻断 → 优化建议 */
function classify(issue: ReviewIssue): {
  category: ReviewCategory;
  confidence: number;
  isBlocking: boolean;
} {
  const raw = issue.confidence;
  const conf = raw === undefined || Number.isNaN(raw) ? defaultConfidence(issue.severity) : Math.max(0, Math.min(1, raw));
  const isManual = MANUAL_PATTERN.test(issue.issue);
  const isBlocking = !isManual && issue.severity === "高" && conf >= 0.8;
  return {
    category: isManual ? "manual" : isBlocking ? "blocking" : "optimize",
    confidence: conf,
    isBlocking,
  };
}

function defaultConfidence(severity: ReviewIssue["severity"]): number {
  return severity === "高" ? 0.9 : severity === "中" ? 0.6 : 0.4;
}

/** 同类问题聚合：相同问题描述合并为一条，caseIds 记录涉及的用例编号 */
function aggregate(issues: ReviewIssue[]): ReviewIssue[] {
  const map = new Map<string, ReviewIssue>();
  for (const it of issues) {
    const key = it.issue.trim();
    const existing = map.get(key);
    if (existing) {
      const last = existing.caseIds ?? [existing.caseId];
      if (!last.includes(it.caseId) && it.caseId) last.push(it.caseId);
      existing.caseIds = last;
    } else {
      map.set(key, { ...it, caseIds: [it.caseId].filter(Boolean) });
    }
  }
  return [...map.values()];
}

function buildScore(stat: ReviewStat): { score: number; text: string } {
  // 基础 100 分：阻断缺陷每条 -10，待核验不扣分，优化建议每条 -2，最低 0
  const score = Math.max(0, 100 - stat.blocking * 10 - stat.optimize * 2);
  let text: string;
  if (stat.blocking > 0) {
    text = `整体可用，${stat.blocking} 条阻断缺陷需要修复，建议处理后回归验证。`;
  } else if (stat.manual > 0) {
    text = "存在待人工业务核验项，请业务人员复核边界与规则，其余用例可执行。";
  } else if (stat.optimize > 0) {
    text = "用例整体质量良好，仅少量可选优化建议，不影响执行。";
  } else {
    text = "用例整体规范，未发现问题。";
  }
  return { score, text };
}

/**
 * 评审结果后处理：为每条 issue 打分类标签，按同类聚合，计算质量评分与统计。
 * 兼容未分类的旧结果（缺失 category 时按 severity / confidence / 【人工确认】推断）。
 */
export function postProcessReview(result: ReviewResult): ReviewResult {
  const typed = result.issues.map((it) => {
    const cls = classify(it);
    return { ...it, ...cls };
  });
  const blockingIssues = aggregate(typed.filter((it) => it.category === "blocking"));
  const manualIssues = aggregate(typed.filter((it) => it.category === "manual"));
  const optimizeIssues = aggregate(typed.filter((it) => it.category === "optimize"));
  const stat: ReviewStat = {
    totalCases: result.optimizedCases.length,
    blocking: blockingIssues.length,
    manual: manualIssues.length,
    optimize: optimizeIssues.length,
  };
  const { score, text } = buildScore(stat);
  return {
    ...result,
    stat,
    blockingIssues,
    manualIssues,
    optimizeIssues,
    score,
    scoreText: text,
  };
}