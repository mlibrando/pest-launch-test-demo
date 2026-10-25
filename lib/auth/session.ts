import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload = JWTPayload & { username: string };

function getKey() {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not set");
    return new TextEncoder().encode(secret);
}

export async function encrypt(payload: SessionPayload) {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
        .sign(getKey());
}

export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
    if (!token) return null;
    try {
        const { payload } = await jwtVerify<SessionPayload>(token, getKey(), { algorithms: ["HS256"] });
        return payload;
    } catch {
        return null;
    }
}

export async function createSession(username: string) {
    const token = await encrypt({ username });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
    });
}

export async function getSession() {
    const cookieStore = await cookies();
    return decrypt(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
    if (!(await getSession())) throw new Error("Unauthorized");
}

export async function deleteSession() {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
}
