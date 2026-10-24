import { NextResponse, type NextRequest } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/lib/auth/session";

const PUBLIC_ROUTES = ["/login"];

// Optimistic check only: redirects based on the session cookie.
// Server actions / data access should still verify the session themselves via getSession().
export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    const session = await decrypt(request.cookies.get(SESSION_COOKIE)?.value);

    if (!isPublic && !session) {
        return NextResponse.redirect(new URL("/login", request.url));
    }
    if (isPublic && session) {
        return NextResponse.redirect(new URL("/overview", request.url));
    }
    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
