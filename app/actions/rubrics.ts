"use server";

import { randomUUID } from "node:crypto";
import mammoth from "mammoth";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { extractRubric, RUBRIC_BUCKET, validateRubric, type RubricData, type SourceDocument } from "@/lib/rubrics";
import { supabase } from "@/lib/supabase";

export type RubricActionState = { error?: string; draftVersion?: number } | undefined;

const MIME_BY_EXT: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

async function requireSession() {
    if (!(await getSession())) throw new Error("Unauthorized");
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function uploadRubricDocuments(_state: RubricActionState, formData: FormData): Promise<RubricActionState> {
    await requireSession();

    // An empty file input still submits one nameless, zero-byte entry.
    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return { error: "Choose at least one PDF or DOCX file." };

    const uploads = files.map((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const id = randomUUID();
        return { file, id, ext, mimeType: MIME_BY_EXT[ext], storagePath: `${id}.${ext}` };
    });
    const unsupported = uploads.find((u) => !u.mimeType);
    if (unsupported) return { error: `${unsupported.file.name} is not a PDF or DOCX file.` };

    try {
        const sources = await Promise.all(
            uploads.map(async ({ file, mimeType, storagePath, ext }): Promise<SourceDocument> => {
                const buffer = Buffer.from(await file.arrayBuffer());
                const { error } = await supabase.storage
                    .from(RUBRIC_BUCKET)
                    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
                if (error) throw new Error(`Upload failed for ${file.name}: ${error.message}`);

                if (ext === "pdf") return { name: file.name, pdf: buffer };
                const { value } = await mammoth.extractRawText({ buffer });
                return { name: file.name, text: value };
            }),
        );

        await prisma.document.createMany({
            data: uploads.map(({ id, file, storagePath, mimeType }) => ({ id, fileName: file.name, storagePath, mimeType })),
        });

        const data = await extractRubric(sources);
        const invalid = validateRubric(data);
        if (invalid) return { error: `Extracted rubric failed validation: ${invalid}` };

        const draft = await prisma.rubricSet.create({
            data: { sourceDocumentIds: uploads.map((u) => u.id), data: data as object },
        });
        revalidatePath("/calls");
        return { draftVersion: draft.version };
    } catch (err) {
        return { error: errorMessage(err) };
    }
}

export async function saveRubricDraft(id: string, data: RubricData): Promise<RubricActionState> {
    await requireSession();

    const invalid = validateRubric(data);
    if (invalid) return { error: invalid };

    try {
        await prisma.rubricSet.update({ where: { id, status: "DRAFT" }, data: { data: data as object } });
    } catch (err) {
        return { error: errorMessage(err) };
    }
    revalidatePath("/calls");
}

export async function activateRubricSet(id: string): Promise<RubricActionState> {
    await requireSession();

    try {
        // Batch transaction: if the target isn't a draft, the update throws and the archive is rolled back.
        await prisma.$transaction([
            prisma.rubricSet.updateMany({ where: { status: "ACTIVE" }, data: { status: "ARCHIVED" } }),
            prisma.rubricSet.update({ where: { id, status: "DRAFT" }, data: { status: "ACTIVE" } }),
        ]);
    } catch (err) {
        return { error: errorMessage(err) };
    }
    revalidatePath("/calls");
}
