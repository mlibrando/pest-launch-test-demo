"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { syncCalls } from "@/app/actions/calls";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { ANALYSIS_FAILED_MESSAGE, CALLS_QUERY_KEY, formatSeconds } from "@/lib/calls";
import { CallDetailPanel } from "./call-detail-panel";
import { CallTableHead, CallTableSkeleton } from "./call-table-skeleton";
import { DeleteCallButton, RetryButton, StatusBadge, TierBadge, type CallRow } from "./call-status";
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
    const closePanel = () => {
        setSelectedId(null);
        // Drop the link so a refresh doesn't reopen the panel.
        if (linkedId) window.history.replaceState(null, "", filterHref(repFilter));
    };
    const clearFilter = () => {
        setRepFilter(null);
        window.history.replaceState(null, "", "/calls");
    };
    // Each fetch also advances the queue, so polling while calls are in progress is what keeps them processing.
    const query = useQuery({
        queryKey: CALLS_QUERY_KEY,
        queryFn: () => syncCalls(),
        refetchInterval: ({ state: { data } }) => (data?.calls.some((c) => isInProgress(c, data.hasActiveRubric)) ? POLL_INTERVAL_MS : false),
        // Processing only advances while this polls, so it shouldn't stall when the user switches tabs.
        refetchIntervalInBackground: true,
    });

    if (!query.data) {
        return query.isError ? <p className="text-sm text-error-primary">{query.error.message}</p> : <CallTableSkeleton />;
    }

    const { calls: allCalls, repNames, hasActiveRubric } = query.data;
    const calls = repFilter ? allCalls.filter((c) => matchesRep(c, repFilter)) : allCalls;
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

            {repFilter && (
                <p className="flex items-center justify-between gap-4 border-b border-secondary px-6 py-3 text-sm text-secondary">
                    <span>
                        {calls.length} call{calls.length === 1 ? "" : "s"} by <span className="font-medium text-primary">{repFilter.name}</span>
                        {!repFilter.confirmed && " (not matched to a rep yet)"}
                    </span>
                    <button type="button" onClick={clearFilter} className="font-semibold text-tertiary outline-focus-ring hover:text-secondary focus-visible:outline-2">
                        Show all calls
                    </button>
                </p>
            )}

            {allCalls.length === 0 ? (
                <UploadCallsEmptyState />
            ) : (
                <table className="w-full text-left text-sm">
                    <CallTableHead />
                    <tbody className="divide-y divide-secondary">
                        {calls.map((call) => (
                            <tr key={call.id} onClick={() => setSelectedId(call.id)} className="cursor-pointer hover:bg-primary_hover">
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
                                <td className="px-6 py-4">
                                    <StatusBadge
                                        status={call.status}
                                        queuePosition={call.status === "UPLOADED" ? queue.indexOf(call) + 1 : undefined}
                                        attempt={call.analysisProgress?.attempt}
                                    />
                                </td>
                                <td className="px-6 py-4 text-secondary">
                                    {call.status === "DONE" && call.maxPoints ? (
                                        <span className="flex items-center gap-2 whitespace-nowrap">
                                            {call.points}/{call.maxPoints}
                                            {call.tier && <TierBadge tier={call.tier} />}
                                        </span>
                                    ) : (
                                        "–"
                                    )}
                                </td>
                                <td className="px-6 py-4 text-tertiary">{call.durationSec ? formatSeconds(call.durationSec) : "–"}</td>
                                <td className="px-6 py-4 text-tertiary" title={call.createdAt.toLocaleString()} suppressHydrationWarning>
                                    {timeAgo(call.createdAt)}
                                </td>
                                <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-2">
                                        {call.status === "FAILED" && <RetryButton callId={call.id} />}
                                        <DeleteCallButton call={call} iconOnly />
                                    </div>
                                </td>
                            </tr>
                        ))}
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
