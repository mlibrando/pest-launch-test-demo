import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "@untitledui/icons";
import type { Tier } from "@/lib/calls";
import { Skeleton } from "@/components/base/skeleton/skeleton";
import { MIN_COMPARABLE, type TierCounts } from "@/lib/overview";
import { cx } from "@/utils/cx";

export function Card({
    title,
    description,
    action,
    className,
    flush,
    children,
}: {
    title: string;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
    /** Lets tables and lists run edge to edge, with only the header padded. */
    flush?: boolean;
    children: ReactNode;
}) {
    return (
        <section className={cx("flex flex-col gap-5 rounded-xl bg-primary shadow-xs ring-1 ring-secondary", flush ? "pt-5" : "p-6", className)}>
            <header className={cx("flex items-start justify-between gap-4", flush && "px-6")}>
                <div className="flex flex-col gap-0.5">
                    <h2 className="text-md font-semibold text-primary">{title}</h2>
                    {description && <p className="text-sm text-tertiary">{description}</p>}
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

export const EmptyNote = ({ children, className }: { children: ReactNode; className?: string }) => (
    <p className={cx("flex min-h-24 flex-1 items-center justify-center rounded-lg bg-secondary px-4 py-6 text-center text-sm text-tertiary", className)}>{children}</p>
);

type DeltaProps = {
    current: number | null;
    previous: number | null;
    /** "count" shows the raw difference; "points" a percentage-point difference. */
    unit: "count" | "points";
    /** Which direction is good news; "neutral" keeps the delta gray. */
    goodWhen: "up" | "down" | "neutral";
    periodLabel: string;
    /** Calls behind each side of a rate. Below MIN_COMPARABLE on either side, the change is noise and isn't shown. */
    samples?: [current: number, previous: number | null];
};

/** "↑ 4.2 pts vs prior 30 days", colored by whether the change is good news. */
export function Delta({ current, previous, unit, goodWhen, periodLabel, samples }: DeltaProps) {
    if (current === null || previous === null) return null;
    if (samples && (samples[0] < MIN_COMPARABLE || (samples[1] ?? 0) < MIN_COMPARABLE)) return null;
    const suffix = `vs prior ${periodLabel}`;
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

/** One cell of the KPI strip; the strip draws the dividers, so the tile has no frame of its own. */
export function StatTile({
    label,
    value,
    detail,
    delta,
    className,
    children,
}: {
    label: string;
    value: ReactNode;
    detail?: ReactNode;
    delta?: ReactNode;
    className?: string;
    children?: ReactNode;
}) {
    return (
        <div className={cx("flex flex-col gap-2 bg-primary p-5", className)}>
            <p className="text-sm font-medium text-tertiary">{label}</p>
            <p className="text-display-sm font-semibold text-primary tabular-nums">{value}</p>
            {detail && <p className="text-xs text-secondary">{detail}</p>}
            {children}
            {delta && <div className="mt-auto pt-1">{delta}</div>}
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

export const formatMoney = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

// Five cells in one framed strip; the 1px gap over a border-colored background draws the dividers at every breakpoint.
export const KPI_STRIP = "grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-border-secondary shadow-xs ring-1 ring-secondary sm:grid-cols-2 lg:grid-cols-5";
export const KPI_LAST = "sm:col-span-2 lg:col-span-1";

const Frame = ({ className }: { className?: string }) => <Skeleton className={cx("rounded-xl bg-primary ring-1 ring-secondary", className)} />;

/** Mirrors the page layout so the content streams in without shifting. */
export function OverviewSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy aria-label="Loading overview">
            <div className={KPI_STRIP}>
                {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className={cx("flex flex-col gap-3 bg-primary p-5", i === 4 && KPI_LAST)}>
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-9 w-20" />
                        <Skeleton className="h-3 w-32" />
                    </div>
                ))}
            </div>
            <Frame className="h-96" />
            <Frame className="h-72" />
        </div>
    );
}
