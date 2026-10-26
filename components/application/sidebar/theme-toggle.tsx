"use client";

import { Moon01, Sun } from "@untitledui/icons";
import { useTheme } from "next-themes";
import { Button } from "@/components/base/buttons/button";

// Icon and label swap via the `dark:` variant rather than `resolvedTheme`, which is undefined during SSR and would mismatch on hydration.
export const ThemeToggle = () => {
    const { resolvedTheme, setTheme } = useTheme();
    return (
        <Button
            color="secondary"
            size="md"
            className="w-full"
            iconLeading={
                <>
                    <Moon01 data-icon className="dark:hidden" />
                    <Sun data-icon className="hidden dark:block" />
                </>
            }
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
            <span className="dark:hidden">Dark mode</span>
            <span className="hidden dark:inline">Light mode</span>
        </Button>
    );
};
