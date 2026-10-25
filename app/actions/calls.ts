"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { advanceCallQueue } from "@/lib/call-pipeline";
import { AUDIO_MIME_BY_EXT, CALL_BUCKET, fileExt, PLAYBACK_URL_TTL_SEC, type Utterance } from "@/lib/calls";
import { getActiveCompany } from "@/lib/companies";
import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/utils/error-message";

export type CallUpload = { id: string; fileName: string; audioPath: string; contentType: string; signedUrl: string };

/** Returns signed URLs the browser uploads to directly, so large audio never passes through a Server Action. */
export async function prepareCallUploads(fileNames: string[]): Promise<{ error?: string; uploads?: CallUpload[] }> {
    await requireSession();

    const unsupported = fileNames.find((name) => !AUDIO_MIME_BY_EXT[fileExt(name)]);
    if (unsupported) return { error: `${unsupported} is not a supported audio file.` };

    try {
        const uploads = await Promise.all(
            fileNames.map(async (fileName) => {
                const id = randomUUID();
                const ext = fileExt(fileName);
                const audioPath = `${id}.${ext}`;
                const { data, error } = await supabase.storage.from(CALL_BUCKET).createSignedUploadUrl(audioPath);
                if (error) throw new Error(`Could not prepare upload for ${fileName}: ${error.message}`);
                return { id, fileName, audioPath, contentType: AUDIO_MIME_BY_EXT[ext], signedUrl: data.signedUrl };
            }),
        );
        return { uploads };
    } catch (err) {
        return { error: errorMessage(err) };
    }
}

export async function saveUploadedCalls(uploads: Pick<CallUpload, "id" | "fileName">[]): Promise<{ error?: string }> {
    await requireSession();

    try {
        const company = await getActiveCompany();
        await prisma.call.createMany({
            data: uploads.map(({ id, fileName }) => ({
                id,
                companyId: company.id,
                originalName: fileName,
                audioPath: `${id}.${fileExt(fileName)}`,
            })),
        });
    } catch (err) {
        return { error: errorMessage(err) };
    }
    revalidatePath("/calls");
    return {};
}

export async function processCallQueue() {
    await requireSession();
    await advanceCallQueue();
    revalidatePath("/calls");
}

export async function getCallAudioUrl(id: string): Promise<{ error?: string; audioUrl?: string }> {
    await requireSession();

    const call = await prisma.call.findUnique({ where: { id }, select: { audioPath: true } });
    if (!call) return { error: "Call not found." };

    const { data, error } = await supabase.storage.from(CALL_BUCKET).createSignedUrl(call.audioPath, PLAYBACK_URL_TTL_SEC);
    if (error) return { error: `Could not load recording: ${error.message}` };
    return { audioUrl: data.signedUrl };
}

export async function getCallTranscript(id: string): Promise<Utterance[] | null> {
    await requireSession();

    const call = await prisma.call.findUnique({ where: { id }, select: { transcript: true } });
    return (call?.transcript as Utterance[] | null) ?? null;
}

export async function retryCall(id: string) {
    await requireSession();
    await prisma.call.updateMany({
        where: { id, status: "FAILED" },
        data: { status: "UPLOADED", assemblyId: null, failedStage: null, errorDetail: null },
    });
    revalidatePath("/calls");
}

export async function updateUtterance(callId: string, index: number, text: string): Promise<{ error?: string }> {
    await requireSession();

    const call = await prisma.call.findUnique({ where: { id: callId }, select: { transcript: true } });
    const transcript = call?.transcript as Utterance[] | null;
    if (!transcript?.[index]) return { error: "Transcript line not found." };

    transcript[index] = { ...transcript[index], text: text.trim() };
    await prisma.call.update({ where: { id: callId }, data: { transcript } });
    return {};
}

/** Assigns the call's rep by name, adding them to the company's reps if they're new. An empty name unassigns. */
export async function assignCallRep(callId: string, name: string): Promise<{ error?: string }> {
    await requireSession();

    const call = await prisma.call.findUnique({ where: { id: callId }, select: { companyId: true } });
    if (!call) return { error: "Call not found." };

    try {
        const repName = name.trim();
        const rep = repName
            ? await prisma.rep.upsert({
                  where: { companyId_name: { companyId: call.companyId, name: repName } },
                  create: { companyId: call.companyId, name: repName },
                  update: {},
              })
            : null;
        await prisma.call.update({ where: { id: callId }, data: { repId: rep?.id ?? null } });
    } catch (err) {
        return { error: errorMessage(err) };
    }
    revalidatePath("/calls");
    return {};
}

export async function deleteCall(id: string): Promise<{ error?: string }> {
    await requireSession();

    try {
        const call = await prisma.call.delete({ where: { id }, select: { audioPath: true } });
        // The row is the source of truth; a leftover file is harmless, so storage errors are ignored.
        await supabase.storage.from(CALL_BUCKET).remove([call.audioPath]);
    } catch (err) {
        return { error: errorMessage(err) };
    }
    revalidatePath("/calls");
    return {};
}
