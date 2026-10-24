"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";

export function LoginForm() {
    const [state, action, pending] = useActionState(login, undefined);
    const isInvalid = Boolean(state?.error);

    return (
        <form action={action} className="flex flex-col gap-5">
            <Input
                label="Username"
                name="username"
                autoComplete="username"
                placeholder="Enter your username"
                defaultValue={state?.username}
                isRequired
                hideRequiredIndicator
                isInvalid={isInvalid}
                validationBehavior="aria"
            />
            <Input
                label="Password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                isRequired
                hideRequiredIndicator
                isInvalid={isInvalid}
                validationBehavior="aria"
                hint={state?.error}
            />
            <Button type="submit" size="lg" isLoading={pending} showTextWhileLoading className="mt-1 w-full">
                Log in
            </Button>
        </form>
    );
}
