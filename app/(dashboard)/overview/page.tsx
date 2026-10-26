import type { Metadata } from "next";
import { Suspense } from "react";
import { DEFAULT_RANGE } from "@/lib/overview";
import { OverviewContent, OverviewPeriod } from "./overview-content";
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
                    <Suspense fallback={<p className="h-6" />}>
                        <OverviewPeriod />
                    </Suspense>
                </div>
                <Suspense fallback={<RangeTabList active={DEFAULT_RANGE} />}>
                    <RangeTabs />
                </Suspense>
            </div>
            {/* OverviewPeriod and OverviewContent read the URL's `?range=`, which isn't known until request time. */}
            <Suspense fallback={<OverviewSkeleton />}>
                <OverviewContent />
            </Suspense>
        </div>
    );
}
