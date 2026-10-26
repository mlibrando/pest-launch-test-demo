"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, ClipboardCheck, Clock, UploadCloud02, Users01 } from "@untitledui/icons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getOverview, type OverviewData } from "@/app/actions/overview";
import { Button } from "@/components/base/buttons/button";
import { firstAmount, overviewQueryKey, parseRange, RANGES, type Overview, type OverviewCall, type Rate, type RangeKey, type RepSummary } from "@/lib/overview";
import { cx } from "@/utils/cx";
import { Badge, Card, Delta, EmptyNote, formatMoney, formatPercent, KPI_LAST, KPI_STRIP, OverviewSkeleton, StatTile, TierBar } from "./overview-ui";
import { TrendChart } from "./trend-chart";

const CATEGORY_LABEL: Record<string, string> = { SALES: "Sales", RETENTION: "Retention", SERVICE: "Service" };
const OUTCOME_LABEL: Record<string, string> = { NOT_BOOKED: "Not booked", LOST: "Lost", UNRESOLVED: "Unresolved" };

const OVERVIEW_STALE_MS = 30_000;

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const dateWithYearFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

type Pipeline = OverviewData["pipeline"];

function useOverview() {
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
    return { range, query };
}

export function OverviewPeriod() {
    const { query } = useOverview();
    const overview = query.data?.overview;
    if (!overview || query.data?.pipeline.total === 0) return <p className="h-6" />;

    const start = new Date(overview.periodStart);
    const today = new Date();
    const startLabel = (start.getUTCFullYear() === today.getUTCFullYear() ? dateFormat : dateWithYearFormat).format(start);
    const notScorable = overview.outcomes.NOT_SCORABLE;
    return (
        <p className="text-md text-tertiary">
            {startLabel} – {dateFormat.format(today)} · {overview.calls.toLocaleString()} call{overview.calls === 1 ? "" : "s"} analyzed
            {notScorable > 0 && <span title="Voicemails, wrong numbers and other calls with nothing to score">, {notScorable} not scorable</span>}
        </p>
    );
}

export function OverviewContent() {
    const { range, query } = useOverview();

    if (!query.data) return query.isError ? <p className="text-sm text-error-primary">{query.error.message}</p> : <OverviewSkeleton />;

    const { overview, pipeline } = query.data;
    if (pipeline.total === 0) return <NoCallsYet />;

    const periodLabel = RANGES[range].label.toLowerCase();
    const empty = range === "all" ? "No analyzed calls yet." : `No analyzed calls in the last ${periodLabel}.`;

    return (
        <div
            aria-busy={query.isPlaceholderData}
            className={cx("flex flex-col gap-6 transition-opacity", query.isPlaceholderData && "pointer-events-none opacity-60")}
        >
            <AttentionStrip pipeline={pipeline} />
            <KpiStrip overview={overview} range={range} />
            <MissedCard overview={overview} />
            <RepTable overview={overview} empty={empty} />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <CoachingCard overview={overview} className="xl:col-span-2" />
                <PolicyCard overview={overview} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <TrendChart className="xl:col-span-2" trend={overview.trend} granularity={overview.granularity} />
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
                <h2 className="text-lg font-semibold text-primary">No calls analyzed yet</h2>
                <p className="text-sm text-tertiary">Upload call recordings to see quality scores, booking and save rates, and rep performance here.</p>
            </div>
            <Button href="/calls" size="md" iconTrailing={<ArrowRight data-icon />}>
                Go to Calls
            </Button>
        </section>
    );
}

