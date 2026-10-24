import type { Metadata } from "next";
import { Suspense } from "react";
import { ClipboardCheck } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { prisma } from "@/lib/prisma";
import type { RubricData } from "@/lib/rubrics";
import { RubricSetsModal } from "./rubric-sets-modal";

export const metadata: Metadata = {
    title: "Calls",
};

export default function CallsPage() {
    return (
        <div className="flex items-center justify-between gap-4">
            <h1 className="text-display-xs font-semibold text-primary">Calls</h1>
            <Suspense
                fallback={
                    <Button size="md" color="secondary" iconLeading={<ClipboardCheck data-icon />} isDisabled>
                        Rubric Sets
                    </Button>
                }
            >
                <RubricSetsButton />
            </Suspense>
        </div>
    );
}

async function RubricSetsButton() {
    const [versions, active, draft] = await Promise.all([
        prisma.rubricSet.findMany({
            orderBy: { version: "desc" },
            select: { id: true, version: true, status: true, createdAt: true },
        }),
        prisma.rubricSet.findFirst({ where: { status: "ACTIVE" } }),
        prisma.rubricSet.findFirst({ where: { status: "DRAFT" }, orderBy: { version: "desc" } }),
    ]);
    const documents = await prisma.document.findMany({
        where: { id: { in: [...(active?.sourceDocumentIds ?? []), ...(draft?.sourceDocumentIds ?? [])] } },
        select: { id: true, fileName: true },
    });

    const toProps = (set: NonNullable<typeof active>) => ({
        id: set.id,
        version: set.version,
        createdAt: set.createdAt,
        data: set.data as RubricData,
        documentNames: documents.filter((d) => set.sourceDocumentIds.includes(d.id)).map((d) => d.fileName),
    });

    return (
        <RubricSetsModal
            activeSet={active && toProps(active)}
            draft={draft && toProps(draft)}
            versions={versions}
        />
    );
}
