"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    AlertTriangle,
    ArrowRight,
    CalendarCheck01,
    ClipboardCheck,
    Clock,
    Flag05,
    HeartHand,
    Lightbulb02,
    MessageChatCircle,
    PhoneCall01,
    Star01,
    Target04,
    Tool02,
    UploadCloud02,
    Users01,
} from "@untitledui/icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getOverview, type OverviewData } from "@/app/actions/overview";
import { Button } from "@/components/base/buttons/button";
import { overviewQueryKey, parseRange, RANGES, type Overview, type RangeKey } from "@/lib/overview";
import { cx } from "@/utils/cx";
import { Badge, Card, Delta, EmptyNote, formatPercent, KPI_GRID, KPI_SPANS, Meter, OverviewSkeleton, StatTile, TIER_SEGMENTS, TierBar } from "./overview-ui";
import { TrendChart } from "./trend-chart";

const CATEGORY_LABEL: Record<string, string> = { SALES: "Sales", RETENTION: "Retention", SERVICE: "Service" };
const OUTCOME_LABEL: Record<string, string> = { NOT_BOOKED: "Not booked", LOST: "Lost", UNRESOLVED: "Unresolved" };

const OVERVIEW_STALE_MS = 30_000;

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

type Pipeline = OverviewData["pipeline"];

export function OverviewContent() {
    const range = parseRange(useSearchParams().get("range"));
    // Nested under the calls key, so anything that invalidates the call list (uploads, retries, rep changes,
    // a new rubric) refreshes the overview too. Switching ranges keeps the last one on screen until the new one lands.
    const query = useQuery({
        queryKey: overviewQueryKey(range),
        queryFn: () => getOverview(range),
        placeholderData: keepPreviousData,
        // Next keeps visited pages alive and re-reveals them on return, which would otherwise refetch every visit.
        // Mutations still invalidate immediately; this only spares quick back-and-forth navigation.
        staleTime: OVERVIEW_STALE_MS,
    });

    if (!query.data) return query.isError ? <p className="text-sm text-error-primary">{query.error.message}</p> : <OverviewSkeleton />;

    const { overview, pipeline } = query.data;
    if (pipeline.total === 0) return <NoCallsYet />;

    const periodLabel = RANGES[range].label.toLowerCase();
    const emptyPeriod = range === "all" ? "No analyzed calls yet." : `No analyzed calls in the last ${periodLabel}.`;

    return (
        <div
            aria-busy={query.isPlaceholderData}
            className={cx("flex flex-col gap-6 transition-opacity", query.isPlaceholderData && "pointer-events-none opacity-60")}
        >
            <AttentionStrip pipeline={pipeline} />
            <KpiRow overview={overview} range={range} />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <TrendChart className="xl:col-span-2" trend={overview.trend} granularity={overview.granularity} />
                <TierCard overview={overview} empty={emptyPeriod} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <OutcomesCard overview={overview} periodLabel={range === "all" ? null : periodLabel} empty={emptyPeriod} />
                <MissedCard overview={overview} className="xl:col-span-2" />
            </div>

            <RepTable overview={overview} empty={emptyPeriod} />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <CoachingCard overview={overview} />
                <PolicyCard overview={overview} />
                <PestCard overview={overview} />
            </div>
        </div>
    );
}

function NoCallsYet() {
    return (
        <section className="flex flex-col items-center gap-4 rounded-xl bg-primary px-6 py-16 text-center shadow-xs ring-1 ring-secondary">
            <span className="flex size-12 items-center justify-center rounded-xl ring-1 ring-secondary">
                <UploadCloud02 className="size-6 text-fg-tertiary" />
            </span>
            <div className="flex max-w-md flex-col gap-1">
                <h2 className="text-lg font-semibold text-primary">Your overview fills in as calls are analyzed</h2>
                <p className="text-sm text-tertiary">
                    Upload call recordings to see quality scores, booking and save rates, rep performance, and what to coach on next.
                </p>
            </div>
            <Button href="/calls" size="md" iconTrailing={<ArrowRight data-icon />}>
                Go to Calls
            </Button>
        </section>
    );
}

