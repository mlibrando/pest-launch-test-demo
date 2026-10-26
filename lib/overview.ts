import { CALLS_QUERY_KEY, categoryForCallType, type Category, type Tier } from "@/lib/calls";

export const RANGES = {
    "7d": { label: "7 days", days: 7 },
    "30d": { label: "30 days", days: 30 },
    "90d": { label: "90 days", days: 90 },
    all: { label: "All time", days: null },
} as const;
export type RangeKey = keyof typeof RANGES;
export const DEFAULT_RANGE: RangeKey = "30d";

export const overviewQueryKey = (range: RangeKey) => [...CALLS_QUERY_KEY, "overview", range];

export const parseRange = (value: unknown): RangeKey => (typeof value === "string" && value in RANGES ? (value as RangeKey) : DEFAULT_RANGE);

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** The current period's start and the previous period's start, so deltas compare like with like. Null for all time. */
export function rangeBounds(range: RangeKey, now: Date): { start: Date; previousStart: Date } | null {
    const { days } = RANGES[range];
    if (days === null) return null;
    const start = new Date(startOfUtcDay(now).getTime() - (days - 1) * DAY_MS);
    return { start, previousStart: new Date(start.getTime() - days * DAY_MS) };
}

/** An analyzed call, dated by when it happened (or was uploaded, until a real call date exists). */
export type OverviewCall = {
    id: string;
    originalName: string;
    date: Date;
    category: string | null;
    outcome: string | null;
    outcomeReason: string | null;
    score: number | null;
    tier: Tier | null;
    scorecard: string | null;
    rep: string | null;
    /** The name the rep introduced themselves with, when it doesn't match one of the company's reps. */
    unmatchedRepName: string | null;
    details: {
        customerName?: string | null;
        pestType?: string | null;
        serviceRequested?: string | null;
        priceQuoted?: string | null;
        followUp?: string | null;
    } | null;
    criteria: { criterionId: string; result: string }[];
    violations: { rule: string }[];
};

// The outcome that counts as a win for each call type.
const WIN_OUTCOME: Record<Exclude<Category, "NOT_SCORABLE">, string> = { SALES: "BOOKED", RETENTION: "SAVED", SERVICE: "RESOLVED" };
export const MISSED_OUTCOMES = ["NOT_BOOKED", "LOST", "UNRESOLVED"];

export type Rate = { wins: number; total: number; rate: number | null };
export type TrendBucket = { start: string; calls: number; avgScore: number | null };
export type TierCounts = Record<Tier, number> & { unscored: number };

export type RepSummary = {
    name: string;
    /** "spoken": the name the rep introduced themselves with, not yet matched to one of the company's reps. */
    kind: "rep" | "spoken" | "unassigned";
    calls: number;
    avgScore: number | null;
    tiers: TierCounts;
    booking: Rate;
    saves: Rate;
    flags: number;
    topMiss: string | null;
};

/** Fewer calls than this on either side of a comparison and the change is mostly noise, so it isn't shown. */
export const MIN_COMPARABLE = 5;

