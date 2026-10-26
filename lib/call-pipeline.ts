import "server-only";
import { AssemblyAI, type Transcript } from "assemblyai";
import { Prisma } from "@/generated/prisma/client";
import { CALL_BUCKET, type AnalysisProgress, type Utterance } from "@/lib/calls";
import { correctIntro } from "@/lib/intro-correction";
import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/utils/error-message";

const assembly = new AssemblyAI({ apiKey: `${process.env.ASSEMBLYAI_API_KEY}` });

const STALE_ANALYSIS_MS = 10 * 60 * 1000;

const withCompany = { company: { include: { reps: { select: { id: true, name: true } } } } } as const;
type CompanyWithReps = { name: string; reps: { id: string; name: string }[] };

/**
 * Moves the call queue forward by one step: finishes the in-flight transcription if AssemblyAI is done,
 * then submits the oldest uploaded call. Only one call is ever transcribing at a time.
 */
export async function advanceCallQueue() {
    const current = await prisma.call.findFirst({ where: { status: "TRANSCRIBING" }, include: withCompany });
    if (current?.assemblyId) {
        const transcript = await assembly.transcripts.get(current.assemblyId);
        if (transcript.status === "completed") await saveTranscript(current.id, current.company, transcript);
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

            const next = await tx.call.findFirst({ where: { status: "UPLOADED" }, orderBy: { createdAt: "asc" }, include: withCompany });
            if (!next) return;

            try {
                const { data, error } = await supabase.storage.from(CALL_BUCKET).createSignedUrl(next.audioPath, 60 * 60);
                if (error) throw new Error(`Signed URL failed: ${error.message}`);
                const submitted = await assembly.transcripts.submit({
                    audio_url: data.signedUrl,
                    speaker_labels: true,
                    speakers_expected: 2,
                    keyterms_prompt: [next.company.name, ...next.company.reps.map((r) => r.name)],
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

/** Claims the oldest transcribed call for analysis, or returns null. Only one call is ever analyzing at a time. */
export async function claimNextAnalysis(): Promise<string | null> {
    return prisma.$transaction(async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(4202) AS locked`;
        if (!locked) return null;

        // analyzeCall bumps updatedAt before every attempt, so a call this quiet was orphaned (e.g. the server restarted).
        await tx.call.updateMany({
            where: { status: "ANALYZING", updatedAt: { lt: new Date(Date.now() - STALE_ANALYSIS_MS) } },
            data: { status: "TRANSCRIBED", analysisProgress: Prisma.DbNull },
        });
        if (await tx.call.count({ where: { status: "ANALYZING" } })) return null;

        const rubricSet = await tx.rubricSet.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
        if (!rubricSet) return null;

        const next = await tx.call.findFirst({ where: { status: "TRANSCRIBED" }, orderBy: { createdAt: "asc" }, select: { id: true } });
        if (!next) return null;

        const progress: AnalysisProgress = { stage: "classifying", attempt: 1 };
        await tx.call.update({
            where: { id: next.id },
            data: { status: "ANALYZING", rubricSetId: rubricSet.id, analysisProgress: progress, failedStage: null, errorDetail: null },
        });
        return next.id;
    });
}

async function saveTranscript(callId: string, company: CompanyWithReps, transcript: Transcript) {
    let utterances: Utterance[] = (transcript.utterances ?? []).map((u, i) => ({
        i,
        speaker: u.speaker,
        startMs: u.start,
        endMs: u.end,
        text: u.text,
    }));
    if (!utterances.length) return failCall(callId, "Transcript has no utterances");

    let repName: string | null = null;
    try {
        ({ utterances, repName } = await correctIntro(utterances, company.name, company.reps.map((r) => r.name)));
    } catch (err) {
        // The raw transcript is still usable; the admin can fix the intro by hand.
        console.error(`Intro correction failed for call ${callId}:`, err);
    }
    const rep = company.reps.find((r) => r.name.toLowerCase() === repName?.toLowerCase());

    // updateMany so a second poller finishing the same call is a no-op instead of an error.
    await prisma.call.updateMany({
        where: { id: callId, status: "TRANSCRIBING" },
        data: {
            status: "TRANSCRIBED",
            transcript: utterances,
            durationSec: transcript.audio_duration ? Math.round(transcript.audio_duration) : null,
            repName: rep?.name ?? repName,
            repId: rep?.id ?? null,
        },
    });
}

async function failCall(callId: string, errorDetail: string) {
    await prisma.call.updateMany({
        where: { id: callId, status: "TRANSCRIBING" },
        data: { status: "FAILED", failedStage: "transcribe", errorDetail },
    });
}
