import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    assessmentSchema,
    checkAssessment,
    checkClassification,
    classificationSchema,
    conditionsFor,
    type Assessment,
    type Classification,
} from "@/lib/analysis-schemas";
import type { Utterance } from "@/lib/calls";
import { outputFormat } from "@/lib/llm";
import type { RubricData } from "@/lib/rubrics";

const criterion = (id: string, appliesWhen?: string) => ({
    id,
    quadrant: "Q1",
    label: id,
    qualityBar: "bar",
    sourceRef: "p1",
    ...(appliesWhen && { appliesWhen, ifNotApplicable: "auto_pass" as const }),
});

const rubric: RubricData = {
    scorecards: [
        {
            callType: "Sales Calls",
            thresholds: { gold: 3, green: 2 },
            criteria: [criterion("greet"), criterion("price", "The customer asks about price"), criterion("pest", " Customer mentions a pest ")],
        },
        {
            callType: "All Calls (non-cancel)",
            thresholds: { gold: 2 },
            criteria: [criterion("greet"), criterion("price", "The customer asks about price ")],
        },
    ],
    policies: [{ rule: "Never promise a price before inspection" }],
    conflicts: [],
    placeholders: [],
};

const transcript: Utterance[] = [
    { i: 0, speaker: "A", startMs: 0, endMs: 1000, text: "Thanks for calling Acme Pest, this is Sam." },
    { i: 1, speaker: "B", startMs: 1000, endMs: 2000, text: "Hi, I have ants in the kitchen. How much is a treatment?" },
    { i: 2, speaker: "A", startMs: 2000, endMs: 3000, text: "A one-time treatment is 199 and I can book you Tuesday." },
    { i: 3, speaker: "B", startMs: 3000, endMs: 4000, text: "Great, let's do Tuesday." },
];

const classification = (): Classification => ({
    agentSpeaker: "A",
    scorecard: "Sales Calls",
    subtype: "new_quote",
    direction: "INBOUND",
    repName: "Sam",
    outcome: "BOOKED",
    outcomeReason: "Booked a treatment for Tuesday",
    details: { pestType: "ants", serviceRequested: "one-time treatment", priceQuoted: "199", followUp: null },
    conditions: [
        { id: "c0", applies: true, evidence: { utterance: 1, quote: "how much is a treatment" } },
        { id: "c1", applies: true, evidence: { utterance: 1, quote: "I have ants in the kitchen" } },
    ],
});

const criterionIds = ["greet", "price"];

const assessment = (): Assessment => ({
    criteria: [
        { criterionId: "greet", verdict: "MET", rationale: "Greeted", evidence: [{ utterance: 0, quote: "thanks for calling Acme Pest" }] },
        { criterionId: "price", verdict: "NOT_MET", rationale: "No value framing", evidence: [] },
    ],
    summary: "Customer booked an ant treatment.",
    coaching: { strengths: [{ text: "Warm greeting", utterance: 0 }], improvements: [{ text: "Explain value", utterance: null }] },
    policyViolations: [{ policyIndex: 0, explanation: "Quoted a price", evidence: [{ utterance: 2, quote: "treatment is 199" }] }],
});

const checkA = (a: Assessment) => checkAssessment(a, transcript, criterionIds, "A", rubric.policies.length);

describe("conditionsFor", () => {
    it("collapses shared appliesWhen texts into one condition, in first-seen order", () => {
        assert.deepEqual(conditionsFor(rubric), [
            {
                id: "c0",
                appliesWhen: "The customer asks about price",
                criteria: [
                    { callType: "Sales Calls", criterionId: "price" },
                    { callType: "All Calls (non-cancel)", criterionId: "price" },
                ],
            },
            { id: "c1", appliesWhen: "Customer mentions a pest", criteria: [{ callType: "Sales Calls", criterionId: "pest" }] },
        ]);
    });
});

type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; required?: string[]; additionalProperties?: boolean } & Record<string, unknown>;

/** Every object in the schema is closed and requires all of its properties. */
function assertStrict(node: unknown) {
    if (Array.isArray(node)) return node.forEach(assertStrict);
    if (!node || typeof node !== "object") return;
    const schema = node as JsonSchema;
    if (schema.type === "object") {
        assert.equal(schema.additionalProperties, false);
        assert.deepEqual([...(schema.required ?? [])].sort(), Object.keys(schema.properties ?? {}).sort());
    }
    Object.values(schema).forEach(assertStrict);
}