export type Overview = {
    /** When the period starts: the range's first day, or the earliest call for all time. */
    periodStart: string;
    calls: number;
    previousCalls: number | null;
    avgScore: number | null;
    previousAvgScore: number | null;
    /** How many calls each average is over, so small samples can be left out of comparisons. */
    scored: number;
    previousScored: number | null;
    tiers: TierCounts;
    outcomes: Record<Exclude<Category, "NOT_SCORABLE">, Rate & { previousRate: number | null; previousTotal: number | null }> & { NOT_SCORABLE: number };
    flags: { violations: number; calls: number; previousCalls: number | null };
    granularity: "day" | "week" | "month";
    trend: TrendBucket[];
    reps: RepSummary[];
    coaching: { key: string; label: string; category: Category | null; fails: number; assessed: number; reps: string[] }[];
    policies: { rule: string; calls: number }[];
    pestTypes: { name: string; calls: number }[];
    /** `quoted` sums the first amount quoted on each missed call that had one. */
    missed: { total: number; quoted: number; quotedCalls: number; calls: OverviewCall[] };
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (values: number[]) => (values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null);
const scores = (calls: OverviewCall[]) => calls.flatMap((c) => (c.score === null ? [] : [c.score]));

function rate(calls: OverviewCall[], category: keyof typeof WIN_OUTCOME): Rate {
    const decided = calls.filter((c) => c.category === category && c.outcome !== null);
    const wins = decided.filter((c) => c.outcome === WIN_OUTCOME[category]).length;
    return { wins, total: decided.length, rate: decided.length ? round1((wins / decided.length) * 100) : null };
}

function tierCounts(calls: OverviewCall[]): TierCounts {
    const counts: TierCounts = { GOLD: 0, GREEN: 0, BELOW: 0, unscored: 0 };
    for (const c of calls) counts[c.tier ?? "unscored"]++;
    return counts;
}

/** Criteria failed most often across the calls, keyed by scorecard so same-named criteria on different scorecards stay apart. */
function criterionFails(calls: OverviewCall[], labelFor: CriterionLabel) {
    const byKey = new Map<string, Overview["coaching"][number] & { repFails: Map<string, number> }>();
    for (const call of calls) {
        if (!call.scorecard) continue;
        for (const { criterionId, result } of call.criteria) {
            if (result !== "PASS" && result !== "FAIL") continue;
            const key = `${call.scorecard}::${criterionId}`;
            const entry = byKey.get(key) ?? {
                key,
                label: labelFor(call.scorecard, criterionId),
                category: categoryForCallType(call.scorecard),
                fails: 0,
                assessed: 0,
                reps: [],
                repFails: new Map(),
            };
            entry.assessed++;
            if (result === "FAIL") {
                entry.fails++;
                const rep = call.rep ?? call.unmatchedRepName;
                if (rep) entry.repFails.set(rep, (entry.repFails.get(rep) ?? 0) + 1);
            }
            byKey.set(key, entry);
        }
    }
    return [...byKey.values()]
        .filter((e) => e.fails > 0)
        .sort((a, b) => b.fails - a.fails || b.fails / b.assessed - a.fails / a.assessed)
        .map(({ repFails, ...entry }) => ({
            ...entry,
            // The reps who miss it most, so the coaching has someone to go to.
            reps: [...repFails].sort((a, b) => b[1] - a[1]).map(([name]) => name),
        }));
}

/** "$129 initial, $49/month" → 129. The first amount is what the customer heard first; null when there's no number. */
export function firstAmount(priceQuoted: string | null | undefined) {
    const match = priceQuoted?.match(/\d[\d,]*(?:\.\d+)?/);
    if (!match) return null;
    const amount = Number(match[0].replaceAll(",", ""));
    return Number.isFinite(amount) ? amount : null;
}

function bucketStart(date: Date, granularity: Overview["granularity"]) {
    const day = startOfUtcDay(date);
    if (granularity === "day") return day;
    if (granularity === "month") return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
    // Weeks start on Monday.
    return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS);
}

function nextBucket(date: Date, granularity: Overview["granularity"]) {
    if (granularity === "month") return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    return new Date(date.getTime() + (granularity === "week" ? 7 : 1) * DAY_MS);
}

function trend(calls: OverviewCall[], from: Date, now: Date, granularity: Overview["granularity"]): TrendBucket[] {
    const buckets: TrendBucket[] = [];
    for (let start = bucketStart(from, granularity); start <= now; start = nextBucket(start, granularity)) {
        const end = nextBucket(start, granularity);
        const inBucket = calls.filter((c) => c.date >= start && c.date < end);
        buckets.push({ start: start.toISOString(), calls: inBucket.length, avgScore: mean(scores(inBucket)) });
    }
    return buckets;
}

/** "mice", "Mice " → "Mice" */
const normalizePest = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

export type CriterionLabel = (scorecard: string, criterionId: string) => string;

