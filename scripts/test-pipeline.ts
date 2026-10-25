/**
 * End-to-end pipeline smoke test: upload -> transcribe -> analyze -> save.
 *
 * Usage:
 *   yarn tsx scripts/test-pipeline.ts ./samples/call.mp3
 *
 * Needs in .env.local (or .env): DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY,
 * ASSEMBLYAI_API_KEY, ANTHROPIC_API_KEY
 */
import "./load-env";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { AssemblyAI } from "assemblyai";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const BUCKET = "call-recordings";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;
const CLAUDE_MODEL = "claude-sonnet-5-5";
const RUBRIC_VERSION = "v0-placeholder";

const MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".flac": "audio/flac",
};

// ---------------------------------------------------------------------------
// Taxonomy + rubric. Placeholder criteria: replace with the ones from the brief.
// ---------------------------------------------------------------------------
const CATEGORIES = ["SALES", "RETENTION", "SERVICE", "NOT_SCORABLE"] as const;
type Category = (typeof CATEGORIES)[number];

const OUTCOMES_BY_CATEGORY: Record<Category, string[]> = {
  SALES: ["BOOKED", "NOT_BOOKED"],
  RETENTION: ["SAVED", "LOST"],
  SERVICE: ["RESOLVED", "UNRESOLVED"],
  NOT_SCORABLE: [],
};
const ALL_OUTCOMES = [...new Set(Object.values(OUTCOMES_BY_CATEGORY).flat())];

type Criterion = { id: string; label: string; appliesTo: Category[] };
const CRITERIA: Criterion[] = [
  { id: "greeting", label: "Professional greeting with company name and rep name", appliesTo: ["SALES", "RETENTION", "SERVICE"] },
  { id: "discovery", label: "Asked about the pest problem, property and urgency before quoting", appliesTo: ["SALES"] },
  { id: "value_before_price", label: "Explained service value before stating price", appliesTo: ["SALES", "RETENTION"] },
  { id: "objection_handling", label: "Acknowledged and addressed objections instead of conceding", appliesTo: ["SALES", "RETENTION"] },
  { id: "asked_for_booking", label: "Directly asked to book or confirm the appointment", appliesTo: ["SALES"] },
  { id: "retention_offer", label: "Explored reason for cancelling and offered an alternative", appliesTo: ["RETENTION"] },
  { id: "issue_resolution", label: "Confirmed the customer's issue and gave a concrete resolution", appliesTo: ["SERVICE"] },
  { id: "next_steps", label: "Clearly stated next steps before ending the call", appliesTo: ["SALES", "RETENTION", "SERVICE"] },
];
const CRITERION_IDS = CRITERIA.map((c) => c.id);

// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false },
});
const assembly = new AssemblyAI({ apiKey: requireEnv("ASSEMBLYAI_API_KEY") });
const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });

