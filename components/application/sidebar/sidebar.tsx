import { LogOut01, ShieldTick } from "@untitledui/icons";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/base/buttons/button";
import { AvatarLabel } from "@/components/base/avatar/avatar-label";
import { SidebarNav } from "./sidebar-nav";

interface SidebarProps {
    clientName: string;
    userName: string;
}

export const Sidebar = ({ clientName, userName }: SidebarProps) => (
    <aside className="flex w-64 shrink-0 flex-col gap-6 border-r border-secondary bg-primary px-4 pt-8 pb-6">
        <div className="px-2">
            <AvatarLabel title={clientName} icon={ShieldTick} className="rounded-lg bg-brand-solid text-white" />
        </div>

        <SidebarNav />

        <div className="flex flex-col gap-4 border-t border-secondary pt-6">
            <AvatarLabel title={userName} initials={userName.charAt(0).toUpperCase()} />
            <form action={logout}>
                <Button type="submit" color="secondary" size="md" iconLeading={<LogOut01 data-icon />} className="w-full">
                    Log out
                </Button>
            </form>
        </div>
    </aside>
);
