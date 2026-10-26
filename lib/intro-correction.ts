import "server-only";
import { z } from "zod";
import type { Utterance } from "@/lib/calls";
import { HAIKU, requestJson, retryNote, withRetries, type AttemptLog } from "@/lib/llm";

const INTRO_MAX_LINES = 4;
const INTRO_MAX_MS = 30_000;

const introSchema = z.object({
    corrections: z.array(z.object({ i: z.number().int(), text: z.string() })).describe("Only the lines you changed"),
    repName: z.string().nullable().describe("The rep's name after your corrections, or null if they don't give one"),
});

const systemPrompt = (companyName: string, repNames: string[]) => `You fix speech-recognition errors in the opening lines of a phone call to ${companyName}, a pest control company.
Known reps: ${repNames.join(", ") || "none yet"}.

Speech recognition often mishears the company name and the rep's name in the greeting, usually as a more common word or name with a similar sound or rhythm (e.g. "Griffin" as "Christian" or "Kristen").
- Replace misheard, misspelled or mis-spaced versions of the company name with "${companyName}".
- If the rep introduces themselves with a name that isn't a known rep but shares sounds or syllables with one, replace it with that rep's name. Leave it as transcribed only if it clearly sounds like none of them.
- Change nothing else: no grammar, punctuation or other wording fixes.
- Set repName to the name the rep introduces themselves with (after any correction), or null only if they never say their name.`;

/** Fixes misheard company and rep names in the greeting, where speech recognition is least reliable. */
export async function correctIntro(utterances: Utterance[], companyName: string, repNames: string[]) {
    const intro = utterances.slice(0, INTRO_MAX_LINES).filter((u) => u.startMs < INTRO_MAX_MS);
    const lines = intro.map((u) => `[${u.i}] Speaker ${u.speaker}: ${u.text}`).join("\n");

    const log: AttemptLog[] = [];
    const { data } = await withRetries(
        "intro",
        (_attempt, previous) =>
            requestJson(
                {
                    model: HAIKU,
                    max_tokens: 1024,
                    thinking: { type: "disabled" },
                    system: systemPrompt(companyName, repNames),
                    messages: [{ role: "user", content: lines + retryNote(previous) }],
                },
                introSchema,
            ),
        log,
    );

    const fixes = new Map(data.corrections.filter((c) => intro.some((u) => u.i === c.i)).map((c) => [c.i, c.text.trim()]));

    return {
        utterances: utterances.map((u): Utterance => {
            const text = fixes.get(u.i);
            return text && text !== u.text ? { ...u, text, original: u.text } : u;
        }),
        repName: data.repName?.trim() || null,
    };
}
