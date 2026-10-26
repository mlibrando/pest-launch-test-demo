import type { FC, ReactNode } from "react";
import { ArrowDown, ArrowUp } from "@untitledui/icons";
import type { Tier } from "@/lib/calls";
import type { TierCounts } from "@/lib/overview";
import { cx } from "@/utils/cx";

export function Card({
    title,
    description,
    icon: Icon,
    action,
    className,
    children,
}: {
    title: string;
    description?: ReactNode;
    icon?: FC<{ className?: string }>;
    action?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section className={cx("flex flex-col gap-5 rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary", className)}>
            <header className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    {Icon && (
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-secondary">
                            <Icon className="size-5 text-fg-tertiary" />
                        </span>
                    )}
                    <div className="flex flex-col gap-0.5">
                        <h2 className="text-md font-semibold text-primary">{title}</h2>
                        {description && <p className="text-sm text-tertiary">{description}</p>}
                    </div>
                </div>
                {action}
            </header>
            {children}
        </section>
    );
}

const BADGE_TONES = {
    gray: "bg-secondary text-tertiary",
    error: "bg-error-secondary text-error-primary",
    warning: "bg-warning-secondary text-warning-primary",
};

// Mirrors the Calls page badges; that BADGE_CLASS lives in a client module, so server components can't import its value.
export const Badge = ({ tone, title, children }: { tone: keyof typeof BADGE_TONES; title?: string; children: ReactNode }) => (
    <span title={title} className={cx("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", BADGE_TONES[tone])}>
        {children}
    </span>
);

export const EmptyNote = ({ children }: { children: ReactNode }) => (
    <p className="flex min-h-24 flex-1 items-center justify-center rounded-lg bg-secondary px-4 py-6 text-center text-sm text-tertiary">{children}</p>
);

type DeltaProps = {
    current: number | null;
    previous: number | null;
    /** "count" shows the raw difference; "points" a percentage-point difference. */
    unit: "count" | "points";
    /** Which direction is good news; "neutral" keeps the delta gray. */
    goodWhen: "up" | "down" | "neutral";
    periodLabel: string;
};

/** "↑ 4.2 pts vs previous 30 days", colored by whether the change is good news. Renders nothing for all time. */
export function Delta({ current, previous, unit, goodWhen, periodLabel }: DeltaProps) {
    if (previous === null && current === null) return null;
    const suffix = `vs previous ${periodLabel}`;
    if (previous === null || current === null) {
        return <p className="text-xs text-quaternary">{current === null ? `No data this period` : `No data in previous ${periodLabel}`}</p>;
    }
    const diff = Math.round((current - previous) * 10) / 10;
    if (diff === 0) return <p className="text-xs text-tertiary">No change {suffix}</p>;

    const up = diff > 0;
    const good = goodWhen === "neutral" ? null : up === (goodWhen === "up");
    const Arrow = up ? ArrowUp : ArrowDown;
    return (
        <p className="flex items-center gap-1 text-xs text-tertiary">
            <span
                className={cx(
                    "inline-flex items-center gap-0.5 font-medium",
                    good === null ? "text-secondary" : good ? "text-success-primary" : "text-error-primary",
                )}
            >
                <Arrow className="size-3.5" aria-hidden />
                <span className="sr-only">{up ? "Up" : "Down"}</span>
                {Math.abs(diff)}
                {unit === "points" && " pts"}
            </span>
            {suffix}
        </p>
    );
}

export function StatTile({
    label,
    icon: Icon,
    value,
    detail,
    delta,
    className,
}: {
    label: string;
    icon: FC<{ className?: string }>;
    value: ReactNode;
    detail?: ReactNode;
    delta?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cx("flex flex-col gap-3 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary", className)}>
            <p className="flex items-center gap-2 text-sm font-medium text-tertiary">
                <Icon className="size-4 text-fg-quaternary" />
                {label}
            </p>
            <div className="flex flex-col gap-1">
                <p className="text-display-xs font-semibold text-primary">{value}</p>
                {detail && <p className="text-xs text-tertiary">{detail}</p>}
            </div>
            {delta && <div className="mt-auto">{delta}</div>}
        </div>
    );
}

