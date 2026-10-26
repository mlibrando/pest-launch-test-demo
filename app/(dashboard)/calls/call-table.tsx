"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronRight, PhoneIncoming01, PhoneOutgoing01 } from "@untitledui/icons";
import { useMutationState, useQuery } from "@tanstack/react-query";
import { syncCalls } from "@/app/actions/calls";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Select } from "@/components/base/select/select";
import { ANALYSIS_FAILED_MESSAGE, CALLS_QUERY_KEY, formatSeconds } from "@/lib/calls";
import { RANGES, rangeBounds, type RangeKey } from "@/lib/overview";
import { cx } from "@/utils/cx";
import { CallDetailPanel } from "./call-detail-panel";
import { CallTableHead, CallTableSkeleton, type Sort, type SortKey } from "./call-table-skeleton";
import { DELETE_CALL_KEY, DeleteCallButton, OutcomeBadge, RetryButton, StatusBadge, TierBadge, type CallRow } from "./call-status";
import { UploadCallsEmptyState } from "./upload-calls";

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function timeAgo(date: Date) {
    const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
    if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute");
    if (Math.abs(minutes) < 60 * 24) return relativeTime.format(Math.round(minutes / 60), "hour");
    return relativeTime.format(Math.round(minutes / (60 * 24)), "day");
}

const POLL_INTERVAL_MS = 5000;

// TRANSCRIBED calls only move on once there's a rubric to analyze them against.
const isInProgress = (call: CallRow, hasActiveRubric: boolean) =>
    call.status === "UPLOADED" || call.status === "TRANSCRIBING" || call.status === "ANALYZING" || (hasActiveRubric && call.status === "TRANSCRIBED");

// UNKNOWN shows as a blank, like a call that hasn't been analyzed yet.
const DIRECTIONS: Record<string, { label: string; Icon: typeof PhoneIncoming01 }> = {
    INBOUND: { label: "Inbound", Icon: PhoneIncoming01 },
    OUTBOUND: { label: "Outbound", Icon: PhoneOutgoing01 },
};

function Direction({ direction }: { direction: string | null }) {
    const known = direction ? DIRECTIONS[direction] : undefined;
    if (!known) return "–";
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <known.Icon aria-hidden className="size-4 text-fg-quaternary" />
            {known.label}
        </span>
    );
}

const SORT_VALUE: Record<SortKey, (call: CallRow) => string | number | null> = {
    name: (c) => c.originalName,
    rep: (c) => c.rep?.name ?? c.repName,
    direction: (c) => DIRECTIONS[c.direction ?? ""]?.label ?? null,
    outcome: (c) => c.outcome,
    score: (c) => c.score,
    duration: (c) => c.durationSec,
    uploaded: (c) => c.createdAt.getTime(),
};

// Blanks sort last either way, so flipping the direction never buries the calls that have a value.
function compareCalls({ key, desc }: Sort) {
    return (a: CallRow, b: CallRow) => {
        const x = SORT_VALUE[key](a);
        const y = SORT_VALUE[key](b);
        if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
        const order = typeof x === "string" ? x.localeCompare(String(y), undefined, { numeric: true }) : x - Number(y);
        return desc ? -order : order;
    };
}

type RepFilter = { name: string; confirmed: boolean };

const filterHref = (filter: RepFilter | null) =>
    filter ? `/calls?${new URLSearchParams({ [filter.confirmed ? "rep" : "spoken"]: filter.name })}` : "/calls";

const matchesRep = (call: CallRow, filter: RepFilter) =>
    filter.confirmed ? call.rep?.name === filter.name : !call.rep && call.repName === filter.name;

