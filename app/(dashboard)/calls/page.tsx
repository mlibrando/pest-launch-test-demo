import type { Metadata } from "next";
import { Suspense } from "react";
import { ClipboardCheck } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { prisma } from "@/lib/prisma";
import type { RubricData } from "@/lib/rubrics";
import { CallTable } from "./call-table";
import { RubricSetsModal } from "./rubric-sets-modal";
import { UploadCallsButton } from "./upload-calls";

export const metadata: Metadata = {
    title: "Calls",
};

export default function CallsPage() {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
                <h1 className="text-display-xs font-semibold text-primary">Calls</h1>
                <div className="flex items-start gap-3">
                    <Suspense
                        fallback={
                            <Button size="md" color="secondary" iconLeading={<ClipboardCheck data-icon />} isDisabled>
                                Rubric Sets
                            </Button>
                        }
                    >
                        <RubricSetsButton />
                    </Suspense>
                    <UploadCallsButton />
                </div>
            </div>
            <Suspense fallback={<p className="text-sm text-tertiary">Loading calls…</p>}>
                <CallList />
            </Suspense>
        </div>
    );
}

async function CallList() {
    const calls = await prisma.call.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, originalName: true, status: true, durationSec: true, errorDetail: true, createdAt: true },
    });
    return <CallTable calls={calls} />;
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

    return <RubricSetsModal activeSet={active && toProps(active)} draft={draft && toProps(draft)} versions={versions} />;
}
