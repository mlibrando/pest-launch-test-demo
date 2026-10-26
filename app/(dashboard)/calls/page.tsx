import type { Metadata } from "next";
import { Suspense } from "react";
import { ClipboardCheck } from "@untitledui/icons";
import { LoadingIndicator } from "@/components/application/loading-indicator/loading-indicator";
import { Button } from "@/components/base/buttons/button";
import { getActiveCompany } from "@/lib/companies";
import { prisma } from "@/lib/prisma";
import type { RubricData } from "@/lib/rubrics";
import { CallTable } from "./call-table";
import { RubricSetsModal } from "./rubric-sets-modal";
import { UploadCallsButton } from "./upload-calls";

export const metadata: Metadata = {
    title: "Calls",
};

// Covers the Server Actions on this page too, including the after() analysis: up to 6 LLM attempts in the worst case.
export const maxDuration = 300;

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
            {/* CallTable reads the URL's `?call=`, which isn't known until request time. */}
            <Suspense fallback={<LoadingIndicator label="Loading calls…" className="text-sm text-tertiary" />}>
                <CallTable />
            </Suspense>
        </div>
    );
}

async function RubricSetsButton() {
    const [versions, active, draft, company] = await Promise.all([
        prisma.rubricSet.findMany({
            orderBy: { version: "desc" },
            select: { id: true, version: true, status: true, createdAt: true },
        }),
        prisma.rubricSet.findFirst({ where: { status: "ACTIVE" } }),
        prisma.rubricSet.findFirst({ where: { status: "DRAFT" }, orderBy: { version: "desc" } }),
        getActiveCompany(),
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

    return <RubricSetsModal activeSet={active && toProps(active)} draft={draft && toProps(draft)} versions={versions} companyName={company.name} />;
}
