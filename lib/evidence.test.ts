import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Utterance } from "@/lib/calls";
import { mentionedInTranscript, normalize, numbersInTranscript, relocateQuote, speakersWhoSay, verifyQuote } from "@/lib/evidence";

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

    it("rejects one speaker's quote that runs into the next utterance by a different speaker", () => {
        const problem = verifyQuote(transcript, { utterance: 3, quote: "for the year that works" }, "A");
        assert.match(problem ?? "", /utterance 3: .*not found verbatim/);
    });

    it("accepts a quote that runs across a speaker change only when any speaker may be quoted", () => {
        const split: Utterance[] = [
            { i: 0, speaker: "A", startMs: 0, endMs: 1000, text: "If that's what you prefer, we can— Do" },
            { i: 1, speaker: "B", startMs: 1000, endMs: 2000, text: "you have smaller service agreements?" },
            { i: 2, speaker: "A", startMs: 2000, endMs: 3000, text: "Do you mean a shorter term?" },
        ];
        assert.equal(verifyQuote(split, { utterance: 1, quote: "Do you have smaller service agreements" }), null);
        assert.match(verifyQuote(split, { utterance: 0, quote: "we can do you have" }, "A") ?? "", /not found verbatim/);
        // A quote that is all on a neighbouring line isn't on this one.
        assert.match(verifyQuote(split, { utterance: 1, quote: "do you mean a shorter" }) ?? "", /not found verbatim/);
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

describe("relocateQuote", () => {
    it("moves a verbatim quote cited to the wrong line onto the line it is on", () => {
        assert.deepEqual(relocateQuote(transcript, { utterance: 3, quote: "got ants in the kitchen" }), { utterance: 1, quote: "got ants in the kitchen" });
    });

    it("leaves a quote that is already on its cited line, including one that runs on", () => {
        const q = { utterance: 2, quote: "out to you on Tuesday the quarterly plan" };
        assert.equal(relocateQuote(transcript, q), q);
    });

    it("only moves to a line by the given speaker", () => {
        const q = { utterance: 0, quote: "got ants in the kitchen" };
        assert.equal(relocateQuote(transcript, q, "A"), q);
        assert.deepEqual(relocateQuote(transcript, q, "B"), { ...q, utterance: 1 });
    });

    it("leaves paraphrases and quotes on more than one line for verifyQuote to reject", () => {
        const paraphrase = { utterance: 3, quote: "I'll send a technician out" };
        assert.equal(relocateQuote(transcript, paraphrase), paraphrase);
        const twice: Utterance[] = [transcript[0], { ...transcript[2], text: "Thanks for calling again." }];
        const q = { utterance: 9, quote: "thanks for calling" };
        assert.equal(relocateQuote(twice, q), q);
    });
});

describe("speakersWhoSay", () => {
    it("lists each speaker who says the value as whole words", () => {
        assert.deepEqual(speakersWhoSay(transcript, "Sam"), ["A", "B"]);
        assert.deepEqual(speakersWhoSay(transcript, "acme pest"), ["A"]);
        assert.deepEqual(speakersWhoSay(transcript, "Sa"), []);
        assert.deepEqual(speakersWhoSay(transcript, "  "), []);
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
