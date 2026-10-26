"use client";

import { useTransition } from "react";
import { ShieldTick } from "@untitledui/icons";
import { setActiveCompany } from "@/app/actions/companies";
import { Avatar } from "@/components/base/avatar/avatar";
import { Select } from "@/components/base/select/select";

interface CompanySwitcherProps {
    companies: { id: string; name: string }[];
    activeId: string;
}

export function CompanySwitcher({ companies, activeId }: CompanySwitcherProps) {
    const [pending, startTransition] = useTransition();

    return (
        <div className="flex items-center gap-1 px-2 py-1">
            <Avatar icon={ShieldTick} className="rounded-lg bg-brand-solid text-white" />
            <Select
                aria-label="Company"
                size="sm"
                variant="ghost"
                value={activeId}
                isDisabled={pending}
                onChange={(key) => key && startTransition(() => setActiveCompany(String(key)))}
                className="min-w-0 flex-1"
            >
                {companies.map((c) => (
                    <Select.Item key={c.id} id={c.id} label={c.name} />
                ))}
            </Select>
        </div>
    );
}
