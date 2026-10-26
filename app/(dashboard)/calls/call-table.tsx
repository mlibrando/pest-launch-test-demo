"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { syncCalls } from "@/app/actions/calls";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { ANALYSIS_FAILED_MESSAGE, CALLS_QUERY_KEY, formatSeconds } from "@/lib/calls";
import { CallDetailPanel } from "./call-detail-panel";
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

export function CallTable() {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Each fetch also advances the queue, so polling while calls are in progress is what keeps them processing.
    const query = useQuery({
        queryKey: CALLS_QUERY_KEY,
        queryFn: () => syncCalls(),
        refetchInterval: ({ state: { data } }) => (data?.calls.some((c) => isInProgress(c, data.hasActiveRubric)) ? POLL_INTERVAL_MS : false),
        // Processing only advances while this polls, so it shouldn't stall when the user switches tabs.
        refetchIntervalInBackground: true,
    });

    if (!query.data) {
        return query.isError ? (
            <p className="text-sm text-error-primary">{query.error.message}</p>
        ) : (
            <LoadingIndicator label="Loading calls…" className="text-sm text-tertiary" />
        );
    }

    const { calls, repNames, hasActiveRubric } = query.data;
    const selected = calls.find((c) => c.id === selectedId);
    const queue = calls.filter((c) => c.status === "UPLOADED").reverse();
    const inProgress = calls.filter((c) => isInProgress(c, hasActiveRubric)).length;

    return (
        <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            {inProgress > 0 && (
                <p className="flex items-center gap-2 border-b border-secondary bg-brand-primary px-6 py-3 text-sm text-brand-secondary">
                    <LoadingIndicator />
                    {inProgress} call{inProgress === 1 ? "" : "s"} in progress · keep this page open so processing continues
                </p>
            )}

            {calls.length === 0 ? (
                <UploadCallsEmptyState />
            ) : (
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-secondary text-xs text-tertiary">
                        <tr>
                            <th className="px-6 py-3 font-medium">Recording</th>
                            <th className="px-6 py-3 font-medium">Rep</th>
                            <th className="px-6 py-3 font-medium">Status</th>
                            <th className="px-6 py-3 font-medium">Score</th>
                            <th className="px-6 py-3 font-medium">Duration</th>
                            <th className="px-6 py-3 font-medium">Uploaded</th>
                            <th className="px-6 py-3" />
                        </tr>
                    </thead>
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
                    onClose={() => setSelectedId(null)}
                />
            )}
        </section>
    );
}