/** Rolls the analyzed calls up for the Overview page. `calls` may include the previous period, which only feeds the deltas. */
export function summarizeOverview(calls: OverviewCall[], range: RangeKey, now: Date, labelFor: CriterionLabel): Overview {
    const bounds = rangeBounds(range, now);
    const current = bounds ? calls.filter((c) => c.date >= bounds.start) : calls;
    const previous = bounds ? calls.filter((c) => c.date >= bounds.previousStart && c.date < bounds.start) : null;

    const from = bounds?.start ?? (current.length ? new Date(Math.min(...current.map((c) => c.date.getTime()))) : now);
    const spanDays = (now.getTime() - from.getTime()) / DAY_MS;
    const granularity = spanDays <= 31 ? "day" : spanDays <= 26 * 7 ? "week" : "month";

    const outcome = (category: keyof typeof WIN_OUTCOME) => {
        const before = previous && rate(previous, category);
        return { ...rate(current, category), previousRate: before?.rate ?? null, previousTotal: before?.total ?? null };
    };

    // Keyed by whether the rep is assigned too, so an unconfirmed spoken name never merges into a real rep's numbers.
    const repGroups = Map.groupBy(current, (c) => (c.rep ? `rep:${c.rep}` : `spoken:${c.unmatchedRepName ?? ""}`));
    const reps: RepSummary[] = [...repGroups.values()].map((repCalls) => {
        const { rep, unmatchedRepName } = repCalls[0];
        return {
            name: rep ?? unmatchedRepName ?? "Unassigned",
            kind: rep ? "rep" : unmatchedRepName ? "spoken" : "unassigned",
            calls: repCalls.length,
            avgScore: mean(scores(repCalls)),
            tiers: tierCounts(repCalls),
            booking: rate(repCalls, "SALES"),
            saves: rate(repCalls, "RETENTION"),
            flags: repCalls.reduce((n, c) => n + c.violations.length, 0),
            topMiss: criterionFails(repCalls, labelFor)[0]?.label ?? null,
        };
    });
    // Reps first by score, then unconfirmed spoken names, then calls with no rep at all.
    const KIND_ORDER = { rep: 0, spoken: 1, unassigned: 2 };
    reps.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (b.avgScore ?? -1) - (a.avgScore ?? -1));

    const policyCalls = new Map<string, Set<string>>();
    for (const call of current) for (const v of call.violations) policyCalls.set(v.rule, (policyCalls.get(v.rule) ?? new Set()).add(call.id));

    const pestCounts = new Map<string, number>();
    for (const call of current) {
        const pest = call.details?.pestType;
        if (pest?.trim()) pestCounts.set(normalizePest(pest), (pestCounts.get(normalizePest(pest)) ?? 0) + 1);
    }

    const missed = current.filter((c) => c.outcome !== null && MISSED_OUTCOMES.includes(c.outcome)).sort((a, b) => b.date.getTime() - a.date.getTime());
    const quotes = missed.flatMap((c) => firstAmount(c.details?.priceQuoted) ?? []);
    const flaggedCalls = (list: OverviewCall[]) => list.filter((c) => c.violations.length > 0).length;

    return {
        periodStart: from.toISOString(),
        calls: current.length,
        previousCalls: previous?.length ?? null,
        avgScore: mean(scores(current)),
        previousAvgScore: previous ? mean(scores(previous)) : null,
        scored: scores(current).length,
        previousScored: previous ? scores(previous).length : null,
        tiers: tierCounts(current),
        outcomes: {
            SALES: outcome("SALES"),
            RETENTION: outcome("RETENTION"),
            SERVICE: outcome("SERVICE"),
            NOT_SCORABLE: current.filter((c) => c.category === "NOT_SCORABLE").length,
        },
        flags: {
            violations: current.reduce((n, c) => n + c.violations.length, 0),
            calls: flaggedCalls(current),
            previousCalls: previous ? flaggedCalls(previous) : null,
        },
        granularity,
        trend: trend(current, from, now, granularity),
        reps,
        coaching: criterionFails(current, labelFor).slice(0, 5),
        policies: [...policyCalls].map(([rule, ids]) => ({ rule, calls: ids.size })).sort((a, b) => b.calls - a.calls),
        pestTypes: [...pestCounts].map(([name, n]) => ({ name, calls: n })).sort((a, b) => b.calls - a.calls).slice(0, 6),
        missed: { total: missed.length, quoted: quotes.reduce((a, b) => a + b, 0), quotedCalls: quotes.length, calls: missed.slice(0, 8) },
    };
}