const log = (step: string, msg: string) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${step.padEnd(10)} ${msg}`);

type Utterance = { i: number; speaker: string; startMs: number; endMs: number; text: string };

type Analysis = {
  agentSpeaker: string;
  category: Category;
  subtype: string;
  direction: "INBOUND" | "OUTBOUND" | "UNKNOWN";
  repName: string | null;
  outcome: string | null;
  outcomeReason: string | null;
  summary: string;
  details: Record<string, unknown>;
  coaching: { strengths: string[]; improvements: string[] };
  criteria: { criterionId: string; result: "PASS" | "FAIL" | "NA"; evidence: string | null; utterance: number | null }[];
};

const analysisTool: Anthropic.Tool = {
  name: "record_call_analysis",
  description: "Record the structured analysis of a pest control company phone call.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      agentSpeaker: { type: "string", description: "Speaker label of the company's rep, e.g. A or B" },
      category: { type: "string", enum: [...CATEGORIES] },
      subtype: {
        type: "string",
        description: "Short snake_case label, e.g. new_quote, scheduling, billing, cancellation, voicemail, wrong_number",
      },
      direction: { type: "string", enum: ["INBOUND", "OUTBOUND", "UNKNOWN"] },
      repName: { type: ["string", "null"], description: "Rep's name only if said in the call, otherwise null" },
      outcome: {
        anyOf: [{ type: "string", enum: ALL_OUTCOMES }, { type: "null" }],
        description:
          "SALES: BOOKED|NOT_BOOKED. RETENTION: SAVED|LOST. SERVICE: RESOLVED|UNRESOLVED. NOT_SCORABLE: null.",
      },
      outcomeReason: { type: ["string", "null"], description: "One sentence on why the call ended this way" },
      summary: { type: "string", description: "2-4 sentence summary" },
      details: {
        type: "object",
        properties: {
          pestType: { type: ["string", "null"] },
          serviceRequested: { type: ["string", "null"] },
          priceQuoted: { type: ["string", "null"] },
          followUp: { type: ["string", "null"] },
        },
        required: ["pestType", "serviceRequested", "priceQuoted", "followUp"],
        additionalProperties: false,
      },
      coaching: {
        type: "object",
        properties: {
          strengths: { type: "array", items: { type: "string" } },
          improvements: { type: "array", items: { type: "string" } },
        },
        required: ["strengths", "improvements"],
        additionalProperties: false,
      },
      criteria: {
        type: "array",
        description: "One entry per criterion in the rubric. Empty array if category is NOT_SCORABLE.",
        items: {
          type: "object",
          properties: {
            criterionId: { type: "string", enum: CRITERION_IDS },
            result: { type: "string", enum: ["PASS", "FAIL", "NA"] },
            evidence: { type: ["string", "null"], description: "Short paraphrase of the supporting moment" },
            utterance: { type: ["integer", "null"], description: "Index [i] of the supporting utterance" },
          },
          required: ["criterionId", "result", "evidence", "utterance"],
          additionalProperties: false,
        },
      },
    },
    required: [
      "agentSpeaker", "category", "subtype", "direction", "repName", "outcome",
      "outcomeReason", "summary", "details", "coaching", "criteria",
    ],
    additionalProperties: false,
  },
};

function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Drops anything the model got wrong instead of trusting it blindly. Returns warnings. */
function sanitize(a: Analysis, utteranceCount: number): string[] {
  const warnings: string[] = [];

  const validOutcomes = OUTCOMES_BY_CATEGORY[a.category];
  if (a.outcome && !validOutcomes.includes(a.outcome)) {
    warnings.push(`outcome ${a.outcome} invalid for ${a.category}, set to null`);
    a.outcome = null;
  }

  if (a.category === "NOT_SCORABLE") {
    if (a.criteria.length) warnings.push("criteria returned for NOT_SCORABLE call, dropped");
    a.criteria = [];
    return warnings;
  }

  const applicable = new Set(CRITERIA.filter((c) => c.appliesTo.includes(a.category)).map((c) => c.id));
  const seen = new Set<string>();
  a.criteria = a.criteria.filter((c) => {
    if (!applicable.has(c.criterionId)) {
      warnings.push(`criterion ${c.criterionId} not applicable to ${a.category}, dropped`);
      return false;
    }
    if (seen.has(c.criterionId)) {
      warnings.push(`duplicate criterion ${c.criterionId}, dropped`);
      return false;
    }
    seen.add(c.criterionId);
    if (c.utterance !== null && (c.utterance < 0 || c.utterance >= utteranceCount)) {
      warnings.push(`criterion ${c.criterionId} cites utterance ${c.utterance} out of range, cleared`);
      c.utterance = null;
    }
    return true;
  });

  for (const id of applicable) {
    if (!seen.has(id)) warnings.push(`criterion ${id} missing from model output`);
  }
  return warnings;
}

/** Pass rate over scorable criteria, 0-100. NA excluded. */
function computeScore(a: Analysis): number | null {
  if (a.category === "NOT_SCORABLE") return null;
  const scored = a.criteria.filter((c) => c.result !== "NA");
  if (!scored.length) return null;
  const passed = scored.filter((c) => c.result === "PASS").length;
  return Math.round((passed / scored.length) * 1000) / 10;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Pass a path to an audio file");

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_BY_EXT[ext];
  if (!contentType) throw new Error(`Unsupported extension: ${ext}`);

  const originalName = basename(filePath);
  const audioPath = `test/${randomUUID()}${ext}`;
  const buffer = await readFile(filePath);
  log("upload", `${originalName} (${(buffer.length / 1024 / 1024).toFixed(1)} MB) -> ${audioPath}`);

  // 1. Upload
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(audioPath, buffer, { contentType, upsert: false });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const company = await prisma.company.findFirstOrThrow({ orderBy: { name: "asc" } });
  const call = await prisma.call.create({ data: { companyId: company.id, originalName, audioPath, status: "UPLOADED" } });
  log("db", `Call ${call.id}`);

  let stage = "transcribe";
  try {
    // 2. Signed URL -> AssemblyAI
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(audioPath, 60 * 60);
    if (signError || !signed) throw new Error(`Signed URL failed: ${signError?.message}`);

    const submitted = await assembly.transcripts.submit({
      audio_url: signed.signedUrl,
      speaker_labels: true,
    });
    await prisma.call.update({
      where: { id: call.id },
      data: { status: "TRANSCRIBING", assemblyId: submitted.id },
    });
    log("transcribe", `Submitted ${submitted.id}`);

    // 3. Poll (same check your lazy polling route will do)
    const started = Date.now();
    let transcript = submitted;
    while (transcript.status !== "completed") {
      if (transcript.status === "error") throw new Error(`AssemblyAI error: ${transcript.error}`);
      if (Date.now() - started > POLL_TIMEOUT_MS) throw new Error("Transcription timed out");
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      transcript = await assembly.transcripts.get(submitted.id);
      log("transcribe", transcript.status);
    }

    const utterances: Utterance[] = (transcript.utterances ?? []).map((u, i) => ({
      i,
      speaker: u.speaker,
      startMs: u.start,
      endMs: u.end,
      text: u.text,
    }));
    if (!utterances.length) throw new Error("Transcript has no utterances");

    const speakers = new Set(utterances.map((u) => u.speaker));
    log("transcribe", `${utterances.length} utterances, ${speakers.size} speakers, ${transcript.audio_duration}s`);

    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: "TRANSCRIBED",
        transcript: utterances,
        durationSec: transcript.audio_duration ? Math.round(transcript.audio_duration) : null,
      },
    });

    stage = "analyze";
    await prisma.call.update({ where: { id: call.id }, data: { status: "ANALYZING" } });

    const transcriptText = utterances
      .map((u) => `[${u.i}] Speaker ${u.speaker} (${formatTimestamp(u.startMs)}): ${u.text}`)
      .join("\n");

    const rubricText = CRITERIA.map((c) => `- ${c.id} (${c.appliesTo.join(", ")}): ${c.label}`).join("\n");

    const t0 = Date.now();
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      tools: [analysisTool],
      tool_choice: { type: "auto" },
      system: [
        "You analyze recorded phone calls for a pest control company.",
        `Always respond by calling the ${analysisTool.name} tool exactly once with your analysis.`,
        "Speaker labels are automatic and unnamed; work out which speaker is the company's rep from context.",
        "Base every judgment on what was actually said. Do not infer a rep name, price or pest type that wasn't stated.",
        "Voicemails, wrong numbers, and calls too short to judge are NOT_SCORABLE.",
        "For scorable calls, return exactly one result for each criterion that applies to the call's category. Use NA when the situation never came up (e.g. no objections raised).",
        "Cite the utterance index [i] that best supports each criterion result.",
        "",
        "Rubric (criterion id, applicable categories, description):",
        rubricText,
      ].join("\n"),
      messages: [{ role: "user", content: `<transcript>\n${transcriptText}\n</transcript>\n\nAnalyze this call.` }],
    });

    if (response.stop_reason === "max_tokens") throw new Error("Analysis truncated at max_tokens");
    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error(`No tool_use block (stop_reason: ${response.stop_reason})`);
    }
    log(
      "analyze",
      `${((Date.now() - t0) / 1000).toFixed(1)}s, ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`,
    );

    const analysis = toolUse.input as Analysis;
    const warnings = sanitize(analysis, utterances.length);
    for (const w of warnings) log("warn", w);

    const score = computeScore(analysis);

    // 5. Save: replace criteria atomically so re-runs don't duplicate
    stage = "save";
    await prisma.$transaction([
      prisma.criterionResult.deleteMany({ where: { callId: call.id } }),
      prisma.criterionResult.createMany({
        data: analysis.criteria.map((c) => ({
          callId: call.id,
          criterionId: c.criterionId,
          result: c.result,
          evidence: c.evidence,
          utterance: c.utterance,
        })),
      }),
      prisma.call.update({
        where: { id: call.id },
        data: {
          status: "DONE",
          agentSpeaker: analysis.agentSpeaker,
          category: analysis.category,
          subtype: analysis.subtype,
          direction: analysis.direction,
          repName: analysis.repName,
          outcome: analysis.outcome,
          outcomeReason: analysis.outcomeReason,
          summary: analysis.summary,
          details: analysis.details as object,
          coaching: analysis.coaching,
          score,
          // rubricVersion: RUBRIC_VERSION,  // uncomment once the column exists
          failedStage: null,
          errorDetail: null,
        },
      }),
    ]);

    log("done", `Call ${call.id} DONE, score ${score ?? "n/a"} (rubric ${RUBRIC_VERSION})`);
    console.log("\n--- Transcript (first 10 lines) ---");
    console.log(transcriptText.split("\n").slice(0, 10).join("\n"));
    console.log("\n--- Analysis ---");
    console.log(JSON.stringify({ ...analysis, score }, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.call.update({
      where: { id: call.id },
      data: { status: "FAILED", failedStage: stage, errorDetail: message },
    });
    throw err;
  }
}

main()
  .catch((err) => {
    console.error("\nFAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
