"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/companies";

export async function setActiveCompany(id: string) {
    await requireSession();
    (await cookies()).set(ACTIVE_COMPANY_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
    revalidatePath("/", "layout");
}
