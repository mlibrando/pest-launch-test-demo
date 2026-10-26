import { z } from "zod";
import { categoryForCallType, OUTCOMES_BY_CATEGORY, type Quote, type Utterance } from "@/lib/calls";
import { relocateQuote, speakersWhoSay, verifyQuote } from "@/lib/evidence";
import type { RubricData } from "@/lib/rubrics";

type Condition = { id: string; appliesWhen: string; criteria: { callType: string; criterionId: string }[] };

export function conditionsFor(rubric: RubricData): Condition[] {
    const byText = new Map<string, Condition>();
    for (const scorecard of rubric.scorecards) {
        for (const criterion of scorecard.criteria) {
            const appliesWhen = criterion.appliesWhen?.trim();
            if (!appliesWhen) continue;
            let condition = byText.get(appliesWhen);
            if (!condition) {
                condition = { id: `c${byText.size}`, appliesWhen, criteria: [] };
                byText.set(appliesWhen, condition);
            }
            condition.criteria.push({ callType: scorecard.callType, criterionId: criterion.id });
        }
    }
    return [...byText.values()];
}

const NOT_SCORABLE = "NOT_SCORABLE";
const ALL_OUTCOMES = [...new Set(Object.values(OUTCOMES_BY_CATEGORY).flat())];

// z.enum needs at least one value; with none, the check functions reject whatever ids come back.
const idEnum = (ids: string[]) => (ids.length ? z.enum(ids) : z.string());

const quoteSchema = z.object({
    utterance: z.number().int().describe("The [i] index of the utterance the quote comes from"),
    quote: z.string().describe("At least 3 consecutive words copied exactly from that utterance"),
});

const noteSchema = z.object({
    text: z.string(),
    utterance: z.number().int().nullable().describe("The [i] index of the utterance this note is about, or null"),
});

export function classificationSchema(rubric: RubricData) {
    return z.object({
        // Evidence comes before each decision so the model reasons before it decides.
        directionEvidence: quoteSchema
            .nullable()
            .describe("The line that shows who placed the call, such as why the rep says they're calling; null only when direction is UNKNOWN"),
        direction: z.enum(["INBOUND", "OUTBOUND", "UNKNOWN"]),
        agentEvidence: quoteSchema
            .nullable()
            .describe("A line only the rep would say, such as their self-introduction or the company greeting; null only for NOT_SCORABLE calls"),
        agentSpeaker: z.string(),
        repName: z.string().nullable(),
        scorecard: z.enum([...rubric.scorecards.map((s) => s.callType), NOT_SCORABLE]),
        subtype: z.string().describe("snake_case label for what the call is about, e.g. new_quote, scheduling, billing, cancellation, voicemail"),
        outcome: z.enum(ALL_OUTCOMES).nullable(),
        outcomeReason: z.string().nullable(),
        details: z.object({
            customerName: z.string().nullable().describe("The customer's name as they or the rep said it"),
            pestType: z.string().nullable(),
            serviceRequested: z.string().nullable(),
            priceQuoted: z.string().nullable(),
            followUp: z.string().nullable(),
        }),
        conditions: z.array(
            z.object({
                id: idEnum(conditionsFor(rubric).map((c) => c.id)),
                applies: z.boolean(),
                evidence: quoteSchema.nullable(),
            }),
        ),
    });
}

export type Classification = z.infer<ReturnType<typeof classificationSchema>>;

const fullAssessmentSchema = (criterionIds: string[]) =>
    z.object({
        criteria: z.array(
            z.object({
                criterionId: idEnum(criterionIds),
                // Evidence and rationale come before the verdict so the model reasons before it decides.
                evidence: z.array(quoteSchema),
                rationale: z.string().describe("Why the rep did or didn't meet the quality bar, citing what they said"),
                verdict: z.enum(["MET", "NOT_MET"]),
            }),
        ),
        summary: z.string(),
        coaching: z.object({ strengths: z.array(noteSchema), improvements: z.array(noteSchema) }),
        policyViolations: z.array(z.object({ policyIndex: z.number().int(), evidence: z.array(quoteSchema), explanation: z.string() })),
    });

type FullAssessment = z.infer<ReturnType<typeof fullAssessmentSchema>>;
export type Assessment = Omit<FullAssessment, "policyViolations"> & Partial<Pick<FullAssessment, "policyViolations">>;

export function assessmentSchema(criterionIds: string[], hasPolicies: boolean) {
    const schema = fullAssessmentSchema(criterionIds);
    return hasPolicies ? schema : schema.omit({ policyViolations: true });
}

const duplicates = (values: string[]) => [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];

/** Problems with ids that must each be answered exactly once. */
function answeredOnce(label: string, answered: string[], expected: string[]): string[] {
    return [
        ...expected.filter((id) => !answered.includes(id)).map((id) => `${label} ${id} is missing; answer it exactly once`),
        ...duplicates(answered).map((id) => `${label} ${id} is answered more than once; answer it exactly once`),
        ...[...new Set(answered.filter((id) => !expected.includes(id)))].map((id) => `${label} ${id} does not exist; remove it`),
    ];
}

/** Fixes quotes cited to the wrong line, so a right quote with a wrong index doesn't cost a retry. */
export function relocateClassificationQuotes(c: Classification, transcript: Utterance[]): Classification {
    return {
        ...c,
        directionEvidence: c.directionEvidence && relocateQuote(transcript, c.directionEvidence),
        agentEvidence: c.agentEvidence && relocateQuote(transcript, c.agentEvidence, c.agentSpeaker),
        conditions: c.conditions.map((cond) => ({ ...cond, evidence: cond.evidence && relocateQuote(transcript, cond.evidence) })),
    };
}

