"use client";

import { BarChartSquare02, Phone01 } from "@untitledui/icons";
import { NavItem, type NavItemProps } from "./nav-item";

const NAV_ITEMS: NavItemProps[] = [
    { label: "Overview", href: "/overview", icon: BarChartSquare02 },
    { label: "Calls", href: "/calls", icon: Phone01 },
];

export const SidebarNav = () => (
    <nav className="flex-1">
        <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                    <NavItem {...item} />
                </li>
            ))}
        </ul>
    </nav>
);
