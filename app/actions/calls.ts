"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { analyzeCall } from "@/lib/call-analysis";
import { advanceCallQueue, claimNextAnalysis } from "@/lib/call-pipeline";
import {
    AUDIO_MIME_BY_EXT,
    CALL_BUCKET,
    fileExt,
    PLAYBACK_URL_TTL_SEC,
    type AnalysisProgress,
    type Quote,
    type Tier,
    type Utterance,
} from "@/lib/calls";
import { getActiveCompany } from "@/lib/companies";
import { prisma } from "@/lib/prisma";
import type { RubricData } from "@/lib/rubrics";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/utils/error-message";

type Note = { text: string; utterance: number | null };

export type CallAnalysis = {
    scorecard: string | null;
    category: string | null;
    subtype: string | null;
    direction: string | null;
    outcome: string | null;
    outcomeReason: string | null;
    summary: string | null;
    details: { customerName?: string | null; pestType: string | null; serviceRequested: string | null; priceQuoted: string | null; followUp: string | null } | null;
    coaching: { strengths: Note[]; improvements: Note[] } | null;
    points: number | null;
    maxPoints: number | null;
    score: number | null;
    tier: Tier | null;
    analysisWarnings: string[];
    criteria: {
        criterionId: string;
        quadrant: string;
        label: string;
        result: "PASS" | "FAIL" | "NA";
        source: "MODEL" | "AUTO_PASS" | "EXCLUDED";
        rationale: string | null;
        quotes: Quote[];
    }[];
    policyViolations: { policyIndex: number; rule: string; explanation: string; quotes: Quote[] }[];
};

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
    return {};
}

/** Advances the queue, then returns the call list. The Calls page polls this while calls are in progress, which keeps processing going. */
export async function syncCalls() {
    await requireSession();
    await advanceCallQueue();
    const id = await claimNextAnalysis();
    if (id) after(() => analyzeCall(id));

    const company = await getActiveCompany();
    const [calls, reps, activeRubrics] = await Promise.all([
        prisma.call.findMany({
            where: { companyId: company.id },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                originalName: true,
                status: true,
                durationSec: true,
                errorDetail: true,
                failedStage: true,
                createdAt: true,
                repName: true,
                rep: { select: { name: true } },
                scorecard: true,
                points: true,
                maxPoints: true,
                tier: true,
                analysisProgress: true,
            },
        }),
        prisma.rep.findMany({ where: { companyId: company.id }, orderBy: { name: "asc" }, select: { name: true } }),
        prisma.rubricSet.count({ where: { status: "ACTIVE" } }),
    ]);
    return {
        calls: calls.map((c) => ({ ...c, tier: c.tier as Tier | null, analysisProgress: c.analysisProgress as AnalysisProgress | null })),
        repNames: reps.map((r) => r.name),
        hasActiveRubric: activeRubrics > 0,
    };
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
    // An analysis failure keeps its transcript; anything else starts over from the audio.
    await prisma.call.updateMany({
        where: { id, status: "FAILED", failedStage: "analyze" },
        data: { status: "TRANSCRIBED", failedStage: null, errorDetail: null },
    });
    await prisma.call.updateMany({
        where: { id, status: "FAILED" },
        data: { status: "UPLOADED", assemblyId: null, failedStage: null, errorDetail: null },
    });
}

export async function reanalyzeCall(id: string) {
    await requireSession();
    await prisma.call.updateMany({
        where: { id, OR: [{ status: "DONE" }, { status: "FAILED", failedStage: "analyze" }] },
        data: { status: "TRANSCRIBED", failedStage: null, errorDetail: null },
    });
}

export async function getCallAnalysis(id: string): Promise<CallAnalysis | null> {
    await requireSession();

    const call = await prisma.call.findUnique({
        where: { id },
        select: {
            scorecard: true,
            category: true,
            subtype: true,
            direction: true,
            outcome: true,
            outcomeReason: true,
            summary: true,
            details: true,
            coaching: true,
            points: true,
            maxPoints: true,
            score: true,
            tier: true,
            analysisWarnings: true,
            rubricSet: { select: { data: true } },
            criteria: { select: { criterionId: true, result: true, source: true, rationale: true, quotes: true } },
            policyViolations: { orderBy: { policyIndex: "asc" }, select: { policyIndex: true, rule: true, explanation: true, quotes: true } },
        },
    });
    if (!call) return null;

    const { rubricSet, criteria, policyViolations, ...fields } = call;
    const rubricCriteria = (rubricSet?.data as RubricData | undefined)?.scorecards.find((s) => s.callType === call.scorecard)?.criteria ?? [];
    const position = (criterionId: string) => {
        const i = rubricCriteria.findIndex((c) => c.id === criterionId);
        return i < 0 ? rubricCriteria.length : i;
    };

    return {
        ...fields,
        details: fields.details as CallAnalysis["details"],
        coaching: fields.coaching as CallAnalysis["coaching"],
        tier: fields.tier as Tier | null,
        analysisWarnings: (fields.analysisWarnings as string[] | null) ?? [],
        criteria: criteria
            .toSorted((a, b) => position(a.criterionId) - position(b.criterionId))
            .map((r) => {
                const criterion = rubricCriteria.find((c) => c.id === r.criterionId);
                return {
                    ...r,
                    // The rubric set can be deleted after grading; the stored results still stand on their own.
                    quadrant: criterion?.quadrant ?? "",
                    label: criterion?.label ?? r.criterionId,
                    result: r.result as CallAnalysis["criteria"][number]["result"],
                    source: r.source as CallAnalysis["criteria"][number]["source"],
                    quotes: (r.quotes as Quote[] | null) ?? [],
                };
            }),
        policyViolations: policyViolations.map((v) => ({ ...v, quotes: v.quotes as Quote[] })),
    };
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
    return {};
}
