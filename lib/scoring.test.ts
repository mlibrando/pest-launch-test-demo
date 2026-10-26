import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryForCallType } from "@/lib/calls";
import type { Scorecard } from "@/lib/rubrics";
import { scoreScorecard, type ScoredCriterion } from "@/lib/scoring";

const scorecard = (count: number, thresholds: Scorecard["thresholds"]): Scorecard => ({
    callType: "Test",
    thresholds,
    criteria: Array.from({ length: count }, (_, i) => ({ id: `c${i}`, quadrant: "Q", label: `C${i}`, qualityBar: "", sourceRef: "" })),
});

// Builds results in criterion order: `pass` PASS, then `na` NA, then FAIL for the rest.
const results = (sc: Scorecard, pass: number, na = 0): ScoredCriterion[] =>
    sc.criteria.map((c, i) => ({ criterionId: c.id, result: i < pass ? "PASS" : i < pass + na ? "NA" : "FAIL" }));

const sales = scorecard(17, { gold: 17, green: 14 });
const allCalls = scorecard(12, { gold: 12, green: 11 });

test("Sales: 17/17 Gold, 14/17 Green, 13/17 Below", () => {
    assert.deepEqual(scoreScorecard(sales, results(sales, 17)), { points: 17, maxPoints: 17, score: 100, tier: "GOLD" });
    assert.deepEqual(scoreScorecard(sales, results(sales, 14)), { points: 14, maxPoints: 17, score: 82.4, tier: "GREEN" });
    assert.deepEqual(scoreScorecard(sales, results(sales, 13)), { points: 13, maxPoints: 17, score: 76.5, tier: "BELOW" });
});

test("All Calls: 11/12 Green, 10/12 Below", () => {
    assert.equal(scoreScorecard(allCalls, results(allCalls, 11))?.tier, "GREEN");
    assert.equal(scoreScorecard(allCalls, results(allCalls, 10))?.tier, "BELOW");
});

test("Sales with 4 excluded scales the green threshold to maxPoints 13", () => {
    assert.deepEqual(scoreScorecard(sales, results(sales, 13, 4)), { points: 13, maxPoints: 13, score: 100, tier: "GOLD" });
    assert.deepEqual(scoreScorecard(sales, results(sales, 11, 4)), { points: 11, maxPoints: 13, score: 84.6, tier: "GREEN" });
    assert.deepEqual(scoreScorecard(sales, results(sales, 10, 4)), { points: 10, maxPoints: 13, score: 76.9, tier: "BELOW" });
});

test("auto-pass results arrive as PASS and count as points", () => {
    // The orchestrator records an auto-passed criterion as result PASS (source AUTO_PASS).
    const r = results(allCalls, 9);
    r[9] = { criterionId: "c9", result: "PASS" };
    r[10] = { criterionId: "c10", result: "PASS" };
    assert.deepEqual(scoreScorecard(allCalls, r), { points: 11, maxPoints: 12, score: 91.7, tier: "GREEN" });
});

test("everything excluded returns null", () => {
    assert.equal(scoreScorecard(allCalls, results(allCalls, 0, 12)), null);
});

test("no green threshold: Gold or Below", () => {
    const sc = scorecard(5, { gold: 5 });
    assert.equal(scoreScorecard(sc, results(sc, 5))?.tier, "GOLD");
    assert.equal(scoreScorecard(sc, results(sc, 4))?.tier, "BELOW");
    assert.equal(scoreScorecard(sc, results(sc, 0))?.tier, "BELOW");
});

test("categoryForCallType maps the active rubric's call types", () => {
    assert.equal(categoryForCallType("All Calls (General: Re-service, Scheduling, Billing, Other non-cancel)"), "SERVICE");
    assert.equal(categoryForCallType("Retention Calls (cancellation)"), "RETENTION");
    assert.equal(categoryForCallType("Sales Calls (New Customer / inbound sales)"), "SALES");
});