const METER_TONES = {
    brand: { track: "bg-utility-brand-100", fill: "bg-utility-brand-600" },
    error: { track: "bg-utility-red-100", fill: "bg-utility-red-500" },
};

/** A ratio against 100%: the fill and a lighter track from the same ramp. */
export function Meter({ value, tone = "brand", className, label }: { value: number; tone?: keyof typeof METER_TONES; className?: string; label: string }) {
    const clamped = Math.max(0, Math.min(100, value));
    return (
        <div
            role="meter"
            aria-label={label}
            aria-valuenow={clamped}
            aria-valuemin={0}
            aria-valuemax={100}
            className={cx("h-2 overflow-hidden rounded-full", METER_TONES[tone].track, className)}
        >
            <div className={cx("h-full rounded-full", METER_TONES[tone].fill)} style={{ width: `${clamped}%` }} />
        </div>
    );
}

export const TIER_SEGMENTS: { key: Tier | "unscored"; label: string; swatch: string }[] = [
    { key: "GOLD", label: "Gold", swatch: "bg-utility-yellow-400" },
    { key: "GREEN", label: "Green", swatch: "bg-utility-green-500" },
    { key: "BELOW", label: "Below", swatch: "bg-utility-red-400" },
    { key: "unscored", label: "Not scored", swatch: "bg-utility-neutral-300" },
];

/** Part-to-whole bar of quality tiers; segments are separated by a 2px gap rather than borders. */
export function TierBar({ tiers, className }: { tiers: TierCounts; className?: string }) {
    const segments = TIER_SEGMENTS.filter((s) => tiers[s.key] > 0);
    const summary = segments.map((s) => `${tiers[s.key]} ${s.label}`).join(", ");
    if (segments.length === 0) return <div className={cx("h-2 rounded-full bg-secondary", className)} />;
    return (
        <div role="img" aria-label={summary} title={summary} className={cx("flex h-2 gap-0.5", className)}>
            {segments.map((s) => (
                <div key={s.key} className={cx("h-full rounded-full", s.swatch)} style={{ flexGrow: tiers[s.key] }} />
            ))}
        </div>
    );
}

export const formatPercent = (value: number | null) => (value === null ? "–" : `${Number.isInteger(value) ? value : value.toFixed(1)}%`);

// Five tiles: one row on wide screens, 2 + 3 on laptops, pairs on tablets with the last one full width.
export const KPI_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-5";
export const KPI_SPANS = [
    "lg:col-span-3 xl:col-span-1",
    "lg:col-span-3 xl:col-span-1",
    "lg:col-span-2 xl:col-span-1",
    "lg:col-span-2 xl:col-span-1",
    "sm:col-span-2 lg:col-span-2 xl:col-span-1",
];

const Shimmer = ({ className }: { className?: string }) => <div className={cx("animate-pulse rounded-md bg-secondary", className)} />;

/** Mirrors the page layout so the content streams in without shifting. */
export function OverviewSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy aria-label="Loading overview">
            <div className={KPI_GRID}>
                {KPI_SPANS.map((span, i) => (
                    <div key={i} className={cx("flex flex-col gap-3 rounded-xl bg-primary p-5 shadow-xs ring-1 ring-secondary", span)}>
                        <Shimmer className="h-4 w-24" />
                        <Shimmer className="h-8 w-16" />
                        <Shimmer className="h-3 w-32" />
                    </div>
                ))}
            </div>
            {[
                ["h-96 xl:col-span-2", "h-96"],
                ["h-80", "h-80 xl:col-span-2"],
            ].map(([a, b], i) => (
                <div key={i} className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <Shimmer className={cx("rounded-xl bg-primary ring-1 ring-secondary", a)} />
                    <Shimmer className={cx("rounded-xl bg-primary ring-1 ring-secondary", b)} />
                </div>
            ))}
            <Shimmer className="h-64 rounded-xl bg-primary ring-1 ring-secondary" />
        </div>
    );
}
