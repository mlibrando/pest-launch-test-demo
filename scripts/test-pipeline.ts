/**
 * Smoke test of the real call pipeline: upload -> transcribe -> analyze against the active rubric set.
 * Makes paid AssemblyAI and Claude calls, and leaves the call in the database so you can open it on the Calls page.
 *
 * Usage:
 *   npx tsx --conditions=react-server scripts/test-pipeline.ts ./samples/call.mp3
 *
 * Needs in .env.local (or .env): DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY, ASSEMBLYAI_API_KEY, ANTHROPIC_API_KEY
 */
import "./load-env";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { analyzeCall } from "@/lib/call-analysis";
import { advanceCallQueue } from "@/lib/call-pipeline";
import { AUDIO_MIME_BY_EXT, CALL_BUCKET, fileExt, type AnalysisProgress } from "@/lib/calls";
import { prisma } from "@/lib/prisma";
import { supabase } from "@/lib/supabase";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const log = (step: string, msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${step.padEnd(10)} ${msg}`);
const elapsed = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)}s`;

async function main() {
    const filePath = process.argv[2];
    if (!filePath) throw new Error("Pass a path to an audio file");
    const originalName = basename(filePath);
    const ext = fileExt(originalName);
    const contentType = AUDIO_MIME_BY_EXT[ext];
    if (!contentType) throw new Error(`Unsupported extension: ${ext}`);

    const id = randomUUID();
    const audioPath = `${id}.${ext}`;
    const { error } = await supabase.storage.from(CALL_BUCKET).upload(audioPath, await readFile(filePath), { contentType });
    if (error) throw new Error(`Upload failed: ${error.message}`);

    const company = await prisma.company.findFirstOrThrow({ orderBy: { name: "asc" } });
    await prisma.call.create({ data: { id, companyId: company.id, originalName, audioPath } });
    log("upload", `Call ${id} for ${company.name}`);

    const started = Date.now();
    for (;;) {
        await advanceCallQueue();
        const { status, errorDetail } = await prisma.call.findUniqueOrThrow({ where: { id }, select: { status: true, errorDetail: true } });
        if (status === "TRANSCRIBED") break;
        if (status === "FAILED") throw new Error(`Transcription failed: ${errorDetail}`);
        if (Date.now() - started > POLL_TIMEOUT_MS) throw new Error("Transcription timed out");
        log("transcribe", status);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    log("transcribe", `done in ${elapsed(started)}`);

    // claimNextAnalysis takes the oldest TRANSCRIBED call, which may not be this one, so claim this call the same way.
    const rubricSet = await prisma.rubricSet.findFirstOrThrow({ where: { status: "ACTIVE" }, select: { id: true } });
    const progress: AnalysisProgress = { stage: "classifying", attempt: 1 };
    const { count } = await prisma.call.updateMany({
        where: { id, status: "TRANSCRIBED" },
        data: { status: "ANALYZING", rubricSetId: rubricSet.id, analysisProgress: progress },
    });
    if (!count) throw new Error("Another process claimed the call (is the Calls page open?)");

    const analyzeStarted = Date.now();
    await analyzeCall(id);
    log("analyze", `done in ${elapsed(analyzeStarted)}`);

    const call = await prisma.call.findUniqueOrThrow({
        where: { id },
        include: { criteria: true, policyViolations: { orderBy: { policyIndex: "asc" } } },
    });
    const attempts = (call.analysisRaw as { attempts?: unknown[] } | null)?.attempts ?? [];
    console.log({
        status: call.status,
        errorDetail: call.errorDetail,
        scorecard: call.scorecard,
        category: call.category,
        subtype: call.subtype,
        outcome: call.outcome,
        repName: call.repName,
        points: call.maxPoints === null ? null : `${call.points}/${call.maxPoints}`,
        score: call.score,
        tier: call.tier,
        warnings: call.analysisWarnings,
        failedAttempts: attempts,
    });
    for (const c of call.criteria) console.log(`  ${c.result.padEnd(4)} ${c.source.padEnd(9)} ${c.criterionId}: ${c.rationale ?? ""}`);
    for (const v of call.policyViolations) console.log(`  POLICY ${v.policyIndex}: ${v.rule} — ${v.explanation}`);
    if (call.status !== "DONE") process.exitCode = 1;
}

main()
    .catch((err) => {
        console.error("\nFAILED:", err instanceof Error ? err.message : err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
