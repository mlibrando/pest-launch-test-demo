import "server-only";
import { Prisma } from "@/generated/prisma/client";
import {
    assessmentSchema,
    checkAssessment,
    checkClassification,
    classificationSchema,
    conditionsFor,
    type Assessment,
    type Classification,
} from "@/lib/analysis-schemas";
import { categoryForCallType, formatSeconds, OUTCOMES_BY_CATEGORY, type AnalysisProgress, type Utterance } from "@/lib/calls";
import { mentionedInTranscript, numbersInTranscript } from "@/lib/evidence";
import { HAIKU, OutputIssues, requestJson, retryNote, SONNET, withRetries, type AttemptLog } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import type { RubricData, Scorecard } from "@/lib/rubrics";
import { scoreScorecard, type ScoredCriterion } from "@/lib/scoring";
import { errorMessage } from "@/utils/error-message";

const NOT_SCORABLE = "NOT_SCORABLE";

type CriterionRow = ScoredCriterion & { rationale: string | null; quotes: Prisma.InputJsonValue | undefined; source: "MODEL" | "AUTO_PASS" | "EXCLUDED" };

const formatTranscript = (transcript: Utterance[]) =>
    transcript.map((u) => `[${u.i}] Speaker ${u.speaker} (${formatSeconds(u.startMs / 1000)}): ${u.text}`).join("\n");

const classificationPrompt = (companyName: string, rubric: RubricData) => `You classify phone calls to ${companyName}, a pest control company, before they are graded.

Pick the scorecard that fits the call:
${rubric.scorecards
    .map((s) => `- "${s.callType}" (outcome ${OUTCOMES_BY_CATEGORY[categoryForCallType(s.callType)].join(" or ")}): ${s.criteria.map((c) => c.label).join("; ")}`)
    .join("\n")}
- "${NOT_SCORABLE}": voicemail, wrong number, or too short to judge the rep. Set outcome to null.

Decide whether each condition applies to this call, whichever scorecard you pick:
${conditionsFor(rubric).map((c) => `- ${c.id}: ${c.appliesWhen}`).join("\n")}

Rules:
- agentSpeaker is the rep's speaker letter alone (e.g. "A", not "Speaker A").
- repName is the name the rep introduces themselves with, or null if they never say it.
- outcome is how the call ended, from the chosen scorecard's options, or null if it can't be told.
- details: only what was actually said; null when it wasn't discussed. priceQuoted uses the exact amounts spoken.
- A condition that applies needs evidence. Evidence quotes must be copied word for word from a single numbered line, at least 3 words, with "utterance" set to that line's [i].`;

const assessmentPrompt = (scorecard: Scorecard, policies: RubricData["policies"]) => `You grade a pest control rep's phone call against the "${scorecard.callType}" scorecard.

Criteria:
${scorecard.criteria.map((c) => `- ${c.id} (${c.quadrant}) ${c.label}: ${c.qualityBar}`).join("\n")}
${
    policies.length
        ? `
Policies (by policyIndex):
${policies.map((p, i) => `${i}. ${p.rule}`).join("\n")}
`
        : ""
}
Rules:
- Judge only the criteria you are asked to judge, and only on what the rep actually said.
- Go through the criteria one at a time. For each, find the rep's relevant lines, compare them to the quality bar, then decide.
- MET when the rep clearly does what the quality bar describes, even if the wording isn't perfect. NOT_MET when the step is missing, or the attempt is too vague to meet the quality bar.
- MET needs at least one quote of the rep's exact words that meet the quality bar. NOT_MET quotes are optional.
- Quotes must be copied word for word from a single numbered line spoken by the rep, at least 3 words, with "utterance" set to that line's [i].
${
    policies.length
        ? "- Flag a policy only when the transcript clearly shows the rep breaking it, with quotes of the rep's words. Ignore policies about a different call type, or about things a transcript can't show (tone, pace).\n"
        : ""
}- summary: 2-4 sentences on what happened on the call.
- coaching: specific strengths and improvements, each tied to an utterance index when there is one.
- Never output a score.`;

