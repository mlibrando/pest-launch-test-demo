"use client";

import { useState, useTransition } from "react";
import { RefreshCcw01, Trash01 } from "@untitledui/icons";
import { deleteCall, retryCall } from "@/app/actions/calls";
import { ConfirmDialog } from "@/components/application/confirm-dialog/confirm-dialog";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Button } from "@/components/base/buttons/button";
import type { CallStatus } from "@/generated/prisma/client";
import { cx } from "@/utils/cx";

export type CallRow = {
    id: string;
    originalName: string;
    status: CallStatus;
    durationSec: number | null;
    errorDetail: string | null;
    createdAt: Date;
    repName: string | null;
    rep: { name: string } | null;
};

const STATUS: Record<CallStatus, { label: string; className: string }> = {
    UPLOADED: { label: "Queued", className: "bg-secondary text-tertiary" },
    TRANSCRIBING: { label: "Transcribing", className: "bg-brand-secondary text-brand-secondary" },
    TRANSCRIBED: { label: "Transcribed", className: "bg-success-secondary text-success-primary" },
    ANALYZING: { label: "Analyzing", className: "bg-brand-secondary text-brand-secondary" },
    DONE: { label: "Done", className: "bg-success-secondary text-success-primary" },
    FAILED: { label: "Failed", className: "bg-error-secondary text-error-primary" },
};

export function StatusBadge({ status, queuePosition }: { status: CallStatus; queuePosition?: number }) {
    const isWorking = status === "TRANSCRIBING" || status === "ANALYZING";
    return (
        <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", STATUS[status].className)}>
            {isWorking && <LoadingIndicator size="xs" />}
            {STATUS[status].label}
            {queuePosition && ` · #${queuePosition}`}
        </span>
    );
}

export function RetryButton({ callId }: { callId: string }) {
    const [pending, startTransition] = useTransition();
    return (
        <Button
            size="sm"
            color="secondary"
            iconLeading={<RefreshCcw01 data-icon />}
            isLoading={pending}
            onClick={() => startTransition(() => retryCall(callId))}
        >
            Retry
        </Button>
    );
}

export function DeleteCallButton({ call, iconOnly }: { call: CallRow; iconOnly?: boolean }) {
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string>();
    const [pending, startTransition] = useTransition();

    const remove = () =>
        startTransition(async () => {
            const result = await deleteCall(call.id);
            setError(result.error);
            if (!result.error) setConfirming(false);
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
