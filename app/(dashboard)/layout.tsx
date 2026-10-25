import { Suspense } from "react";
import { ShieldTick } from "@untitledui/icons";
import { CompanySwitcher } from "@/components/application/sidebar/company-switcher";
import { Sidebar } from "@/components/application/sidebar/sidebar";
import { AvatarLabel } from "@/components/base/avatar/avatar-label";
import { USER_NAME } from "@/lib/account";
import { getActiveCompany } from "@/lib/companies";
import { prisma } from "@/lib/prisma";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-dvh bg-secondary">
            <Sidebar
                header={
                    <Suspense fallback={<AvatarLabel title="…" icon={ShieldTick} className="mx-2 rounded-lg bg-brand-solid text-white" />}>
                        <ActiveCompanySwitcher />
                    </Suspense>
                }
                userName={USER_NAME}
            />
            <main className="min-w-0 flex-1 p-8">{children}</main>
        </div>
    );
}

async function ActiveCompanySwitcher() {
    const [companies, active] = await Promise.all([
        prisma.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
        getActiveCompany(),
    ]);
    return <CompanySwitcher companies={companies} activeId={active.id} />;
}