/** Drops extracted values the transcript doesn't support. These are warnings, not failures. */
function repairClassification(c: Classification, transcript: Utterance[]) {
    const warnings: string[] = [];
    let repName = c.repName?.trim() || null;
    if (repName && !mentionedInTranscript(transcript, repName)) {
        warnings.push(`repName "${repName}" is not in the transcript; dropped`);
        repName = null;
    }
    let { priceQuoted } = c.details;
    if (priceQuoted && !numbersInTranscript(transcript, priceQuoted)) {
        warnings.push(`priceQuoted "${priceQuoted}" has amounts not spoken in the transcript; dropped`);
        priceQuoted = null;
    }
    return { classification: { ...c, repName, details: { ...c.details, priceQuoted } }, warnings };
}

/** Criteria whose condition doesn't apply are settled in code; the rest go to the model. */
function splitCriteria(scorecard: Scorecard, rubric: RubricData, classification: Classification) {
    const applies = new Map(
        conditionsFor(rubric).map((cond) => [cond.appliesWhen, classification.conditions.find((c) => c.id === cond.id)?.applies ?? false]),
    );
    const settled: CriterionRow[] = [];
    const toAssess: string[] = [];
    for (const criterion of scorecard.criteria) {
        const appliesWhen = criterion.appliesWhen?.trim();
        if (!appliesWhen || applies.get(appliesWhen)) toAssess.push(criterion.id);
        else if (criterion.ifNotApplicable === "auto_pass") {
            settled.push({ criterionId: criterion.id, result: "PASS", rationale: null, quotes: undefined, source: "AUTO_PASS" });
        } else settled.push({ criterionId: criterion.id, result: "NA", rationale: null, quotes: undefined, source: "EXCLUDED" });
    }
    return { settled, toAssess };
}

async function setProgress(callId: string, progress: AnalysisProgress) {
    await prisma.call.updateMany({ where: { id: callId, status: "ANALYZING" }, data: { analysisProgress: progress } });
}