/** Only shows when something needs the admin: failures, a stalled queue, reps to confirm, or no rubric to score against. */
function AttentionStrip({ pipeline }: { pipeline: Pipeline }) {
    const items = [
        !pipeline.hasActiveRubric && {
            icon: ClipboardCheck,
            text: "No active rubric set, so new calls won't be scored",
            tone: "warning",
        },
        pipeline.failed > 0 && {
            icon: AlertTriangle,
            text: `${pipeline.failed} call${pipeline.failed === 1 ? "" : "s"} failed processing`,
            tone: "error",
        },
        pipeline.processing > 0 && {
            icon: Clock,
            text: `${pipeline.processing} call${pipeline.processing === 1 ? " is" : "s are"} waiting to be processed. Open Calls to keep them moving`,
            tone: "brand",
        },
        pipeline.spokenNames > 0 && {
            icon: Users01,
            text: `${pipeline.spokenNames} call${pipeline.spokenNames === 1 ? " has a rep name" : "s have rep names"} to confirm`,
            tone: "warning",
        },
    ].filter((item) => item !== false);
    if (items.length === 0) return null;

    return (
        <section aria-label="Needs attention" className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-primary px-5 py-3 shadow-xs ring-1 ring-secondary">
            <h2 className="text-sm font-semibold text-primary">Needs attention</h2>
            <ul className="flex flex-1 flex-wrap gap-x-6 gap-y-2">
                {items.map(({ icon: Icon, text, tone }) => (
                    <li
                        key={text}
                        className={cx(
                            "flex items-center gap-2 text-sm",
                            tone === "error" ? "text-error-primary" : tone === "warning" ? "text-warning-primary" : "text-brand-secondary",
                        )}
                    >
                        <Icon className="size-4 shrink-0" />
                        {text}
                    </li>
                ))}
            </ul>
            <Button href="/calls" size="sm" color="link-gray" iconTrailing={<ArrowRight data-icon />}>
                Review calls
            </Button>
        </section>
    );
}

function KpiRow({ overview, range }: { overview: Overview; range: RangeKey }) {
    const periodLabel = RANGES[range].label.toLowerCase();
    const hasPrevious = range !== "all";
    const { SALES, RETENTION } = overview.outcomes;
    const rateDelta = (current: number | null, previous: number | null) =>
        hasPrevious && <Delta current={current} previous={previous} unit="points" goodWhen="up" periodLabel={periodLabel} />;

    return (
        <section aria-label="Key metrics" className={KPI_GRID}>
            <StatTile
                label="Calls analyzed"
                className={KPI_SPANS[0]}
                icon={PhoneCall01}
                value={overview.calls.toLocaleString()}
                detail={overview.outcomes.NOT_SCORABLE > 0 ? `${overview.outcomes.NOT_SCORABLE} not scorable (voicemail, wrong number…)` : undefined}
                delta={hasPrevious && <Delta current={overview.calls} previous={overview.previousCalls} unit="count" goodWhen="neutral" periodLabel={periodLabel} />}
            />
            <StatTile
                label="Avg. quality score"
                className={KPI_SPANS[1]}
                icon={Star01}
                value={formatPercent(overview.avgScore)}
                detail="Rubric criteria passed"
                delta={rateDelta(overview.avgScore, overview.previousAvgScore)}
            />
            <StatTile
                label="Booking rate"
                className={KPI_SPANS[2]}
                icon={CalendarCheck01}
                value={formatPercent(SALES.rate)}
                detail={SALES.total ? `${SALES.wins} of ${SALES.total} sales call${SALES.total === 1 ? "" : "s"} booked` : "No sales calls"}
                delta={SALES.total > 0 && rateDelta(SALES.rate, SALES.previousRate)}
            />
            <StatTile
                label="Save rate"
                className={KPI_SPANS[3]}
                icon={HeartHand}
                value={formatPercent(RETENTION.rate)}
                detail={RETENTION.total ? `${RETENTION.wins} of ${RETENTION.total} cancellation${RETENTION.total === 1 ? "" : "s"} saved` : "No cancellation calls"}
                delta={RETENTION.total > 0 && rateDelta(RETENTION.rate, RETENTION.previousRate)}
            />
            <StatTile
                label="Policy flags"
                className={KPI_SPANS[4]}
                icon={Flag05}
                value={overview.flags.violations.toLocaleString()}
                detail={overview.flags.calls ? `Across ${overview.flags.calls} call${overview.flags.calls === 1 ? "" : "s"}` : "No policy issues"}
                delta={
                    hasPrevious && (
                        <Delta current={overview.flags.violations} previous={overview.flags.previousViolations} unit="count" goodWhen="down" periodLabel={periodLabel} />
                    )
                }
            />
        </section>
    );
}

