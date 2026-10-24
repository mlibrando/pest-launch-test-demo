"use client";

import type { FC } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/utils/cx";

export interface NavItemProps {
    label: string;
    href: string;
    icon: FC<{ className?: string }>;
}

export const NavItem = ({ label, href, icon: Icon }: NavItemProps) => {
    const pathname = usePathname();
    const isActive = pathname === href || pathname.startsWith(`${href}/`);

    return (
        <Link
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cx(
                "flex items-center gap-3 rounded-md px-3 py-2 text-md font-semibold text-secondary transition hover:bg-primary_hover",
                isActive && "bg-active text-secondary_hover",
            )}
        >
            <Icon className="size-5 shrink-0 text-fg-quaternary" />
            {label}
        </Link>
    );
};
