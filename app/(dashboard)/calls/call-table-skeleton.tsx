import { Skeleton } from "@/components/base/skeleton/skeleton";
import { cx } from "@/utils/cx";

/** Shared by the table and its skeleton, so the placeholder columns line up with the real ones. */
export function CallTableHead() {
    return (
        <thead className="border-b border-secondary text-xs text-tertiary">
            <tr>
                <th className="px-6 py-3 font-medium">Recording</th>
                <th className="px-6 py-3 font-medium">Rep</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Score</th>
                <th className="px-6 py-3 font-medium">Duration</th>
                <th className="px-6 py-3 font-medium">Uploaded</th>
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
                                <Skeleton className="h-5 w-14 rounded-full" />
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
                                <Skeleton className="ml-auto size-9 rounded-lg" />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
}
