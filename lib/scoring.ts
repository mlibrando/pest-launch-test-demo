import type { Tier } from "@/lib/calls";
import type { Scorecard } from "@/lib/rubrics";

export type ScoredCriterion = { criterionId: string; result: "PASS" | "FAIL" | "NA" };

export function scoreScorecard(
    scorecard: Scorecard,
    results: ScoredCriterion[],
): { points: number; maxPoints: number; score: number; tier: Tier } | null {
    const maxPoints = scorecard.criteria.length - results.filter((r) => r.result === "NA").length;
    if (maxPoints === 0) return null;
    const points = results.filter((r) => r.result === "PASS").length;
    const score = Math.round((points / maxPoints) * 1000) / 10;
    const { green } = scorecard.thresholds;
    const gold = scorecard.thresholds.gold ?? scorecard.criteria.length;
    // Cross-multiplied so the threshold scales to maxPoints without floating-point comparisons.
    const tier: Tier = points === maxPoints ? "GOLD" : green !== undefined && points * gold >= green * maxPoints ? "GREEN" : "BELOW";
    return { points, maxPoints, score, tier };
}
