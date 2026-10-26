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
    return quoteAt(transcript, idx, quote, speaker === undefined)
        ? null
        : `utterance ${q.utterance}: quote "${q.quote}" not found verbatim; copy the speaker's exact words`;
}

/**
 * Whether the normalized quote is in transcript[idx], or runs on into the next line by the same speaker.
 * With `acrossSpeakers`, it may also run across a speaker change into either neighbouring line, as long as part of it
 * is on this one: diarization sometimes hands a word at a turn boundary to the wrong speaker ("...we can— Do" /
 * "you have smaller service agreements?"). Quotes that must be one speaker's words never cross, so the rep is never
 * credited with the customer's words.
 */
function quoteAt(transcript: Utterance[], idx: number, quote: string, acrossSpeakers: boolean): boolean {
    const u = transcript[idx];
    const next = transcript[idx + 1];
    const text = normalize(u.text);
    if (containsWords(text, quote) || (next?.speaker === u.speaker && containsWords(`${text} ${normalize(next.text)}`, quote))) return true;
    if (!acrossSpeakers) return false;
    const before = idx > 0 ? normalize(transcript[idx - 1].text) : "";
    const after = next ? normalize(next.text) : "";
    return containsWords(`${before} ${text} ${after}`, quote) && !containsWords(before, quote) && !containsWords(after, quote);
}

/**
 * Points a quote at the line it is actually on, when the model copied the words right but cited the wrong line.
 * Only moves it when the words are on exactly one line (by `speaker`, if given); otherwise verifyQuote reports the problem.
 */
export function relocateQuote<Q extends Quote>(transcript: Utterance[], q: Q, speaker?: string): Q {
    const quote = normalize(q.quote);
    const idx = transcript.findIndex((u) => u.i === q.utterance);
    const acrossSpeakers = speaker === undefined;
    if (quote === "" || (idx !== -1 && quoteAt(transcript, idx, quote, acrossSpeakers))) return q;
    const matches = transcript.flatMap((u, j) =>
        (acrossSpeakers || u.speaker === speaker) && quoteAt(transcript, j, quote, acrossSpeakers) ? [u.i] : [],
    );
    return matches.length === 1 ? { ...q, utterance: matches[0] } : q;
}

export function mentionedInTranscript(transcript: Utterance[], value: string): boolean {
    const needle = normalize(value);
    return needle !== "" && containsWords(transcript.map((u) => normalize(u.text)).join(" "), needle);
}

export function speakersWhoSay(transcript: Utterance[], value: string): string[] {
    const needle = normalize(value);
    if (needle === "") return [];
    return [...new Set(transcript.filter((u) => containsWords(normalize(u.text), needle)).map((u) => u.speaker))];
}

const numbersIn =(text: string) => (text.match(NUMBER_RE) ?? []).map((n) => n.replace(/,/g, ""));

export function numbersInTranscript(transcript: Utterance[], value: string): boolean {
    const spoken = new Set(transcript.flatMap((u) => numbersIn(u.text)));
    return numbersIn(value).every((n) => spoken.has(n));
}
