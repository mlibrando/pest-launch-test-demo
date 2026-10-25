import { cx } from "@/utils/cx";

const SIZES = { xs: "size-3", sm: "size-4", md: "size-6", lg: "size-10" };

interface LoadingIndicatorProps {
    size?: keyof typeof SIZES;
    label?: string;
    className?: string;
}

export const LoadingIndicator = ({ size = "sm", label, className }: LoadingIndicatorProps) => (
    <span role="status" className={cx("inline-flex items-center gap-2", className)}>
        <svg fill="none" viewBox="0 0 20 20" className={cx("shrink-0", SIZES[size])}>
            <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" strokeWidth="2" />
            <circle
                className="origin-center animate-spin stroke-current"
                cx="10"
                cy="10"
                r="8"
                strokeWidth="2"
                strokeDasharray="12.5 50"
                strokeLinecap="round"
            />
        </svg>
        {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
);

/** Blocks the whole page while something important is in progress. */
export const LoadingOverlay = ({ label }: { label: string }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70">
        <div className="rounded-xl bg-primary px-8 py-6 text-md font-semibold text-primary shadow-xl">
            <LoadingIndicator size="md" label={label} className="text-brand-secondary" />
        </div>
    </div>
);
