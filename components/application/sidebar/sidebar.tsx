import type { ReactNode } from "react";
import { LogOut01 } from "@untitledui/icons";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/base/buttons/button";
import { AvatarLabel } from "@/components/base/avatar/avatar-label";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

interface SidebarProps {
    header: ReactNode;
    userName: string;
}

export const Sidebar = ({ header, userName }: SidebarProps) => (
    <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col gap-6 border-r border-secondary bg-primary px-4 pt-8 pb-6">
        {header}

        <SidebarNav />

        <div className="flex flex-col gap-4 border-t border-secondary pt-6">
            <AvatarLabel title={userName} initials={userName.charAt(0).toUpperCase()} />
            <ThemeToggle />
            <form action={logout}>
                <Button type="submit" color="secondary" size="md" iconLeading={<LogOut01 data-icon />} className="w-full">
                    Log out
                </Button>
            </form>
        </div>
    </aside>
);