function TierCard({ overview, empty }: { overview: Overview; empty: string }) {
    const scored = overview.tiers.GOLD + overview.tiers.GREEN + overview.tiers.BELOW;
    const greenOrBetter = scored ? Math.round(((overview.tiers.GOLD + overview.tiers.GREEN) / scored) * 100) : null;

    return (
        <Card title="Quality tiers" description="How scored calls landed against the rubric" icon={Target04}>
            {overview.calls === 0 ? (
                <EmptyNote>{empty}</EmptyNote>
            ) : (
                <div className="flex flex-1 flex-col gap-5">
                    <div>
                        <p className="text-display-md font-semibold text-primary">{greenOrBetter === null ? "–" : `${greenOrBetter}%`}</p>
                        <p className="text-sm text-tertiary">of scored calls at Green or better</p>
                    </div>
                    <TierBar tiers={overview.tiers} className="h-3" />
                    <dl className="flex flex-col gap-2.5">
                        {TIER_SEGMENTS.map((s) => (
                            <div key={s.key} className="flex items-center gap-2 text-sm">
                                <span className={cx("size-2.5 rounded-full", s.swatch)} aria-hidden />
                                <dt className="flex-1 text-secondary">{s.label}</dt>
                                <dd className="font-medium text-primary tabular-nums">{overview.tiers[s.key]}</dd>
                                <dd className="w-12 text-right text-tertiary tabular-nums">
                                    {overview.calls ? `${Math.round((overview.tiers[s.key] / overview.calls) * 100)}%` : "–"}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
        </Card>
    );
}

function OutcomesCard({ overview, periodLabel, empty }: { overview: Overview; periodLabel: string | null; empty: string }) {
    const rows = [
        { key: "SALES", icon: CalendarCheck01, win: "booked" },
        { key: "RETENTION", icon: HeartHand, win: "saved" },
        { key: "SERVICE", icon: Tool02, win: "resolved" },
    ] as const;

    return (
        <Card title="Outcomes by call type" description="Share of calls that ended in a win" icon={PhoneCall01}>
            {overview.calls === 0 ? (
                <EmptyNote>{empty}</EmptyNote>
            ) : (
                <ul className="flex flex-col gap-5">
                    {rows.map(({ key, icon: Icon, win }) => {
                        const o = overview.outcomes[key];
                        return (
                            <li key={key} className="flex flex-col gap-2">
                                <div className="flex items-baseline justify-between gap-3">
                                    <p className="flex items-center gap-2 text-sm font-medium text-secondary">
                                        <Icon className="size-4 text-fg-quaternary" />
                                        {CATEGORY_LABEL[key]}
                                    </p>
                                    <p className="text-lg font-semibold text-primary">{formatPercent(o.rate)}</p>
                                </div>
                                <Meter value={o.rate ?? 0} label={`${CATEGORY_LABEL[key]} ${win} rate`} />
                                <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-tertiary">
                                    <span>{o.total ? `${o.wins} of ${o.total} ${win}` : "No calls"}</span>
                                    {periodLabel && o.total > 0 && (
                                        <Delta current={o.rate} previous={o.previousRate} unit="points" goodWhen="up" periodLabel={periodLabel} />
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

function MissedCard({ overview, className }: { overview: Overview; className?: string }) {
    const { total, calls } = overview.missed;
    return (
        <Card
            className={className}
            title="Missed opportunities"
            description="Unbooked sales, lost cancellations and unresolved issues worth a follow-up"
            icon={AlertTriangle}
            action={
                total > calls.length && (
                    <Button href="/calls" size="sm" color="link-gray" iconTrailing={<ArrowRight data-icon />}>
                        All {total}
                    </Button>
                )
            }
        >
            {calls.length === 0 ? (
                <EmptyNote>Nothing slipped through. Every analyzed call ended in a win.</EmptyNote>
            ) : (
                <ul className="-mx-2 flex flex-col">
                    {calls.map((call) => (
                        <li key={call.id}>
                            <Link
                                href={`/calls?call=${call.id}`}
                                className="group flex flex-col gap-1.5 rounded-lg px-2 py-3 outline-focus-ring hover:bg-primary_hover focus-visible:outline-2"
                            >
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <Badge tone="error">{OUTCOME_LABEL[call.outcome ?? ""]}</Badge>
                                    <span className="text-sm font-medium text-primary group-hover:underline">{call.originalName}</span>
                                    <span className="text-xs text-tertiary">
                                        {[call.category && CATEGORY_LABEL[call.category], call.rep ?? call.unmatchedRepName, dateFormat.format(call.date)]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </span>
                                    <ArrowRight className="ml-auto size-4 text-fg-quaternary opacity-0 transition group-hover:opacity-100" aria-hidden />
                                </div>
                                {call.outcomeReason && <p className="line-clamp-2 text-sm text-secondary">{call.outcomeReason}</p>}
                                {(call.details?.followUp || call.details?.priceQuoted) && (
                                    <dl className="flex flex-col gap-0.5 text-xs">
                                        {call.details.followUp && (
                                            <div className="flex gap-1.5">
                                                <dt className="shrink-0 font-medium text-tertiary">Follow-up</dt>
                                                <dd className="line-clamp-1 text-secondary">{call.details.followUp}</dd>
                                            </div>
                                        )}
                                        {call.details.priceQuoted && (
                                            <div className="flex gap-1.5">
                                                <dt className="shrink-0 font-medium text-tertiary">Quoted</dt>
                                                <dd className="line-clamp-1 text-secondary">{call.details.priceQuoted}</dd>
                                            </div>
                                        )}
                                    </dl>
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

function RepTable({ overview, empty }: { overview: Overview; empty: string }) {
    return (
        <Card title="Rep performance" description="Scores, conversions and the skill each rep misses most" icon={Users01}>
            {overview.reps.length === 0 ? (
                <EmptyNote>{empty}</EmptyNote>
            ) : (
                <div className="-mx-6 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="border-y border-secondary bg-secondary text-xs text-tertiary">
                            <tr>
                                <th scope="col" className="px-6 py-3 font-medium">Rep</th>
                                <th scope="col" className="px-4 py-3 text-right font-medium">Calls</th>
                                <th scope="col" className="px-4 py-3 font-medium">Avg. score</th>
                                <th scope="col" className="px-4 py-3 font-medium">Tiers</th>
                                <th scope="col" className="px-4 py-3 font-medium" title="Sales booked plus cancellations saved">
                                    Conversion
                                </th>
                                <th scope="col" className="px-4 py-3 text-right font-medium">Flags</th>
                                <th scope="col" className="px-6 py-3 font-medium">Most missed</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-secondary">
                            {overview.reps.map((rep) => (
                                <tr key={`${rep.kind}:${rep.name}`}>
                                    <th scope="row" className="px-6 py-4 font-medium">
                                        <span className="flex items-center gap-2">
                                            <span
                                                className={cx(
                                                    "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                                    rep.kind === "rep" ? "bg-brand-secondary text-brand-secondary" : "bg-secondary text-quaternary",
                                                )}
                                                aria-hidden
                                            >
                                                {rep.kind === "unassigned" ? "?" : rep.name.charAt(0).toUpperCase()}
                                            </span>
                                            <span className={rep.kind === "unassigned" ? "text-tertiary" : "text-primary"}>{rep.name}</span>
                                            {rep.kind === "spoken" && (
                                                <Badge tone="warning" title="Heard on the call, not confirmed as one of your reps">
                                                    Unconfirmed
                                                </Badge>
                                            )}
                                        </span>
                                    </th>
                                    <td className="px-4 py-4 text-right text-secondary tabular-nums">{rep.calls}</td>
                                    <td className="px-4 py-4">
                                        <span className="flex items-center gap-3">
                                            <span className="w-12 font-medium text-primary tabular-nums">{formatPercent(rep.avgScore)}</span>
                                            {rep.avgScore !== null && <Meter value={rep.avgScore} label={`${rep.name} average score`} className="w-20" />}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4">
                                        <TierBar tiers={rep.tiers} className="w-24" />
                                    </td>
                                    <td className="px-4 py-4 text-secondary tabular-nums">
                                        {rep.conversion.total ? (
                                            <>
                                                <span className="font-medium text-primary">{formatPercent(rep.conversion.rate)}</span>
                                                <span className="text-tertiary"> · {rep.conversion.wins}/{rep.conversion.total}</span>
                                            </>
                                        ) : (
                                            <span className="text-quaternary">–</span>
                                        )}
                                    </td>
                                    <td className={cx("px-4 py-4 text-right tabular-nums", rep.flags ? "font-medium text-warning-primary" : "text-quaternary")}>
                                        {rep.flags || "–"}
                                    </td>
                                    <td className="max-w-64 px-6 py-4 text-secondary">
                                        <span className="line-clamp-1" title={rep.topMiss ?? undefined}>
                                            {rep.topMiss ?? <span className="text-quaternary">–</span>}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

function CoachingCard({ overview }: { overview: Overview }) {
    return (
        <Card title="Coaching focus" description="Rubric criteria missed most often" icon={Lightbulb02}>
            {overview.coaching.length === 0 ? (
                <EmptyNote>No missed criteria in this period.</EmptyNote>
            ) : (
                <ol className="flex flex-col gap-4">
                    {overview.coaching.map((c) => {
                        const failRate = Math.round((c.fails / c.assessed) * 100);
                        return (
                            <li key={c.key} className="flex flex-col gap-1.5">
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-sm font-medium text-primary first-letter:uppercase">{c.label}</p>
                                    {c.category && <Badge tone="gray">{CATEGORY_LABEL[c.category]}</Badge>}
                                </div>
                                <Meter value={failRate} tone="error" label={`${c.label} miss rate`} />
                                <p className="text-xs text-tertiary">
                                    Missed in {c.fails} of {c.assessed} call{c.assessed === 1 ? "" : "s"} ({failRate}%)
                                </p>
                            </li>
                        );
                    })}
                </ol>
            )}
        </Card>
    );
}

function PolicyCard({ overview }: { overview: Overview }) {
    return (
        <Card title="Policy flags" description="Company rules broken on calls" icon={Flag05}>
            {overview.policies.length === 0 ? (
                <EmptyNote>No policy issues in this period.</EmptyNote>
            ) : (
                <ul className="flex flex-col divide-y divide-secondary">
                    {overview.policies.slice(0, 5).map((p) => (
                        <li key={p.rule} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                            <p className="line-clamp-2 text-sm text-secondary" title={p.rule}>
                                {p.rule}
                            </p>
                            <Badge tone="warning">
                                {p.calls} call{p.calls === 1 ? "" : "s"}
                            </Badge>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

function PestCard({ overview }: { overview: Overview }) {
    const max = Math.max(...overview.pestTypes.map((p) => p.calls));
    return (
        <Card title="What customers call about" description="Pests mentioned on analyzed calls" icon={MessageChatCircle}>
            {overview.pestTypes.length === 0 ? (
                <EmptyNote>No pests mentioned in this period.</EmptyNote>
            ) : (
                <ul className="flex flex-col gap-3">
                    {overview.pestTypes.map((p) => (
                        <li key={p.name} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm">
                            <span className="truncate text-secondary" title={p.name}>
                                {p.name}
                            </span>
                            <span className="h-5" aria-hidden>
                                <span className="block h-full max-w-full rounded-r-sm bg-utility-brand-500" style={{ width: `${(p.calls / max) * 100}%` }} />
                            </span>
                            <span className="w-6 text-right font-medium text-primary tabular-nums">{p.calls}</span>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