describe("outputFormat", () => {
    it("accepts the classification schema and produces a strict schema", () => {
        const { schema } = outputFormat(classificationSchema(rubric));
        assertStrict(schema);
        assert.match(JSON.stringify(schema), /All Calls \(non-cancel\).*NOT_SCORABLE/);
    });

    it("keeps enums for the API to enforce", () => {
        const { properties } = outputFormat(classificationSchema(rubric)).schema as JsonSchema;
        assert.deepEqual(properties?.direction.enum, ["INBOUND", "OUTBOUND", "UNKNOWN"]);
        assert.ok((properties?.scorecard.enum as string[]).includes("NOT_SCORABLE"));
        assert.match(JSON.stringify(properties?.outcome), /"enum":\["BOOKED"/);
    });

    it("accepts the assessment schema with and without policies", () => {
        const withPolicies = outputFormat(assessmentSchema(criterionIds, true)).schema as JsonSchema;
        assertStrict(withPolicies);
        assert.ok(withPolicies.properties?.policyViolations);
        const without = outputFormat(assessmentSchema(criterionIds, false)).schema as JsonSchema;
        assertStrict(without);
        assert.equal(without.properties?.policyViolations, undefined);
    });

    it("accepts empty id lists", () => {
        const empty = { ...rubric, scorecards: [{ callType: "Sales", thresholds: {}, criteria: [criterion("x")] }] };
        assertStrict(outputFormat(classificationSchema(empty)).schema);
        assertStrict(outputFormat(assessmentSchema([], false)).schema);
    });
});

describe("schemas", () => {
    it("parse valid objects", () => {
        assert.ok(classificationSchema(rubric).safeParse(classification()).success);
        assert.ok(assessmentSchema(criterionIds, true).safeParse(assessment()).success);
    });

    it("reject a criterion id that is not applicable", () => {
        const a = assessment();
        a.criteria[0].criterionId = "pest";
        assert.equal(assessmentSchema(criterionIds, true).safeParse(a).success, false);
    });
});

describe("checkClassification", () => {
    const check = (c: Classification) => checkClassification(c, transcript, rubric);

    it("returns no problems for a valid classification", () => {
        assert.deepEqual(check(classification()), []);
    });

    it("rejects an agentSpeaker who is not in the transcript", () => {
        assert.deepEqual(check({ ...classification(), agentSpeaker: "C" }), [
            `agentSpeaker "C" is not a speaker in the transcript; use one of A, B`,
        ]);
    });

    it("rejects an outcome that is not valid for the category", () => {
        assert.deepEqual(check({ ...classification(), outcome: "SAVED" }), [
            `outcome SAVED is not valid for scorecard "Sales Calls"; use one of BOOKED, NOT_BOOKED, or null`,
        ]);
        assert.deepEqual(check({ ...classification(), scorecard: "All Calls (non-cancel)", outcome: "RESOLVED" }), []);
    });

    it("requires a null outcome for NOT_SCORABLE", () => {
        assert.deepEqual(check({ ...classification(), scorecard: "NOT_SCORABLE" }), ["outcome must be null when scorecard is NOT_SCORABLE"]);
        assert.deepEqual(check({ ...classification(), scorecard: "NOT_SCORABLE", outcome: null }), []);
    });

    it("requires every condition to be answered exactly once", () => {
        const c = classification();
        c.conditions = [c.conditions[0], c.conditions[0]];
        assert.deepEqual(check(c), [
            "condition c1 is missing; answer it exactly once",
            "condition c0 is answered more than once; answer it exactly once",
        ]);
    });

    it("requires evidence when a condition applies", () => {
        const c = classification();
        c.conditions[1] = { id: "c1", applies: true, evidence: null };
        assert.deepEqual(check(c), ["condition c1 applies but has no evidence; quote the words that show it applies"]);
        c.conditions[1] = { id: "c1", applies: false, evidence: null };
        assert.deepEqual(check(c), []);
    });

    it("verifies condition evidence from any speaker", () => {
        const c = classification();
        c.conditions[0].evidence = { utterance: 1, quote: "how much is the treatment" };
        assert.deepEqual(check(c), [`condition c0: utterance 1: quote "how much is the treatment" not found verbatim; copy the speaker's exact words`]);
    });
});

describe("checkAssessment", () => {
    it("returns no problems for a valid assessment", () => {
        assert.deepEqual(checkA(assessment()), []);
        assert.deepEqual(checkAssessment({ ...assessment(), policyViolations: undefined }, transcript, criterionIds, "A", 0), []);
    });

    it("rejects a missing criterion", () => {
        const a = assessment();
        a.criteria.pop();
        assert.deepEqual(checkA(a), ["criterion price is missing; answer it exactly once"]);
    });

    it("rejects a duplicate criterion", () => {
        const a = assessment();
        a.criteria.push(a.criteria[1]);
        assert.deepEqual(checkA(a), ["criterion price is answered more than once; answer it exactly once"]);
    });

    it("rejects MET without evidence", () => {
        const a = assessment();
        a.criteria[0].evidence = [];
        assert.deepEqual(checkA(a), ["criterion greet is MET but has no evidence; quote the rep's words that meet it, or mark it NOT_MET"]);
    });

    it("rejects a quote that does not verify", () => {
        const a = assessment();
        a.criteria[0].evidence = [{ utterance: 0, quote: "thank you for calling Acme" }];
        assert.deepEqual(checkA(a), [`criterion greet: utterance 0: quote "thank you for calling Acme" not found verbatim; copy the speaker's exact words`]);
    });

    it("rejects a quote from the wrong speaker, in criteria and policies", () => {
        const a = assessment();
        a.criteria[1].evidence = [{ utterance: 1, quote: "I have ants" }];
        a.policyViolations![0].evidence = [{ utterance: 3, quote: "let's do Tuesday" }];
        assert.deepEqual(checkA(a), [
            "criterion price: utterance 1 is spoken by Speaker B, not Speaker A; quote only Speaker A's words",
            "policyViolations[0]: utterance 3 is spoken by Speaker B, not Speaker A; quote only Speaker A's words",
        ]);
    });

    it("rejects a policyIndex out of range and a violation without evidence", () => {
        const a = assessment();
        a.policyViolations = [{ policyIndex: 1, explanation: "x", evidence: [] }];
        assert.deepEqual(checkA(a), [
            "policyViolations[0]: policyIndex 1 does not exist; use an index between 0 and 0",
            "policyViolations[0] has no evidence; quote the rep's words that break the policy, or remove it",
        ]);
    });

    it("rejects a coaching note that points at a missing utterance", () => {
        const a = assessment();
        a.coaching.improvements[0].utterance = 7;
        assert.deepEqual(checkA(a), ["coaching.improvements[0]: utterance 7 does not exist; use an index between 0 and 3, or null"]);
    });
});
