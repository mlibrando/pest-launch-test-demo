"use client";

import { useEffect } from "react";
import { processCallQueue } from "@/app/actions/calls";

const POLL_INTERVAL_MS = 5000;

/** Drives the transcription queue while this page is open and calls are still in progress. */
export function CallQueuePoller({ isActive }: { isActive: boolean }) {
    useEffect(() => {
        if (!isActive) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;

        const tick = async () => {
            await processCallQueue().catch(console.error);
            if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
        };
        tick();

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [isActive]);

    return null;
}