/** Only shows when something needs the admin: failures, a stalled queue, reps to confirm, or no rubric to score against. */
function AttentionStrip({ pipeline }: { pipeline: Pipeline }) {
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const items = [
        !pipeline.hasActiveRubric && {
            icon: ClipboardCheck,
            text: "No active rubric, so new calls won't be scored",
            tone: "warning",
        },
        pipeline.failed > 0 && {
            icon: AlertTriangle,
            text: `${plural(pipeline.failed, "call", "calls")} failed processing`,
            tone: "error",
        },
        pipeline.processing > 0 && {
            icon: Clock,
            text: `${plural(pipeline.processing, "call is", "calls are")} queued. Processing runs while the Calls page is open`,
            tone: "brand",
        },
        pipeline.spokenNames > 0 && {
            icon: Users01,
            text: `${plural(pipeline.spokenNames, "call needs its", "calls need their")} rep confirmed`,
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
                Open Calls
            </Button>
        </section>
    );
}

function KpiStrip({ overview, range }: { overview: Overview; range: RangeKey }) {
    const periodLabel = RANGES[range].label.toLowerCase();
    const hasPrevious = range !== "all";
    const { SALES, RETENTION, SERVICE } = overview.outcomes;
    const { GOLD, GREEN, BELOW } = overview.tiers;
    const greenOrBetter = overview.scored ? Math.round(((GOLD + GREEN) / overview.scored) * 100) : null;

    const rateTile = (label: string, o: (typeof overview.outcomes)["SALES"], what: string, verb: string) => (
        <StatTile
            label={label}
            value={formatPercent(o.rate)}
            detail={o.total ? `${o.wins} of ${o.total} ${what}${o.total === 1 ? "" : "s"} ${verb}` : `No ${what}s`}
            delta={hasPrevious && <Delta current={o.rate} previous={o.previousRate} unit="points" goodWhen="up" periodLabel={periodLabel} samples={[o.total, o.previousTotal]} />}
        />
    );

    return (
        <section aria-label="Key metrics" className={KPI_STRIP}>
            <StatTile
                label="Quality score"
                value={formatPercent(overview.avgScore)}
                detail={greenOrBetter === null ? "No scored calls" : `${greenOrBetter}% of scored calls at Green or better`}
                delta={
                    hasPrevious && (
                        <Delta
                            current={overview.avgScore}
                            previous={overview.previousAvgScore}
                            unit="points"
                            goodWhen="up"
                            periodLabel={periodLabel}
                            samples={[overview.scored, overview.previousScored]}
                        />
                    )
                }
            >
                {overview.scored > 0 && (
                    <div className="flex flex-col gap-1.5 pt-1">
                        <TierBar tiers={{ ...overview.tiers, unscored: 0 }} />
                        <p className="text-xs text-tertiary tabular-nums">
                            {GOLD} Gold, {GREEN} Green, {BELOW} Below
                        </p>
                    </div>
                )}
            </StatTile>
            {rateTile("Booking rate", SALES, "sales call", "booked")}
            {rateTile("Save rate", RETENTION, "cancellation", "saved")}
            {rateTile("Resolution rate", SERVICE, "service call", "resolved")}
            <StatTile
                className={KPI_LAST}
                label="Calls with policy flags"
                value={overview.flags.calls.toLocaleString()}
                detail={
                    overview.flags.calls
                        ? `${overview.flags.violations} flag${overview.flags.violations === 1 ? "" : "s"} in total`
                        : "No company rules broken"
                }
                delta={
                    hasPrevious && <Delta current={overview.flags.calls} previous={overview.flags.previousCalls} unit="count" goodWhen="down" periodLabel={periodLabel} />
                }
            />
        </section>
    );
}

/** Who the call was with: the customer's name when it was said, otherwise what they called about. */
function callHeadline(call: OverviewCall) {
    if (call.details?.customerName) return { text: call.details.customerName, named: true };
    const about = [call.details?.pestType, call.details?.serviceRequested].filter(Boolean).join(", ");
    return { text: about || "Unnamed caller", named: false };
}

function MissedCard({ overview }: { overview: Overview }) {
    const { total, quoted, quotedCalls, calls } = overview.missed;
    return (
        <Card
            flush
            title="Missed opportunities"
            description={total ? `${total} call${total === 1 ? "" : "s"} that didn't book, save or resolve. Newest first.` : undefined}
            action={
                quoted > 0 && (
                    <div className="text-right" title="The first amount quoted on each call; recurring prices count once">
                        <p className="text-display-xs font-semibold text-primary tabular-nums">{formatMoney(quoted)}</p>
                        <p className="text-xs text-tertiary">
                            quoted on {quotedCalls} of {total} call{total === 1 ? "" : "s"}
                        </p>
                    </div>
                )
            }
        >
            {calls.length === 0 ? (
                <EmptyNote className="mx-6 mb-6">No missed opportunities in this period.</EmptyNote>
            ) : (
                <div>
                    <div className="hidden grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,10rem)] gap-6 border-y border-secondary bg-secondary px-6 py-2.5 text-xs font-medium text-tertiary md:grid">
                        <span>Customer</span>
                        <span>What happened</span>
                        <span className="text-right">Quoted</span>
                    </div>
                    <ul className="divide-y divide-secondary border-t border-secondary md:border-t-0">
                        {calls.map((call) => {
                            const headline = callHeadline(call);
                            return (
                                <li key={call.id}>
                                    <Link
                                        href={`/calls?call=${call.id}`}
                                        title={call.originalName}
                                        className="group grid gap-x-6 gap-y-2 px-6 py-4 outline-focus-ring -outline-offset-2 hover:bg-primary_hover focus-visible:outline-2 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,10rem)]"
                                    >
                                        <div className="flex min-w-0 flex-col gap-0.5">
                                            <span
                                                className={cx(
                                                    "line-clamp-2 text-sm font-medium group-hover:underline first-letter:uppercase",
                                                    headline.named ? "text-primary" : "text-secondary",
                                                )}
                                            >
                                                {headline.text}
                                            </span>
                                            <span className="text-xs text-tertiary">
                                                {[call.rep ?? call.unmatchedRepName ?? "No rep", dateFormat.format(call.date)].join(", ")}
                                            </span>
                                        </div>
                                        <div className="flex min-w-0 flex-col gap-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Badge tone="error">{OUTCOME_LABEL[call.outcome ?? ""]}</Badge>
                                                {call.category && <span className="text-xs text-tertiary">{CATEGORY_LABEL[call.category]}</span>}
                                            </div>
                                            {call.outcomeReason && <p className="line-clamp-2 text-sm text-secondary">{call.outcomeReason}</p>}
                                            {call.details?.followUp && (
                                                <p className="line-clamp-1 text-xs text-tertiary">
                                                    <span className="font-medium">Follow-up:</span> {call.details.followUp}
                                                </p>
                                            )}
                                        </div>
                                        <Quote priceQuoted={call.details?.priceQuoted} />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                    {total > calls.length && (
                        <p className="border-t border-secondary px-6 py-3 text-xs text-tertiary">
                            Showing the {calls.length} most recent of {total}.
                        </p>
                    )}
                </div>
            )}
        </Card>
    );
}

/** The amount the customer heard first, with the full quote underneath since it often has plans and discounts. */
function Quote({ priceQuoted }: { priceQuoted: string | null | undefined }) {
    if (!priceQuoted) return <p className="text-sm text-quaternary md:text-right">–</p>;
    const amount = firstAmount(priceQuoted);
    return (
        <div className="flex flex-col gap-0.5 md:items-end md:text-right">
            {amount !== null && <p className="text-sm font-semibold text-primary tabular-nums">{formatMoney(amount)}</p>}
            <p className="line-clamp-2 text-xs text-tertiary" title={priceQuoted}>
                {priceQuoted}
            </p>
        </div>
    );
}

function RateCell({ rate }: { rate: Rate }) {
    if (!rate.total) return <span className="text-quaternary">–</span>;
    return (
        <>
            <span className="font-medium text-primary">{formatPercent(rate.rate)}</span>
            <span className="text-tertiary">
                {" "}
                {rate.wins}/{rate.total}
            </span>
        </>
    );
}

const repHref = (rep: RepSummary) =>
    rep.kind === "unassigned" ? null : `/calls?${new URLSearchParams({ [rep.kind === "rep" ? "rep" : "spoken"]: rep.name })}`;

function RepTable({ overview, empty }: { overview: Overview; empty: string }) {
    return (
        <Card flush title="Rep performance">
            {overview.reps.length === 0 ? (
                <EmptyNote className="mx-6 mb-6">{empty}</EmptyNote>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left text-sm">
                        <thead className="border-y border-secondary bg-secondary text-xs text-tertiary">
                            <tr>
                                <th scope="col" className="px-6 py-2.5 font-medium">Rep</th>
                                <th scope="col" className="px-4 py-2.5 text-right font-medium">Calls</th>
                                <th scope="col" className="px-4 py-2.5 text-right font-medium">Avg. score</th>
                                <th scope="col" className="px-4 py-2.5 font-medium">Tiers</th>
                                <th scope="col" className="px-4 py-2.5 font-medium">Booked</th>
                                <th scope="col" className="px-4 py-2.5 font-medium">Saved</th>
                                <th scope="col" className="px-4 py-2.5 text-right font-medium">Flags</th>
                                <th scope="col" className="px-6 py-2.5 font-medium">Misses most</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-secondary">
                            {overview.reps.map((rep) => {
                                const href = repHref(rep);
                                return (
                                    <tr key={`${rep.kind}:${rep.name}`} className="hover:bg-primary_hover">
                                        <th scope="row" className="px-6 py-3.5 font-medium">
                                            <span className="flex items-center gap-2">
                                                {href ? (
                                                    <Link href={href} className="text-primary outline-focus-ring hover:underline focus-visible:outline-2">
                                                        {rep.name}
                                                    </Link>
                                                ) : (
                                                    <span className="text-tertiary">{rep.name}</span>
                                                )}
                                                {rep.kind === "spoken" && (
                                                    <Badge tone="warning" title="Heard on the call, not confirmed as one of your reps">
                                                        Unconfirmed
                                                    </Badge>
                                                )}
                                            </span>
                                        </th>
                                        <td className="px-4 py-3.5 text-right text-secondary tabular-nums">{rep.calls}</td>
                                        <td className="px-4 py-3.5 text-right font-medium text-primary tabular-nums">{formatPercent(rep.avgScore)}</td>
                                        <td className="px-4 py-3.5">
                                            <TierBar tiers={rep.tiers} className="w-24" />
                                        </td>
                                        <td className="px-4 py-3.5 tabular-nums">
                                            <RateCell rate={rep.booking} />
                                        </td>
                                        <td className="px-4 py-3.5 tabular-nums">
                                            <RateCell rate={rep.saves} />
                                        </td>
                                        <td className={cx("px-4 py-3.5 text-right tabular-nums", rep.flags ? "font-medium text-warning-primary" : "text-quaternary")}>
                                            {rep.flags || "–"}
                                        </td>
                                        <td className="max-w-64 px-6 py-3.5 text-secondary">
                                            <span className="line-clamp-1 first-letter:uppercase" title={rep.topMiss ?? undefined}>
                                                {rep.topMiss ?? <span className="text-quaternary">–</span>}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

function CoachingCard({ overview, className }: { overview: Overview; className?: string }) {
    return (
        <Card title="Coaching focus" description="The rubric items reps miss most" className={className}>
            {overview.coaching.length === 0 ? (
                <EmptyNote>No missed rubric items in this period.</EmptyNote>
            ) : (
                <ol className="flex flex-col divide-y divide-secondary">
                    {overview.coaching.map((c) => (
                        <li key={c.key} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:gap-6">
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <p className="text-sm font-medium text-primary first-letter:uppercase">{c.label}</p>
                                {c.reps.length > 0 && (
                                    <p className="text-xs text-tertiary">
                                        Mostly {c.reps.slice(0, 3).join(", ")}
                                        {c.reps.length > 3 && ` and ${c.reps.length - 3} more`}
                                    </p>
                                )}
                            </div>
                            <p className="shrink-0 text-sm text-secondary tabular-nums sm:text-right">
                                Missed on <span className="font-medium text-primary">{c.fails}</span> of {c.assessed}
                                {c.category && <span className="text-tertiary"> {CATEGORY_LABEL[c.category].toLowerCase()} calls</span>}
                            </p>
                        </li>
                    ))}
                </ol>
            )}
        </Card>
    );
}

function PolicyCard({ overview }: { overview: Overview }) {
    return (
        <Card title="Policy flags">
            {overview.policies.length === 0 ? (
                <EmptyNote>No company rules broken in this period.</EmptyNote>
            ) : (
                <ul className="flex flex-col divide-y divide-secondary">
                    {overview.policies.slice(0, 5).map((p) => (
                        <li key={p.rule} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                            <p className="line-clamp-2 text-sm text-secondary" title={p.rule}>
                                {p.rule}
                            </p>
                            <span className="shrink-0 text-sm font-medium whitespace-nowrap text-warning-primary tabular-nums">
                                {p.calls} call{p.calls === 1 ? "" : "s"}
                            </span>
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
        <Card title="Pests mentioned">
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
