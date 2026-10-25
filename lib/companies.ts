import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const ACTIVE_COMPANY_COOKIE = "company";

/** Stands in for the signed-in tenant until accounts exist: the company picked in the sidebar, or the first one. */
export const getActiveCompany = cache(async () => {
    const id = (await cookies()).get(ACTIVE_COMPANY_COOKIE)?.value;
    const company =
        (id && (await prisma.company.findUnique({ where: { id } }))) || (await prisma.company.findFirst({ orderBy: { name: "asc" } }));
    if (!company) throw new Error("No companies found. Run the database migrations to seed them.");
    return company;
});
