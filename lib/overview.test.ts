import assert from "node:assert/strict";
import { test } from "node:test";
import { firstAmount, parseRange, rangeBounds, summarizeOverview, type OverviewCall } from "@/lib/overview";

const NOW = new Date("2026-10-26T15:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const label = (_scorecard: string, id: string) => id.toUpperCase();

let nextId = 0;
const call = (overrides: Partial<OverviewCall>): OverviewCall => ({
    id: String(nextId++),
    originalName: "call.mp3",
    date: daysAgo(1),
    category: "SERVICE",
    outcome: "RESOLVED",
    outcomeReason: null,
    score: null,
    tier: null,
    scorecard: null,
    rep: null,
    unmatchedRepName: null,
    details: null,
    criteria: [],
    violations: [],
    ...overrides,
});

test("parseRange falls back to 30 days for unknown values", () => {
    assert.equal(parseRange("7d"), "7d");
    assert.equal(parseRange("all"), "all");
    assert.equal(parseRange("1y"), "30d");
    assert.equal(parseRange(undefined), "30d");
    assert.equal(parseRange(["7d"]), "30d");
});

test("rangeBounds covers whole days, today included, and an equal previous period", () => {
    const bounds = rangeBounds("7d", NOW);
    assert.equal(bounds?.start.toISOString(), "2026-10-20T00:00:00.000Z");
    assert.equal(bounds?.previousStart.toISOString(), "2026-10-13T00:00:00.000Z");
    assert.equal(rangeBounds("all", NOW), null);
});

test("splits the current period from the previous one for deltas", () => {
    const overview = summarizeOverview(
        [call({ score: 80 }), call({ score: 60 }), call({ date: daysAgo(10), score: 40 })],
        "7d",
        NOW,
        label,
    );
    assert.equal(overview.calls, 2);
    assert.equal(overview.previousCalls, 1);
    assert.equal(overview.avgScore, 70);
    assert.equal(overview.previousAvgScore, 40);
    assert.equal(overview.scored, 2);
    assert.equal(overview.previousScored, 1);
    assert.equal(overview.periodStart, "2026-10-20T00:00:00.000Z");
});

test("all time has no previous period", () => {
    const overview = summarizeOverview([call({ date: daysAgo(400) })], "all", NOW, label);
    assert.equal(overview.calls, 1);
    assert.equal(overview.previousCalls, null);
    assert.equal(overview.granularity, "month");
});

test("outcome rates count wins over decided calls of that type only", () => {
    const overview = summarizeOverview(
        [
            call({ category: "SALES", outcome: "BOOKED" }),
            call({ category: "SALES", outcome: "NOT_BOOKED" }),
            call({ category: "SALES", outcome: "NOT_BOOKED" }),
            call({ category: "SALES", outcome: null }),
            call({ category: "RETENTION", outcome: "SAVED" }),
            call({ category: "NOT_SCORABLE", outcome: null }),
        ],
        "30d",
        NOW,
        label,
    );
    assert.deepEqual(
        { wins: overview.outcomes.SALES.wins, total: overview.outcomes.SALES.total, rate: overview.outcomes.SALES.rate },
        { wins: 1, total: 3, rate: 33.3 },
    );
    assert.equal(overview.outcomes.RETENTION.rate, 100);
    assert.equal(overview.outcomes.SERVICE.rate, null);
    assert.equal(overview.outcomes.NOT_SCORABLE, 1);
    assert.equal(overview.outcomes.SALES.previousTotal, 0);
    assert.equal(overview.missed.total, 2);
});

test("firstAmount reads the first number quoted", () => {
    assert.equal(firstAmount("$129 initial, $49/month"), 129);
    assert.equal(firstAmount("1,250.50"), 1250.5);
    assert.equal(firstAmount("free inspection"), null);
    assert.equal(firstAmount(null), null);
});

test("missed opportunities total what was quoted on them", () => {
    const overview = summarizeOverview(
        [
            call({ category: "SALES", outcome: "NOT_BOOKED", details: { priceQuoted: "$199" } }),
            call({ category: "RETENTION", outcome: "LOST", details: { priceQuoted: "$49/month" } }),
            call({ category: "SALES", outcome: "NOT_BOOKED", details: { priceQuoted: "a fair price" } }),
            call({ category: "SALES", outcome: "BOOKED", details: { priceQuoted: "$500" } }),
        ],
        "30d",
        NOW,
        label,
    );
    assert.equal(overview.missed.total, 3);
    assert.equal(overview.missed.quoted, 248);
    assert.equal(overview.missed.quotedCalls, 2);
});

test("coaching ranks criteria by failures, keeping scorecards apart", () => {
    const sales = "Sales Calls";
    const service = "All Calls";
    const overview = summarizeOverview(
        [
            call({ rep: "Ana", scorecard: sales, criteria: [{ criterionId: "close", result: "FAIL" }, { criterionId: "greet", result: "PASS" }] }),
            call({ unmatchedRepName: "Ben", scorecard: sales, criteria: [{ criterionId: "close", result: "FAIL" }, { criterionId: "greet", result: "NA" }] }),
            call({ scorecard: service, criteria: [{ criterionId: "close", result: "FAIL" }] }),
        ],
        "30d",
        NOW,
        label,
    );
    assert.deepEqual(
        overview.coaching.map(({ key, fails, assessed, category, reps }) => ({ key, fails, assessed, category, reps })),
        [
            { key: "Sales Calls::close", fails: 2, assessed: 2, category: "SALES", reps: ["Ana", "Ben"] },
            { key: "All Calls::close", fails: 1, assessed: 1, category: "SERVICE", reps: [] },
        ],
    );
});

test("reps: assigned reps first by score, then spoken names, then unassigned", () => {
    const overview = summarizeOverview(
        [
            call({ rep: "Ana", score: 50, category: "SALES", outcome: "BOOKED" }),
            call({ rep: "Ana", score: 50, category: "RETENTION", outcome: "LOST" }),
            call({ rep: "Ben", score: 90, violations: [{ rule: "r1" }, { rule: "r2" }] }),
            call({ unmatchedRepName: "Ana", score: 100 }),
            call({ score: 100 }),
        ],
        "30d",
        NOW,
        label,
    );
    assert.deepEqual(
        overview.reps.map((r) => [r.name, r.kind, r.avgScore, r.flags, r.booking.rate, r.saves.rate]),
        [
            ["Ben", "rep", 90, 2, null, null],
            ["Ana", "rep", 50, 0, 100, 0],
            ["Ana", "spoken", 100, 0, null, null],
            ["Unassigned", "unassigned", 100, 0, null, null],
        ],
    );
});

test("policy flags count distinct calls per rule; pest types are normalized", () => {
    const overview = summarizeOverview(
        [
            call({ violations: [{ rule: "No interrupting" }, { rule: "No interrupting" }], details: { pestType: "mice" } }),
            call({ violations: [{ rule: "No interrupting" }], details: { pestType: " Mice " } }),
            call({ details: { pestType: "Ants" } }),
        ],
        "30d",
        NOW,
        label,
    );
    assert.deepEqual(overview.policies, [{ rule: "No interrupting", calls: 2 }]);
    assert.deepEqual(overview.flags, { violations: 3, calls: 2, previousCalls: 0 });
    assert.deepEqual(overview.pestTypes, [
        { name: "Mice", calls: 2 },
        { name: "Ants", calls: 1 },
    ]);
});

test("trend has one bucket per day in the range, empty days included", () => {
    const overview = summarizeOverview([call({ date: daysAgo(0), score: 50 }), call({ date: daysAgo(0), score: 70 })], "7d", NOW, label);
    assert.equal(overview.granularity, "day");
    assert.equal(overview.trend.length, 7);
    assert.deepEqual(overview.trend.at(-1), { start: "2026-10-26T00:00:00.000Z", calls: 2, avgScore: 60 });
    assert.deepEqual(overview.trend[0], { start: "2026-10-20T00:00:00.000Z", calls: 0, avgScore: null });
});
