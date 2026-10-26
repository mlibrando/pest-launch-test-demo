import { ArrowDown, ArrowUp, ChevronSelectorVertical } from "@untitledui/icons";
import { Skeleton } from "@/components/base/skeleton/skeleton";
import { cx } from "@/utils/cx";

export type SortKey = "name" | "rep" | "outcome" | "score" | "duration" | "uploaded";
export type Sort = { key: SortKey; desc: boolean };

const COLUMNS: { key: SortKey; label: string }[] = [
    { key: "name", label: "Recording" },
    { key: "rep", label: "Rep" },
    { key: "outcome", label: "Outcome" },
    { key: "score", label: "Score" },
    { key: "duration", label: "Duration" },
    { key: "uploaded", label: "Uploaded" },
];

interface CallTableHeadProps {
    sort?: Sort;
    onSort?: (key: SortKey) => void;
}

/** Shared by the table and its skeleton, so the placeholder columns line up with the real ones. */
export function CallTableHead({ sort, onSort }: CallTableHeadProps) {
    return (
        <thead className="border-b border-secondary text-xs text-tertiary">
            <tr>
                {COLUMNS.map(({ key, label }) => {
                    const active = sort?.key === key;
                    const Icon = !active ? ChevronSelectorVertical : sort.desc ? ArrowDown : ArrowUp;
                    return (
                        <th
                            key={key}
                            aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
                            className="px-6 py-3 font-medium"
                        >
                            <button
                                type="button"
                                disabled={!onSort}
                                onClick={() => onSort?.(key)}
                                className={cx(
                                    "group/sort inline-flex items-center gap-1 rounded-sm outline-focus-ring enabled:cursor-pointer enabled:hover:text-secondary focus-visible:outline-2",
                                    active && "text-secondary",
                                )}
                            >
                                {label}
                                <Icon
                                    aria-hidden
                                    className={cx("size-3.5", !active && "text-fg-quaternary opacity-0 group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100")}
                                />
                            </button>
                        </th>
                    );
                })}
                <th className="px-6 py-3" />
            </tr>
        </thead>
    );
}

// Varied widths so the rows read as a list of calls rather than a grid of identical blocks.
const NAME_WIDTHS = ["w-24", "w-28", "w-24", "w-32", "w-24", "w-28"];

/** Mirrors the call table so the page doesn't jump when the calls arrive. */
export function CallTableSkeleton() {
    return (
        <section aria-busy aria-label="Loading calls" className="rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            <table className="w-full text-left text-sm">
                <CallTableHead />
                <tbody className="divide-y divide-secondary">
                    {NAME_WIDTHS.map((width, i) => (
                        <tr key={i}>
                            <td className="px-6 py-4">
                                <Skeleton className={cx("h-4", width)} />
                            </td>
                            <td className="px-6 py-4">
                                <Skeleton className="h-4 w-14" />
                            </td>
                            <td className="px-6 py-4">
                                <Skeleton className="h-5 w-20 rounded-full" />
                            </td>
                            <td className="px-6 py-4">
                                <Skeleton className="h-5 w-24" />
                            </td>
                            <td className="px-6 py-4">
                                <Skeleton className="h-4 w-9" />
                            </td>
                            <td className="px-6 py-4">
                                <Skeleton className="h-4 w-24" />
                            </td>
                            <td className="px-6 py-4">
                                {/* Button-sized, so the rows are as tall as the real ones with their delete button. */}
                                <div className="size-9" />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
}