export function relocateAssessmentQuotes(a: Assessment, transcript: Utterance[], agentSpeaker: string): Assessment {
    const relocate = <Q extends Quote>(quotes: Q[]) => quotes.map((q) => relocateQuote(transcript, q, agentSpeaker));
    return {
        ...a,
        criteria: a.criteria.map((c) => ({ ...c, evidence: relocate(c.evidence) })),
        ...(a.policyViolations && { policyViolations: a.policyViolations.map((v) => ({ ...v, evidence: relocate(v.evidence) })) }),
    };
}

export function checkClassification(c: Classification, transcript: Utterance[], rubric: RubricData): string[] {
    const problems: string[] = [];
    const speakers = [...new Set(transcript.map((u) => u.speaker))];
    if (c.directionEvidence) {
        const problem = verifyQuote(transcript, c.directionEvidence);
        if (problem) problems.push(`directionEvidence: ${problem}`);
    } else if (c.direction !== "UNKNOWN") {
        problems.push(`directionEvidence is missing; quote the line that shows the call is ${c.direction}, or set direction to UNKNOWN`);
    }
    if (!speakers.includes(c.agentSpeaker)) {
        problems.push(`agentSpeaker "${c.agentSpeaker}" is not a speaker in the transcript; use one of ${speakers.join(", ")}`);
    } else if (c.agentEvidence) {
        const problem = verifyQuote(transcript, c.agentEvidence, c.agentSpeaker);
        if (problem) problems.push(`agentEvidence: ${problem}; if that line is the rep's, agentSpeaker is wrong`);
    } else if (c.scorecard !== NOT_SCORABLE) {
        problems.push("agentEvidence is missing; quote a line that shows which speaker is the rep");
    }
    // The rep says their own name when introducing themselves; the customer may also say it back, so only a name
    // the agentSpeaker never says is a contradiction.
    const namedBy = c.repName ? speakersWhoSay(transcript, c.repName) : [];
    if (speakers.includes(c.agentSpeaker) && namedBy.length && !namedBy.includes(c.agentSpeaker)) {
        problems.push(
            `repName "${c.repName}" is only said by Speaker ${namedBy.join(", ")}, never by agentSpeaker ${c.agentSpeaker}; the rep is the speaker who introduces themselves`,
        );
    }
    if (c.outcome !== null) {
        if (c.scorecard === NOT_SCORABLE) {
            problems.push(`outcome must be null when scorecard is ${NOT_SCORABLE}`);
        } else {
            const valid = OUTCOMES_BY_CATEGORY[categoryForCallType(c.scorecard)];
            if (!valid.includes(c.outcome)) {
                problems.push(`outcome ${c.outcome} is not valid for scorecard "${c.scorecard}"; use one of ${valid.join(", ")}, or null`);
            }
        }
    }
    const conditionIds = conditionsFor(rubric).map((cond) => cond.id);
    problems.push(...answeredOnce("condition", c.conditions.map((cond) => cond.id), conditionIds));
    for (const cond of c.conditions) {
        if (cond.evidence) {
            const problem = verifyQuote(transcript, cond.evidence);
            if (problem) problems.push(`condition ${cond.id}: ${problem}`);
        } else if (cond.applies) {
            problems.push(`condition ${cond.id} applies but has no evidence; quote the words that show it applies`);
        }
    }
    return problems;
}

export function checkAssessment(a: Assessment, transcript: Utterance[], criterionIds: string[], agentSpeaker: string, policyCount: number): string[] {
    const problems = answeredOnce("criterion", a.criteria.map((c) => c.criterionId), criterionIds);
    const quoteProblems = (label: string, quotes: Assessment["criteria"][number]["evidence"]) =>
        quotes.flatMap((q) => verifyQuote(transcript, q, agentSpeaker) ?? []).map((problem) => `${label}: ${problem}`);

    for (const c of a.criteria) {
        if (c.verdict === "MET" && c.evidence.length === 0) {
            problems.push(`criterion ${c.criterionId} is MET but has no evidence; quote the rep's words that meet it, or mark it NOT_MET`);
        }
        problems.push(...quoteProblems(`criterion ${c.criterionId}`, c.evidence));
    }
    for (const [n, v] of (a.policyViolations ?? []).entries()) {
        const label = `policyViolations[${n}]`;
        if (!Number.isInteger(v.policyIndex) || v.policyIndex < 0 || v.policyIndex >= policyCount) {
            problems.push(`${label}: policyIndex ${v.policyIndex} does not exist; use an index between 0 and ${policyCount - 1}`);
        }
        if (v.evidence.length === 0) problems.push(`${label} has no evidence; quote the rep's words that break the policy, or remove it`);
        problems.push(...quoteProblems(label, v.evidence));
    }
    const notes = [
        ...a.coaching.strengths.map((note, n) => [`coaching.strengths[${n}]`, note] as const),
        ...a.coaching.improvements.map((note, n) => [`coaching.improvements[${n}]`, note] as const),
    ];
    for (const [label, note] of notes) {
        if (note.utterance !== null && !transcript.some((u) => u.i === note.utterance)) {
            problems.push(`${label}: utterance ${note.utterance} does not exist; use an index between 0 and ${transcript.length - 1}, or null`);
        }
    }
    return problems;
}
