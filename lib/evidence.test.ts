import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Utterance } from "@/lib/calls";
import { mentionedInTranscript, normalize, numbersInTranscript, verifyQuote } from "@/lib/evidence";

const transcript: Utterance[] = [
    { i: 0, speaker: "A", startMs: 0, endMs: 1000, text: "Thanks for calling Acme Pest, this is Sam. How can I help?" },
    { i: 1, speaker: "B", startMs: 1000, endMs: 2000, text: "Hi Sam, I've got ants   in the KITCHEN." },
    { i: 2, speaker: "A", startMs: 2000, endMs: 3000, text: "I’ll get a technician out to you on Tuesday." },
    { i: 3, speaker: "A", startMs: 3000, endMs: 4000, text: "The quarterly plan is 1299 for the year." },
    { i: 4, speaker: "B", startMs: 4000, endMs: 5000, text: "That works for me, thank you." },
];

describe("normalize", () => {
    it("lowercases, strips punctuation, straightens quotes and collapses whitespace", () => {
        assert.equal(normalize("  “Hello,”   World!  I’ll  "), "hello world i'll");
    });
});

describe("verifyQuote", () => {
    it("ignores punctuation, case and extra whitespace", () => {
        assert.equal(verifyQuote(transcript, { utterance: 1, quote: "i've got ants in the kitchen" }), null);
        assert.equal(verifyQuote(transcript, { utterance: 0, quote: "THIS IS SAM how can I help" }), null);
    });

    it("treats curly and straight apostrophes alike and keeps contractions", () => {
        assert.equal(verifyQuote(transcript, { utterance: 2, quote: "I'll get a technician" }), null);
        assert.equal(verifyQuote(transcript, { utterance: 2, quote: "I’ll get a technician" }), null);
        assert.notEqual(verifyQuote(transcript, { utterance: 2, quote: "Ill get a technician" }), null);
    });

    it("accepts a quote that runs into the next utterance by the same speaker", () => {
        assert.equal(verifyQuote(transcript, { utterance: 2, quote: "on Tuesday. The quarterly plan" }, "A"), null);
    });

    it("rejects a quote that runs into the next utterance by a different speaker", () => {
        const problem = verifyQuote(transcript, { utterance: 3, quote: "for the year that works" });
        assert.match(problem ?? "", /utterance 3: .*not found verbatim/);
    });

    it("rejects the wrong speaker", () => {
        const problem = verifyQuote(transcript, { utterance: 1, quote: "got ants in the kitchen" }, "A");
        assert.match(problem ?? "", /utterance 1 is spoken by Speaker B, not Speaker A/);
    });

    it("rejects an index out of range", () => {
        assert.match(verifyQuote(transcript, { utterance: 9, quote: "thanks for calling" }) ?? "", /utterance 9 does not exist/);
        assert.match(verifyQuote(transcript, { utterance: -1, quote: "thanks for calling" }) ?? "", /utterance -1 does not exist/);
    });

    it("rejects quotes shorter than 3 words", () => {
        assert.match(verifyQuote(transcript, { utterance: 1, quote: "the kitchen!" }) ?? "", /utterance 1: .*too short; quote at least 3/);
    });

    it("rejects a paraphrase", () => {
        const problem = verifyQuote(transcript, { utterance: 2, quote: "I'll send a technician out" });
        assert.equal(problem, `utterance 2: quote "I'll send a technician out" not found verbatim; copy the speaker's exact words`);
    });

    it("rejects a quote that only matches part of a word", () => {
        assert.notEqual(verifyQuote(transcript, { utterance: 0, quote: "anks for calling" }), null);
    });
});

describe("mentionedInTranscript", () => {
    it("matches whole words case-insensitively", () => {
        assert.equal(mentionedInTranscript(transcript, "sam"), true);
        assert.equal(mentionedInTranscript(transcript, "Acme Pest"), true);
    });

    it("does not match inside a longer word", () => {
        const t: Utterance[] = [{ i: 0, speaker: "A", startMs: 0, endMs: 1, text: "This is Samantha speaking." }];
        assert.equal(mentionedInTranscript(t, "Sam"), false);
    });

    it("returns false for an empty value", () => {
        assert.equal(mentionedInTranscript(transcript, "  "), false);
    });
});

describe("numbersInTranscript", () => {
    it("ignores commas and currency symbols", () => {
        assert.equal(numbersInTranscript(transcript, "$1,299"), true);
        assert.equal(numbersInTranscript(transcript, "$1,299 per year"), true);
    });

    it("rejects numbers that were never said", () => {
        assert.equal(numbersInTranscript(transcript, "$1,399"), false);
        assert.equal(numbersInTranscript(transcript, "$129"), false);
    });

    it("returns true when the value has no numbers", () => {
        assert.equal(numbersInTranscript(transcript, "free inspection"), true);
    });
});
