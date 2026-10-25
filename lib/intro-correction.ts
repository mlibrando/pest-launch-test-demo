import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Utterance } from "@/lib/calls";

const CLAUDE_MODEL = "claude-haiku-5-5";
const INTRO_MAX_LINES = 4;
const INTRO_MAX_MS = 30_000;

const fixIntroTool: Anthropic.Tool = {
    name: "fix_intro",
    input_schema: {
        type: "object",
        required: ["corrections", "repName"],
        properties: {
            corrections: {
                type: "array",
                description: "Only the lines you changed",
                items: {
                    type: "object",
                    required: ["i", "text"],
                    properties: { i: { type: "integer" }, text: { type: "string" } },
                },
            },
            repName: { type: ["string", "null"], description: "The rep's name after your corrections, or null if they don't give one" },
        },
    },
};

const anthropic = new Anthropic();

const systemPrompt = (companyName: string, repNames: string[]) => `You fix speech-recognition errors in the opening lines of a phone call to ${companyName}, a pest control company.
Known reps: ${repNames.join(", ") || "none yet"}.

Speech recognition often mishears the company name and the rep's name in the greeting, usually as a more common word or name with a similar sound or rhythm (e.g. "Griffin" as "Christian" or "Kristen").
- Replace misheard, misspelled or mis-spaced versions of the company name with "${companyName}".
- If the rep introduces themselves with a name that isn't a known rep but shares sounds or syllables with one, replace it with that rep's name. Leave it as transcribed only if it clearly sounds like none of them.
- Change nothing else: no grammar, punctuation or other wording fixes.
- Set repName to the name the rep introduces themselves with (after any correction), or null only if they never say their name.

Call ${fixIntroTool.name} once.`;

/** Fixes misheard company and rep names in the greeting, where speech recognition is least reliable. */
export async function correctIntro(utterances: Utterance[], companyName: string, repNames: string[]) {
    const intro = utterances.slice(0, INTRO_MAX_LINES).filter((u) => u.startMs < INTRO_MAX_MS);

    const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: systemPrompt(companyName, repNames),
        tools: [fixIntroTool],
        tool_choice: { type: "tool", name: fixIntroTool.name },
        messages: [{ role: "user", content: intro.map((u) => `[${u.i}] Speaker ${u.speaker}: ${u.text}`).join("\n") }],
    });
    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") throw new Error(`Claude did not call ${fixIntroTool.name} (stop_reason: ${response.stop_reason}).`);

    const { corrections, repName } = toolUse.input as { corrections: { i: number; text: string }[]; repName: string | null };
    const fixes = new Map(corrections.filter((c) => intro.some((u) => u.i === c.i)).map((c) => [c.i, c.text.trim()]));

    return {
        utterances: utterances.map((u): Utterance => {
            const text = fixes.get(u.i);
            return text && text !== u.text ? { ...u, text, original: u.text } : u;
        }),
        repName: repName?.trim() || null,
    };
}
