import type { Quote, Utterance } from "@/lib/calls";

const MIN_QUOTE_WORDS = 3;
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

export function normalize(text: string): string {
    return text
        .normalize("NFKC")
        .replace(/[‘’‚‛]/g, "'")
        .replace(/[“”„‟]/g, '"')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s']/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Padding with spaces makes the match whole-word, so "ice to meet" can't match inside "nice to meet".
const containsWords = (haystack: string, needle: string) => ` ${haystack} `.includes(` ${needle} `);

export function verifyQuote(transcript: Utterance[], q: Quote, speaker?: string): string | null {
    const idx = transcript.findIndex((u) => u.i === q.utterance);
    if (idx === -1) {
        return `utterance ${q.utterance} does not exist; use an index between 0 and ${transcript.length - 1}`;
    }
    const u = transcript[idx];
    const quote = normalize(q.quote);
    if (quote.split(" ").filter(Boolean).length < MIN_QUOTE_WORDS) {
        return `utterance ${q.utterance}: quote "${q.quote}" is too short; quote at least ${MIN_QUOTE_WORDS} consecutive words`;
    }
    if (speaker !== undefined && u.speaker !== speaker) {
        return `utterance ${q.utterance} is spoken by Speaker ${u.speaker}, not Speaker ${speaker}; quote only Speaker ${speaker}'s words`;
    }
    const next = transcript[idx + 1];
    const text = normalize(u.text);
    const found = containsWords(text, quote) || (next?.speaker === u.speaker && containsWords(`${text} ${normalize(next.text)}`, quote));
    return found ? null : `utterance ${q.utterance}: quote "${q.quote}" not found verbatim; copy the speaker's exact words`;
}

export function mentionedInTranscript(transcript: Utterance[], value: string): boolean {
    const needle = normalize(value);
    return needle !== "" && containsWords(transcript.map((u) => normalize(u.text)).join(" "), needle);
}

const numbersIn = (text: string) => (text.match(NUMBER_RE) ?? []).map((n) => n.replace(/,/g, ""));

export function numbersInTranscript(transcript: Utterance[], value: string): boolean {
    const spoken = new Set(transcript.flatMap((u) => numbersIn(u.text)));
    return numbersIn(value).every((n) => spoken.has(n));
}
