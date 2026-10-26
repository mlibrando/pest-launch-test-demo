"use client";

import type { MouseEvent } from "react";
import { useSearchParams } from "next/navigation";
import { DEFAULT_RANGE, parseRange, RANGES, type RangeKey } from "@/lib/overview";
import { cx } from "@/utils/cx";

const SHORT_LABEL: Record<RangeKey, string> = { "7d": "7D", "30d": "30D", "90d": "90D", all: "All" };

const hrefFor = (key: RangeKey) => (key === DEFAULT_RANGE ? "/overview" : `/overview?range=${key}`);

/** Segmented date-range filter; the range lives in the URL so a view can be shared or bookmarked. */
export function RangeTabs() {
    const active = parseRange(useSearchParams().get("range"));
    return <RangeTabList active={active} />;
}

export function RangeTabList({ active }: { active: RangeKey }) {
    // The overview is fetched client-side, so a range change only needs the URL updated, not a server navigation.
    // Modified clicks (new tab, etc.) fall through to the plain link.
    const select = (e: MouseEvent, key: RangeKey) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        if (key !== active) window.history.pushState(null, "", hrefFor(key));
    };

    return (
        <nav aria-label="Date range" className="inline-flex rounded-lg bg-primary p-0.5 shadow-xs ring-1 ring-primary">
            {(Object.keys(RANGES) as RangeKey[]).map((key) => (
                <a
                    key={key}
                    href={hrefFor(key)}
                    onClick={(e) => select(e, key)}
                    aria-current={key === active ? "page" : undefined}
                    title={key === "all" ? "All time" : `Last ${RANGES[key].label}`}
                    className={cx(
                        "rounded-md px-3 py-1.5 text-sm font-semibold transition outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2",
                        key === active ? "bg-secondary text-primary" : "text-quaternary hover:bg-primary_hover hover:text-secondary",
                    )}
                >
                    {SHORT_LABEL[key]}
                </a>
            ))}
        </nav>
    );
}
