import "server-only";
import { AssemblyAI, type Transcript } from "assemblyai";
import { CALL_BUCKET, type Utterance } from "@/lib/calls";
import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/utils/error-message";

const assembly = new AssemblyAI({ apiKey: `${process.env.ASSEMBLYAI_API_KEY}` });

/**
 * Moves the call queue forward by one step: finishes the in-flight transcription if AssemblyAI is done,
 * then submits the oldest uploaded call. Only one call is ever transcribing at a time.
 */
export async function advanceCallQueue() {
    const current = await prisma.call.findFirst({ where: { status: "TRANSCRIBING" } });
    if (current?.assemblyId) {
        const transcript = await assembly.transcripts.get(current.assemblyId);
        if (transcript.status === "completed") await saveTranscript(current.id, transcript);
        else if (transcript.status === "error") await failCall(current.id, `AssemblyAI error: ${transcript.error}`);
        else return;
    }
    await submitNextCall();
}

async function submitNextCall() {
    await prisma.$transaction(
        async (tx) => {
            // Transaction-scoped lock so concurrent pollers can't both submit a call.
            const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(4201) AS locked`;
            if (!locked || (await tx.call.count({ where: { status: "TRANSCRIBING" } }))) return;

            const next = await tx.call.findFirst({ where: { status: "UPLOADED" }, orderBy: { createdAt: "asc" } });
            if (!next) return;

            try {
                const { data, error } = await supabase.storage.from(CALL_BUCKET).createSignedUrl(next.audioPath, 60 * 60);
                if (error) throw new Error(`Signed URL failed: ${error.message}`);
                const submitted = await assembly.transcripts.submit({
                    audio_url: data.signedUrl,
                    speaker_labels: true,
                    speakers_expected: 2,
                });
                await tx.call.update({ where: { id: next.id }, data: { status: "TRANSCRIBING", assemblyId: submitted.id } });
            } catch (err) {
                await tx.call.update({
                    where: { id: next.id },
                    data: { status: "FAILED", failedStage: "transcribe", errorDetail: errorMessage(err) },
                });
            }
        },
        { timeout: 30_000 },
    );
}

async function saveTranscript(callId: string, transcript: Transcript) {
    const utterances: Utterance[] = (transcript.utterances ?? []).map((u, i) => ({
        i,
        speaker: u.speaker,
        startMs: u.start,
        endMs: u.end,
        text: u.text,
    }));
    if (!utterances.length) return failCall(callId, "Transcript has no utterances");

    // updateMany so a second poller finishing the same call is a no-op instead of an error.
    await prisma.call.updateMany({
        where: { id: callId, status: "TRANSCRIBING" },
        data: {
            status: "TRANSCRIBED",
            transcript: utterances,
            durationSec: transcript.audio_duration ? Math.round(transcript.audio_duration) : null,
        },
    });
}

async function failCall(callId: string, errorDetail: string) {
    await prisma.call.updateMany({
        where: { id: callId, status: "TRANSCRIBING" },
        data: { status: "FAILED", failedStage: "transcribe", errorDetail },
    });
}
