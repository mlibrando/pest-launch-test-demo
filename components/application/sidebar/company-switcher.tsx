"use client";

import { useTransition } from "react";
import { ChevronSelectorVertical, ShieldTick } from "@untitledui/icons";
import { setActiveCompany } from "@/app/actions/companies";
import { Avatar } from "@/components/base/avatar/avatar";

interface CompanySwitcherProps {
    companies: { id: string; name: string }[];
    activeId: string;
}

export function CompanySwitcher({ companies, activeId }: CompanySwitcherProps) {
    const [pending, startTransition] = useTransition();

    return (
        <label className="relative flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-primary_hover">
            <Avatar icon={ShieldTick} className="rounded-lg bg-brand-solid text-white" />
            <select
                aria-label="Company"
                value={activeId}
                disabled={pending}
                onChange={(e) => {
                    const id = e.target.value;
                    startTransition(() => setActiveCompany(id));
                }}
                className="min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent pr-6 text-sm font-semibold text-primary outline-none disabled:opacity-60"
            >
                {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.name}
                    </option>
                ))}
            </select>
            <ChevronSelectorVertical className="pointer-events-none absolute right-2 size-4 text-fg-quaternary" />
        </label>
    );
}
