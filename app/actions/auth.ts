"use server";

import { redirect } from "next/navigation";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";

export type LoginState = { error?: string; username?: string } | undefined;

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!username || !password) {
        return { error: "Enter your username and password.", username };
    }

    const expectedUsername = process.env.ADMIN_USERNAME;
    const passwordHash = process.env.ADMIN_PASSWORD_HASH;
    if (!expectedUsername || !passwordHash) {
        throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD_HASH must be set");
    }

    // Always verify the password so a wrong username takes as long as a wrong password.
    const passwordOk = await verifyPassword(password, passwordHash);
    if (username !== expectedUsername || !passwordOk) {
        return { error: "Invalid username or password.", username };
    }

    await createSession(username);
    redirect("/overview");
}

export async function logout() {
    await deleteSession();
    redirect("/login");
}
