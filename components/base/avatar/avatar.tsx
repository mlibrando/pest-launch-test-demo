import type { FC } from "react";
import { cx } from "@/utils/cx";

export interface AvatarProps {
    initials?: string;
    icon?: FC<{ className?: string }>;
    className?: string;
}

export const Avatar = ({ initials, icon: Icon, className }: AvatarProps) => (
    <span
        aria-hidden="true"
        className={cx("flex size-10 shrink-0 items-center justify-center rounded-full bg-tertiary text-sm font-semibold text-tertiary", className)}
    >
        {Icon ? <Icon className="size-5" /> : initials}
    </span>
);
