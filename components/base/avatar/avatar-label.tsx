import { Avatar, type AvatarProps } from "./avatar";

interface AvatarLabelProps extends AvatarProps {
    title: string;
    subtitle?: string;
}

export const AvatarLabel = ({ title, subtitle, ...avatarProps }: AvatarLabelProps) => (
    <div className="flex min-w-0 items-center gap-3">
        <Avatar {...avatarProps} />
        <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary">{title}</p>
            {subtitle && <p className="truncate text-sm text-tertiary">{subtitle}</p>}
        </div>
    </div>
);
