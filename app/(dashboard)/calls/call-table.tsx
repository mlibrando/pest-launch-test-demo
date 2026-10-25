"use client";

import { useState } from "react";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { formatSeconds } from "@/lib/calls";
import { CallDetailPanel } from "./call-detail-panel";
import { CallQueuePoller } from "./call-queue-poller";
import { DeleteCallButton, RetryButton, StatusBadge, type CallRow } from "./call-status";
import { UploadCallsEmptyState } from "./upload-calls";

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function timeAgo(date: Date) {
    const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
    if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute");
    if (Math.abs(minutes) < 60 * 24) return relativeTime.format(Math.round(minutes / 60), "hour");
    return relativeTime.format(Math.round(minutes / (60 * 24)), "day");
}

export function CallTable({ calls }: { calls: CallRow[] }) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selected = calls.find((c) => c.id === selectedId);

    const queue = calls.filter((c) => c.status === "UPLOADED").reverse();
    const inProgress = queue.length + calls.filter((c) => c.status === "TRANSCRIBING").length;

    return (
        <section className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            <CallQueuePoller isActive={inProgress > 0} />
            {inProgress > 0 && (
                <p className="flex items-center gap-2 border-b border-secondary bg-brand-primary px-6 py-3 text-sm text-brand-secondary">
                    <LoadingIndicator />
                    {inProgress} call{inProgress === 1 ? "" : "s"} transcribing or queued · keep this page open so transcription continues
                </p>
            )}

            {calls.length === 0 ? (
                <UploadCallsEmptyState />
            ) : (
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-secondary text-xs text-tertiary">
                        <tr>
                            <th className="px-6 py-3 font-medium">Recording</th>
                            <th className="px-6 py-3 font-medium">Status</th>
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
                                    {call.status === "FAILED" && <p className="text-xs text-error-primary">{call.errorDetail}</p>}
                                </td>
                                <td className="px-6 py-4">
                                    <StatusBadge
                                        status={call.status}
                                        queuePosition={call.status === "UPLOADED" ? queue.indexOf(call) + 1 : undefined}
                                    />
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

            {selected && <CallDetailPanel key={selected.id} call={selected} onClose={() => setSelectedId(null)} />}
        </section>
    );
}
