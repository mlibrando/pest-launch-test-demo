import type { Metadata } from "next";
import { Suspense } from "react";
import { DEFAULT_RANGE } from "@/lib/overview";
import { OverviewContent } from "./overview-content";
import { OverviewSkeleton } from "./overview-ui";
import { RangeTabList, RangeTabs } from "./range-tabs";

export const metadata: Metadata = {
    title: "Overview",
};

export default function OverviewPage() {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-display-xs font-semibold text-primary">Overview</h1>
                    <p className="text-md text-tertiary">How your team is handling calls, and where to coach next.</p>
                </div>
                <Suspense fallback={<RangeTabList active={DEFAULT_RANGE} />}>
                    <RangeTabs />
                </Suspense>
            </div>
            {/* OverviewContent reads the URL's `?range=`, which isn't known until request time. */}
            <Suspense fallback={<OverviewSkeleton />}>
                <OverviewContent />
            </Suspense>
        </div>
    );
}