async function runAnalysis(callId: string, attempts: AttemptLog[]) {
    const call = await prisma.call.findUniqueOrThrow({
        where: { id: callId },
        select: {
            transcript: true,
            repId: true,
            rubricSet: { select: { data: true } },
            company: { select: { name: true, reps: { select: { id: true, name: true } } } },
        },
    });
    if (!call.rubricSet) throw new Error("Call has no rubric set");
    const transcript = call.transcript as Utterance[] | null;
    if (!transcript?.length) throw new Error("Call has no transcript");
    const rubric = call.rubricSet.data as RubricData;
    const transcriptBlock = `<transcript>\n${formatTranscript(transcript)}\n</transcript>`;

    const classify = await withRetries(
        "classify",
        async (_attempt, previous) => {
            const result = await requestJson(
                {
                    model: HAIKU,
                    max_tokens: 4096,
                    thinking: { type: "disabled" },
                    system: classificationPrompt(call.company.name, rubric),
                    messages: [{ role: "user", content: transcriptBlock + retryNote(previous) }],
                },
                classificationSchema(rubric),
            );
            const problems = checkClassification(result.data, transcript, rubric);
            if (problems.length) throw new OutputIssues(problems, result.output);
            return result;
        },
        attempts,
        (attempt) => setProgress(callId, { stage: "classifying", attempt }),
    );
    const { classification, warnings } = repairClassification(classify.data, transcript);
    const scorecard = rubric.scorecards.find((s) => s.callType === classification.scorecard);

    let assess: { data: Assessment; usage: object } | undefined;
    let rows: CriterionRow[] = [];
    if (scorecard) {
        const { settled, toAssess } = splitCriteria(scorecard, rubric, classification);
        const { agentSpeaker, subtype, direction, outcome, outcomeReason, details } = classification;
        const context = `

The rep is Speaker ${agentSpeaker}.
Call: ${JSON.stringify({ subtype, direction, outcome, outcomeReason, details })}
Judge these criteria: ${toAssess.join(", ") || "none"}`;

        assess = await withRetries(
            "assess",
            async (_attempt, previous) => {
                const result = await requestJson(
                    {
                        model: SONNET,
                        max_tokens: 16000,
                        thinking: { type: "adaptive" },
                        output_config: { effort: "high" },
                        betas: ["server-side-fallback-2026-07-01"],
                        fallbacks: "default",
                        system: [{ type: "text", text: assessmentPrompt(scorecard, rubric.policies), cache_control: { type: "ephemeral" } }],
                        messages: [{ role: "user", content: transcriptBlock + context + retryNote(previous) }],
                    },
                    assessmentSchema(toAssess, rubric.policies.length > 0),
                );
                const problems = checkAssessment(result.data, transcript, toAssess, agentSpeaker, rubric.policies.length);
                if (problems.length) throw new OutputIssues(problems, result.output);
                return result;
            },
            attempts,
            (attempt) => setProgress(callId, { stage: "assessing", attempt }),
        );

        const verdicts = new Map(assess.data.criteria.map((c) => [c.criterionId, c]));
        const settledById = new Map(settled.map((r) => [r.criterionId, r]));
        rows = scorecard.criteria.map((criterion): CriterionRow => {
            const verdict = verdicts.get(criterion.id);
            if (!verdict) return settledById.get(criterion.id)!;
            return {
                criterionId: criterion.id,
                result: verdict.verdict === "MET" ? "PASS" : "FAIL",
                rationale: verdict.rationale,
                quotes: verdict.evidence,
                source: "MODEL",
            };
        });
    }

    const score = scorecard ? scoreScorecard(scorecard, rows) : null;
    const rep = call.repId ? undefined : call.company.reps.find((r) => r.name.toLowerCase() === classification.repName?.toLowerCase());

    await prisma.$transaction(async (tx) => {
        // A stale reset may have taken the call back; then this run's results are dropped.
        const { count } = await tx.call.updateMany({
            where: { id: callId, status: "ANALYZING" },
            data: {
                status: "DONE",
                agentSpeaker: classification.agentSpeaker,
                subtype: classification.subtype,
                direction: classification.direction,
                outcome: classification.outcome,
                outcomeReason: classification.outcomeReason,
                details: classification.details,
                ...(rep && { repName: rep.name, repId: rep.id }),
                category: scorecard ? categoryForCallType(scorecard.callType) : NOT_SCORABLE,
                scorecard: scorecard?.callType ?? null,
                summary: assess?.data.summary ?? null,
                coaching: assess?.data.coaching ?? Prisma.DbNull,
                points: score?.points ?? null,
                maxPoints: score?.maxPoints ?? null,
                score: score?.score ?? null,
                tier: score?.tier ?? null,
                analysisWarnings: warnings,
                analysisRaw: {
                    models: { classify: HAIKU, assess: SONNET },
                    classification: classify.data,
                    assessment: assess?.data ?? null,
                    attempts,
                    // SDK usage types are interfaces, which Prisma's JSON index-signature type doesn't accept.
                    usage: { classify: classify.usage, assess: assess?.usage ?? null } as unknown as Prisma.InputJsonObject,
                },
                analysisProgress: Prisma.DbNull,
            },
        });
        if (!count) return;
        await tx.criterionResult.deleteMany({ where: { callId } });
        await tx.policyViolation.deleteMany({ where: { callId } });
        await tx.criterionResult.createMany({ data: rows.map((r) => ({ callId, ...r })) });
        await tx.policyViolation.createMany({
            data: (assess?.data.policyViolations ?? []).map((v) => ({
                callId,
                policyIndex: v.policyIndex,
                rule: rubric.policies[v.policyIndex].rule ?? "",
                explanation: v.explanation,
                quotes: v.evidence,
            })),
        });
    });
}

/** Grades an ANALYZING call against its rubric snapshot. Never throws; always leaves the call DONE or FAILED. */
export async function analyzeCall(callId: string): Promise<void> {
    const attempts: AttemptLog[] = [];
    try {
        await runAnalysis(callId, attempts);
    } catch (err) {
        console.error(`Analysis failed for call ${callId}:`, err);
        try {
            await prisma.call.updateMany({
                where: { id: callId, status: "ANALYZING" },
                data: {
                    status: "FAILED",
                    failedStage: "analyze",
                    errorDetail: errorMessage(err),
                    analysisRaw: { attempts },
                    analysisProgress: Prisma.DbNull,
                },
            });
        } catch (saveErr) {
            console.error(`Could not mark call ${callId} as failed:`, saveErr);
        }
    }
}
