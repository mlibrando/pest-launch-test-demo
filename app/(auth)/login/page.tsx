import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
    title: "Log in",
};

export default function LoginPage() {
    return (
        <main className="flex min-h-dvh items-start justify-center bg-primary px-4 pt-24 pb-12 sm:items-center sm:pt-12">
            <div className="flex w-full max-w-90 flex-col gap-8">
                <div className="flex flex-col gap-2 text-center sm:gap-3">
                    <h1 className="text-display-xs font-semibold text-primary sm:text-display-sm">Log in</h1>
                    <p className="text-md text-tertiary">Please enter your details.</p>
                </div>
                <LoginForm />
            </div>
        </main>
    );
}
