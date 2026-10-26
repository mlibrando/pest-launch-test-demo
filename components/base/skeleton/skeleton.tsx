import { cx } from "@/utils/cx";

/** A pulsing placeholder block; size and shape come from the className. */
export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cx("animate-pulse rounded-md bg-secondary", className)} />;