export function CallTable() {
    const params = useSearchParams();
    // `?call=<id>` opens that call's panel, so other pages (like the Overview) can link straight to a call.
    const linkedId = params.get("call");
    const [selectedId, setSelectedId] = useState<string | null>(linkedId);
    // `?rep=<name>` shows one rep's calls; `?spoken=<name>` a name heard on calls that isn't matched to a rep yet.
    const [repFilter, setRepFilter] = useState<RepFilter | null>(() => {
        const rep = params.get("rep");
        const spoken = params.get("spoken");
        return rep ? { name: rep, confirmed: true } : spoken ? { name: spoken, confirmed: false } : null;
    });
    const [range, setRange] = useState<RangeKey>("all");
    const [sort, setSort] = useState<Sort>({ key: "uploaded", desc: true });
    const toggleSort = (key: SortKey) => setSort((s) => ({ key, desc: s.key === key && !s.desc }));
    const closePanel = () => {
        setSelectedId(null);
        // Drop the link so a refresh doesn't reopen the panel.
        if (linkedId) window.history.replaceState(null, "", filterHref(repFilter));
    };
    const selectRep = (filter: RepFilter | null) => {
        setRepFilter(filter);
        window.history.replaceState(null, "", filterHref(filter));
    };
    // Each fetch also advances the queue, so polling while calls are in progress is what keeps them processing.
    const query = useQuery({
        queryKey: CALLS_QUERY_KEY,
        queryFn: () => syncCalls(),
        refetchInterval: ({ state: { data } }) => (data?.calls.some((c) => isInProgress(c, data.hasActiveRubric)) ? POLL_INTERVAL_MS : false),
        // Processing only advances while this polls, so it shouldn't stall when the user switches tabs.
        refetchIntervalInBackground: true,
    });
    const deletingIds = useMutationState({
        filters: { mutationKey: DELETE_CALL_KEY, status: "pending" },
        select: (mutation) => mutation.state.variables as string,
    });

    if (!query.data) {
        return query.isError ? <p className="text-sm text-error-primary">{query.error.message}</p> : <CallTableSkeleton />;
    }

    const { calls: allCalls, repNames, hasActiveRubric } = query.data;
    const bounds = rangeBounds(range, new Date());
    const calls = allCalls
        .filter((c) => (!repFilter || matchesRep(c, repFilter)) && (!bounds || c.createdAt >= bounds.start))
        .sort(compareCalls(sort));
    // A spoken-name filter only arrives by link, so it's offered only while it's active.
    const repOptions: RepFilter[] = repNames.map((name) => ({ name, confirmed: true }));
    if (repFilter && !repFilter.confirmed) repOptions.push(repFilter);
    const selected = allCalls.find((c) => c.id === selectedId);
    const queue = allCalls.filter((c) => c.status === "UPLOADED").reverse();
    const inProgress = allCalls.filter((c) => isInProgress(c, hasActiveRubric)).length;

    return (
        <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            {inProgress > 0 && (
                <p className="flex items-center gap-2 border-b border-secondary bg-brand-primary px-6 py-3 text-sm text-brand-secondary">
                    <LoadingIndicator />
                    {inProgress} call{inProgress === 1 ? "" : "s"} in progress · keep this page open so processing continues
                </p>
            )}

            {allCalls.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 border-b border-secondary px-6 py-3">
                    <Select
                        aria-label="Rep"
                        size="sm"
                        className="w-48"
                        value={filterHref(repFilter)}
                        onChange={(key) => selectRep(repOptions.find((o) => filterHref(o) === key) ?? null)}
                    >
                        <Select.Item id={filterHref(null)} label="All reps" />
                        {repOptions.map((o) => (
                            <Select.Item key={filterHref(o)} id={filterHref(o)} label={o.confirmed ? o.name : `${o.name} (not matched)`} />
                        ))}
                    </Select>
                    <Select aria-label="Period" size="sm" className="w-40" value={range} onChange={(key) => setRange(key as RangeKey)}>
                        {(Object.keys(RANGES) as RangeKey[]).map((key) => (
                            <Select.Item key={key} id={key} label={key === "all" ? "All time" : `Last ${RANGES[key].label}`} />
                        ))}
                    </Select>
                    <p className="ml-auto text-sm text-tertiary">
                        {calls.length} call{calls.length === 1 ? "" : "s"}
                    </p>
                </div>
            )}

            {allCalls.length === 0 ? (
                <UploadCallsEmptyState />
            ) : (
                <table className="w-full text-left text-sm">
                    <CallTableHead sort={sort} onSort={toggleSort} />
                    <tbody className="divide-y divide-secondary">
                        {calls.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-6 py-10 text-center text-tertiary">
                                    No calls match these filters.
                                </td>
                            </tr>
                        )}
                        {calls.map((call) => {
                            const isDeleting = deletingIds.includes(call.id);
                            return (
                                <tr
                                    key={call.id}
                                    onClick={() => setSelectedId(call.id)}
                                    className={cx(
                                        "group cursor-pointer transition-opacity hover:bg-primary_hover",
                                        isDeleting && "pointer-events-none opacity-50",
                                    )}
                                >
                                    <td className="px-6 py-4">
                                        <button type="button" className="text-left font-medium text-primary outline-none focus-visible:underline">
                                            {call.originalName}
                                        </button>
                                        {call.status === "FAILED" && (
                                            <p className="text-xs text-error-primary">
                                                {call.failedStage === "analyze" ? ANALYSIS_FAILED_MESSAGE : call.errorDetail}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-secondary">
                                        {call.rep?.name ??
                                            (call.repName ? (
                                                <span className="text-warning-primary" title="Not one of your reps yet">
                                                    {call.repName}?
                                                </span>
                                            ) : (
                                                "–"
                                            ))}
                                    </td>
                                    <td className="px-6 py-4 text-tertiary">
                                        <Direction direction={call.direction} />
                                    </td>
                                    <td className="px-6 py-4 text-tertiary">{call.outcome ? <OutcomeBadge outcome={call.outcome} /> : "–"}</td>
                                    <td className="px-6 py-4 text-tertiary">
                                        {call.status !== "DONE" ? (
                                            <StatusBadge
                                                status={call.status}
                                                queuePosition={call.status === "UPLOADED" ? queue.indexOf(call) + 1 : undefined}
                                                attempt={call.analysisProgress?.attempt}
                                            />
                                        ) : call.score !== null ? (
                                            <span
                                                className="flex items-center gap-2 whitespace-nowrap"
                                                title={`${call.points}/${call.maxPoints} criteria passed`}
                                            >
                                                <span className="w-10 font-medium text-primary tabular-nums">{Math.round(call.score)}%</span>
                                                {call.tier && <TierBadge tier={call.tier} />}
                                            </span>
                                        ) : (
                                            "–"
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-tertiary tabular-nums">
                                        {call.durationSec ? formatSeconds(call.durationSec) : "–"}
                                    </td>
                                    <td className="px-6 py-4 text-tertiary" title={call.createdAt.toLocaleString()} suppressHydrationWarning>
                                        {timeAgo(call.createdAt)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-2">
                                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                {call.status === "FAILED" && <RetryButton callId={call.id} />}
                                                {/* Still reachable from the call's panel on touch screens, where there's no hover. */}
                                                <div className={cx(!isDeleting && "opacity-0 transition group-hover:opacity-100 focus-within:opacity-100")}>
                                                    <DeleteCallButton call={call} iconOnly />
                                                </div>
                                            </div>
                                            <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-quaternary" />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}

            {selected && (
                <CallDetailPanel
                    key={selected.id}
                    call={selected}
                    repNames={repNames}
                    hasActiveRubric={hasActiveRubric}
                    onClose={closePanel}
                />
            )}
        </section>
    );
}
