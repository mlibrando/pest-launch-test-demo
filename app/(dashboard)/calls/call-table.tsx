"use client";

import { useState } from "react";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { ANALYSIS_FAILED_MESSAGE, formatSeconds } from "@/lib/calls";
import { CallDetailPanel } from "./call-detail-panel";
import { CallQueuePoller } from "./call-queue-poller";
import { DeleteCallButton, RetryButton, StatusBadge, TierBadge, type CallRow } from "./call-status";
import { UploadCallsEmptyState } from "./upload-calls";

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function timeAgo(date: Date) {
    const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
    if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute");
    if (Math.abs(minutes) < 60 * 24) return relativeTime.format(Math.round(minutes / 60), "hour");
    return relativeTime.format(Math.round(minutes / (60 * 24)), "day");
}

interface CallTableProps {
    calls: CallRow[];
    repNames: string[];
    hasActiveRubric: boolean;
}

export function CallTable({ calls, repNames, hasActiveRubric }: CallTableProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selected = calls.find((c) => c.id === selectedId);

    const queue = calls.filter((c) => c.status === "UPLOADED").reverse();
    // TRANSCRIBED calls only move on once there's a rubric to analyze them against.
    const inProgress =
        queue.length +
        calls.filter((c) => c.status === "TRANSCRIBING" || c.status === "ANALYZING" || (hasActiveRubric && c.status === "TRANSCRIBED")).length;

    return (
        <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            <CallQueuePoller isActive={inProgress > 0} />
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
