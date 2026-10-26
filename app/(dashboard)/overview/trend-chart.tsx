"use client";

import { useState, type KeyboardEvent } from "react";
import { LineChartUp01 } from "@untitledui/icons";
import type { Overview, TrendBucket } from "@/lib/overview";
import { cx } from "@/utils/cx";
import { Card, formatPercent } from "./overview-ui";

type Metric = "score" | "calls";

const METRICS: Record<Metric, { label: string; title: string }> = {
    score: { label: "Score", title: "Average score" },
    calls: { label: "Volume", title: "Calls analyzed" },
};

// Buckets are UTC days/weeks/months, so they're labeled in UTC too.
const dayFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("en", { month: "short", year: "2-digit", timeZone: "UTC" });

const bucketLabel = (start: string, granularity: Overview["granularity"]) =>
    granularity === "month" ? monthFormat.format(new Date(start)) : dayFormat.format(new Date(start));

const bucketName = (start: string, granularity: Overview["granularity"]) =>
    granularity === "week" ? `Week of ${bucketLabel(start, granularity)}` : bucketLabel(start, granularity);

/** Rounds up to 1, 2 or 5 × 10ⁿ so the axis ticks land on clean numbers. */
function niceMax(value: number) {
    if (value <= 1) return 1;
    const magnitude = 10 ** Math.floor(Math.log10(value));
    return ([1, 2, 5, 10].find((step) => step * magnitude >= value) ?? 10) * magnitude;
}

const valueOf = (bucket: TrendBucket, metric: Metric) => (metric === "score" ? bucket.avgScore : bucket.calls);

const describe = (bucket: TrendBucket) =>
    bucket.calls === 0
        ? "No calls"
        : `${bucket.avgScore === null ? "Not scored" : `${formatPercent(bucket.avgScore)} avg`} · ${bucket.calls} call${bucket.calls === 1 ? "" : "s"}`;

export function TrendChart({ trend, granularity, className }: { trend: TrendBucket[]; granularity: Overview["granularity"]; className?: string }) {
    const [metric, setMetric] = useState<Metric>("score");
    const [active, setActive] = useState<number | null>(null);

    const max = metric === "score" ? 100 : niceMax(Math.max(...trend.map((b) => b.calls)));
    const ticks = [0, max / 2, max];
    const labelEvery = Math.ceil(trend.length / 6);
    const hasData = trend.some((b) => b.calls > 0);

    const onKeyDown = (e: KeyboardEvent) => {
        const last = trend.length - 1;
        const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
        if (!(e.key in moves)) return;
        e.preventDefault();
        setActive((i) => Math.max(0, Math.min(last, (i ?? last) + moves[e.key])));
    };

    return (
        <Card
            className={className}
            icon={LineChartUp01}
            title={METRICS[metric].title}
            description={`Per ${granularity}${metric === "score" ? ", across scored calls" : ""}`}
            action={
                <div role="group" aria-label="Metric" className="inline-flex rounded-lg bg-secondary p-0.5">
                    {(Object.keys(METRICS) as Metric[]).map((key) => (
                        <button
                            key={key}
                            type="button"
                            aria-pressed={metric === key}
                            onClick={() => setMetric(key)}
                            className={cx(
                                "rounded-md px-2.5 py-1 text-xs font-semibold transition outline-focus-ring focus-visible:outline-2",
                                metric === key ? "bg-primary text-primary shadow-xs" : "text-quaternary hover:text-secondary",
                            )}
                        >
                            {METRICS[key].label}
                        </button>
                    ))}
                </div>
            }
        >
            <div className="flex flex-col gap-2">
                <div className="relative h-52 pl-10">
                    {ticks.map((tick) => (
                        <div key={tick} className="absolute right-0 left-10 border-t border-secondary" style={{ bottom: `${(tick / max) * 100}%` }}>
                            <span className="absolute -left-10 w-8 -translate-y-1/2 text-right text-xs text-quaternary tabular-nums">
                                {metric === "score" ? `${tick}%` : tick.toLocaleString()}
                            </span>
                        </div>
                    ))}

                    <div
                        tabIndex={hasData ? 0 : -1}
                        role="group"
                        aria-label={`${METRICS[metric].title} chart. Use the arrow keys to move between ${granularity}s.`}
                        onKeyDown={onKeyDown}
                        onFocus={() => setActive((i) => i ?? trend.length - 1)}
                        onBlur={() => setActive(null)}
                        onMouseLeave={() => setActive(null)}
                        className="absolute inset-0 left-10 flex items-end rounded-sm outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-4"
                    >
                        {trend.map((bucket, i) => {
                            const value = valueOf(bucket, metric);
                            const isActive = active === i;
                            const align = i < 2 ? "left-0" : i > trend.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
                            return (
                                <div key={bucket.start} onMouseEnter={() => setActive(i)} className="relative flex h-full flex-1 items-end justify-center px-px">
                                    {isActive && <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-secondary" aria-hidden />}
                                    {value !== null && value > 0 && (
                                        <div
                                            className={cx(
                                                "relative w-full max-w-6 rounded-t-sm transition-colors",
                                                isActive ? "bg-utility-brand-700" : "bg-utility-brand-500",
                                            )}
                                            style={{ height: `max(2px, ${(value / max) * 100}%)` }}
                                        />
                                    )}
                                    {isActive && (
                                        <div
                                            role="status"
                                            className={cx(
                                                "pointer-events-none absolute bottom-full z-10 mb-2 flex flex-col gap-0.5 rounded-lg bg-primary-solid px-3 py-2 whitespace-nowrap shadow-lg",
                                                align,
                                            )}
                                        >
                                            <span className="text-xs font-semibold text-white">{bucketName(bucket.start, granularity)}</span>
                                            <span className="text-xs text-white/70">{describe(bucket)}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex pl-10" aria-hidden>
                    {trend.map((bucket, i) => (
                        <span key={bucket.start} className="relative flex-1 text-center">
                            {(trend.length - 1 - i) % labelEvery === 0 && (
                                <span className="absolute left-1/2 -translate-x-1/2 text-xs whitespace-nowrap text-quaternary">
                                    {bucketLabel(bucket.start, granularity)}
                                </span>
                            )}
                        </span>
                    ))}
                </div>
                <div className="h-4" />

                <table className="sr-only">
                    <caption>{METRICS[metric].title} by {granularity}</caption>
                    <thead>
                        <tr>
                            <th scope="col">Period</th>
                            <th scope="col">Calls</th>
                            <th scope="col">Average score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {trend.map((bucket) => (
                            <tr key={bucket.start}>
                                <th scope="row">{bucketName(bucket.start, granularity)}</th>
                                <td>{bucket.calls}</td>
                                <td>{formatPercent(bucket.avgScore)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
