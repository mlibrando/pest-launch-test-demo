import { z } from "zod";
import { categoryForCallType, OUTCOMES_BY_CATEGORY, type Utterance } from "@/lib/calls";
import { verifyQuote } from "@/lib/evidence";
import type { RubricData } from "@/lib/rubrics";

export type Condition = { id: string; appliesWhen: string; criteria: { callType: string; criterionId: string }[] };

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
        agentSpeaker: z.string(),
        scorecard: z.enum([...rubric.scorecards.map((s) => s.callType), NOT_SCORABLE]),
        subtype: z.string().describe("snake_case label for what the call is about, e.g. new_quote, scheduling, billing, cancellation, voicemail"),
        direction: z.enum(["INBOUND", "OUTBOUND", "UNKNOWN"]),
        repName: z.string().nullable(),
        outcome: z.enum(ALL_OUTCOMES).nullable(),
        outcomeReason: z.string().nullable(),
        details: z.object({
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

export function checkClassification(c: Classification, transcript: Utterance[], rubric: RubricData): string[] {
    const problems: string[] = [];
    const speakers = [...new Set(transcript.map((u) => u.speaker))];
    if (!speakers.includes(c.agentSpeaker)) {
        problems.push(`agentSpeaker "${c.agentSpeaker}" is not a speaker in the transcript; use one of ${speakers.join(", ")}`);
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
