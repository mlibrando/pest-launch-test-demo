"use client";

import { useState, useTransition } from "react";
import { RefreshCcw01, Trash01 } from "@untitledui/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteCall, reanalyzeCall, retryCall } from "@/app/actions/calls";
import { ConfirmDialog } from "@/components/application/confirm-dialog/confirm-dialog";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Button } from "@/components/base/buttons/button";
import type { CallStatus } from "@/generated/prisma/client";
import { CALLS_QUERY_KEY, humanize, MAX_ATTEMPTS, type AnalysisProgress, type Tier } from "@/lib/calls";
import { MISSED_OUTCOMES } from "@/lib/overview";
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
    score: number | null;
    tier: Tier | null;
    outcome: string | null;
    direction: string | null;
    analysisProgress: AnalysisProgress | null;
};

export const BADGE_CLASS = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

const STATUS: Record<CallStatus, { label: string; className: string }> = {
    UPLOADED: { label: "Queued", className: "bg-secondary text-tertiary" },
    TRANSCRIBING: { label: "Transcribing", className: "bg-utility-brand-50 text-utility-brand-700" },
    TRANSCRIBED: { label: "Transcribed", className: "bg-utility-green-50 text-utility-green-700" },
    ANALYZING: { label: "Analyzing", className: "bg-utility-brand-50 text-utility-brand-700" },
    DONE: { label: "Done", className: "bg-utility-green-50 text-utility-green-700" },
    FAILED: { label: "Failed", className: "bg-utility-red-50 text-utility-red-700" },
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
    GOLD: { label: "Gold", className: "bg-utility-yellow-50 text-utility-yellow-700" },
    GREEN: { label: "Green", className: "bg-utility-green-50 text-utility-green-700" },
    BELOW: { label: "Below", className: "bg-utility-red-50 text-utility-red-700" },
};

export function TierBadge({ tier }: { tier: Tier }) {
    return <span className={cx(BADGE_CLASS, TIER[tier].className)}>{TIER[tier].label}</span>;
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
    const missed = MISSED_OUTCOMES.includes(outcome);
    return (
        <span className={cx(BADGE_CLASS, missed ? "bg-utility-red-50 text-utility-red-700" : "bg-utility-green-50 text-utility-green-700")}>
            {humanize(outcome)}
        </span>
    );
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

export const DELETE_CALL_KEY = [...CALLS_QUERY_KEY, "delete"];

export function DeleteCallButton({ call, iconOnly }: { call: CallRow; iconOnly?: boolean }) {
    const queryClient = useQueryClient();
    const [confirming, setConfirming] = useState(false);
    const mutation = useMutation({
        mutationKey: DELETE_CALL_KEY,
        mutationFn: async (id: string) => {
            const { error } = await deleteCall(id);
            if (error) throw new Error(error);
        },
        // Stays pending until the list refetches, so the row keeps its deleting state until it's gone.
        onSuccess: () => {
            setConfirming(false);
            return queryClient.invalidateQueries({ queryKey: CALLS_QUERY_KEY });
        },
    });
    const cancel = () => {
        setConfirming(false);
        mutation.reset();
    };

    return (
        <>
            <Button
                size="sm"
                color={iconOnly ? "tertiary" : "secondary-destructive"}
                iconLeading={<Trash01 data-icon />}
                isLoading={mutation.isPending}
                aria-label={iconOnly ? `Delete ${call.originalName}` : undefined}
                onClick={() => setConfirming(true)}
            >
                {iconOnly ? undefined : "Delete"}
            </Button>
            <ConfirmDialog
                isOpen={confirming}
                title="Delete this call?"
                confirmLabel="Delete"
                isDestructive
                isPending={mutation.isPending}
                onConfirm={() => mutation.mutate(call.id)}
                onCancel={cancel}
            >
                <p>
                    <span className="font-semibold text-primary">{call.originalName}</span>, its recording and transcript will be permanently
                    deleted.
                </p>
                {mutation.error && <p className="mt-2 text-error-primary">{mutation.error.message}</p>}
            </ConfirmDialog>
        </>
    );
}
