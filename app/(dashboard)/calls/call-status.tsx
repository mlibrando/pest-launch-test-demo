"use client";

import { useState, useTransition } from "react";
import { RefreshCcw01, Trash01 } from "@untitledui/icons";
import { useQueryClient } from "@tanstack/react-query";
import { deleteCall, reanalyzeCall, retryCall } from "@/app/actions/calls";
import { ConfirmDialog } from "@/components/application/confirm-dialog/confirm-dialog";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Button } from "@/components/base/buttons/button";
import type { CallStatus } from "@/generated/prisma/client";
import { CALLS_QUERY_KEY, MAX_ATTEMPTS, type AnalysisProgress, type Tier } from "@/lib/calls";
import { cx } from "@/utils/cx";

export type CallRow = {
    id: string;
    originalName: string;
    status: CallStatus;
    durationSec: number | null;
    errorDetail: string | null;
    failedStage: string | null;
    createdAt: Date;
    repName: string | null;
    rep: { name: string } | null;
    scorecard: string | null;
    points: number | null;
    maxPoints: number | null;
    tier: Tier | null;
    analysisProgress: AnalysisProgress | null;
};

export const BADGE_CLASS = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const STATUS: Record<CallStatus, { label: string; className: string }> = {
    UPLOADED: { label: "Queued", className: "bg-secondary text-tertiary" },
    TRANSCRIBING: { label: "Transcribing", className: "bg-brand-secondary text-brand-secondary" },
    TRANSCRIBED: { label: "Transcribed", className: "bg-success-secondary text-success-primary" },
    ANALYZING: { label: "Analyzing", className: "bg-brand-secondary text-brand-secondary" },
    DONE: { label: "Done", className: "bg-success-secondary text-success-primary" },
    FAILED: { label: "Failed", className: "bg-error-secondary text-error-primary" },
};

interface StatusBadgeProps {
    status: CallStatus;
    queuePosition?: number;
    attempt?: number;
}

export function StatusBadge({ status, queuePosition, attempt }: StatusBadgeProps) {
    const isWorking = status === "TRANSCRIBING" || status === "ANALYZING";
    return (
        <span className={cx(BADGE_CLASS, STATUS[status].className)}>
            {isWorking && <LoadingIndicator size="xs" />}
            {STATUS[status].label}
            {queuePosition && ` · #${queuePosition}`}
            {status === "ANALYZING" && (attempt ?? 1) > 1 && ` · attempt ${attempt}/${MAX_ATTEMPTS}`}
        </span>
    );
}

const TIER: Record<Tier, { label: string; className: string }> = {
    GOLD: { label: "Gold", className: "bg-warning-secondary text-warning-primary" },
    GREEN: { label: "Green", className: "bg-success-secondary text-success-primary" },
    BELOW: { label: "Below", className: "bg-error-secondary text-error-primary" },
};

export function TierBadge({ tier }: { tier: Tier }) {
    return <span className={cx(BADGE_CLASS, TIER[tier].className)}>{TIER[tier].label}</span>;
}

export function RetryButton({ callId }: { callId: string }) {
    const queryClient = useQueryClient();
    const [pending, startTransition] = useTransition();
    return (
        <Button
            size="sm"
            color="secondary"
            iconLeading={<RefreshCcw01 data-icon />}
            isLoading={pending}
            onClick={() =>
                startTransition(async () => {
                    await retryCall(callId);
                    await queryClient.invalidateQueries({ queryKey: CALLS_QUERY_KEY });
                })
            }
        >
            Retry
        </Button>
    );
}

export function ReanalyzeButton({ callId }: { callId: string }) {
    const queryClient = useQueryClient();
    const [pending, startTransition] = useTransition();
    return (
        <Button
            size="sm"
            color="secondary"
            iconLeading={<RefreshCcw01 data-icon />}
            isLoading={pending}
            onClick={() =>
                startTransition(async () => {
                    await reanalyzeCall(callId);
                    await queryClient.invalidateQueries({ queryKey: CALLS_QUERY_KEY });
                })
            }
        >
            Re-analyze
        </Button>
    );
}

export function DeleteCallButton({ call, iconOnly }: { call: CallRow; iconOnly?: boolean }) {
    const queryClient = useQueryClient();
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string>();
    const [pending, startTransition] = useTransition();

    const remove = () =>
        startTransition(async () => {
            const result = await deleteCall(call.id);
            setError(result.error);
            if (result.error) return;
            await queryClient.invalidateQueries({ queryKey: CALLS_QUERY_KEY });
            setConfirming(false);
        });

    return (
        <>
            <Button
                size="sm"
                color={iconOnly ? "tertiary" : "secondary-destructive"}
                iconLeading={<Trash01 data-icon />}
                aria-label={iconOnly ? `Delete ${call.originalName}` : undefined}
                onClick={() => setConfirming(true)}
            >
                {iconOnly ? undefined : "Delete"}
            </Button>
            <ConfirmDialog
                isOpen={confirming}
                title="Delete this call?"
                confirmLabel={pending ? "Deleting…" : "Delete"}
                isDestructive
                onConfirm={remove}
                onCancel={() => setConfirming(false)}
            >
                <p>
                    <span className="font-semibold text-primary">{call.originalName}</span>, its recording and transcript will be permanently
                    deleted.
                </p>
                {error && <p className="mt-2 text-error-primary">{error}</p>}
            </ConfirmDialog>
        </>
    );
}
