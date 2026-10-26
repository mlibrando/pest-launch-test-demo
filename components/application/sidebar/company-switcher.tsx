"use client";

import { useTransition } from "react";
import { ShieldTick } from "@untitledui/icons";
import { useQueryClient } from "@tanstack/react-query";
import { setActiveCompany } from "@/app/actions/companies";
import { Avatar } from "@/components/base/avatar/avatar";
import { Select } from "@/components/base/select/select";

interface CompanySwitcherProps {
    companies: { id: string; name: string }[];
    activeId: string;
}

export function CompanySwitcher({ companies, activeId }: CompanySwitcherProps) {
    const queryClient = useQueryClient();
    const [pending, startTransition] = useTransition();

    const switchCompany = (id: string) =>
        startTransition(async () => {
            await setActiveCompany(id);
            // Every cached query holds the previous company's calls. Reset, not remove, so a mounted call list refetches.
            await queryClient.resetQueries();
        });

    return (
        <div className="flex items-center gap-1 px-2 py-1">
            <Avatar icon={ShieldTick} className="rounded-lg bg-brand-solid text-white" />
            <Select
                aria-label="Company"
                size="sm"
                variant="ghost"
                value={activeId}
                isDisabled={pending}
                onChange={(key) => key && switchCompany(String(key))}
                className="min-w-0 flex-1"
            >
                {companies.map((c) => (
                    <Select.Item key={c.id} id={c.id} label={c.name} />
                ))}
            </Select>
        </div>
    );
}
