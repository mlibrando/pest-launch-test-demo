import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { RubricData } from "@/lib/rubrics";

const CLAUDE_MODEL = "claude-sonnet-5-5";

const SYSTEM_PROMPT = `You convert call training manuals into scoring rubrics for an automated call grader.

You'll receive one or more documents from the same company. Extract every scorecard they define and call the \`save_rubric\` tool once.

Rules:
- Create one scorecard per call type the documents score separately (e.g. sales, general, retention). If documents define different scorecards for the same call type, keep both and add a conflict.
- Criteria must come from the documents' scorecards or step lists. Do not invent criteria.
- For each criterion, write \`qualityBar\` from what the manual says a good execution looks like, so a grader can tell a weak attempt from a real one. Keep it to 1-2 sentences.
- If a criterion only applies in some situations, fill \`appliesWhen\` and \`ifNotApplicable\` using the manual's own rule (e.g. objection steps auto-pass when no objection is raised).
- Capture hard policy limits that aren't scored (e.g. discount caps, max waived months) as \`policies\`.
- If the documents contain unfilled placeholders like "(Your Business Name)", list them in \`placeholders\`.
- Anything ambiguous goes in \`conflicts\` with a short question for a human reviewer. Don't guess.`;

const saveRubricTool: Anthropic.Tool = {
    name: "save_rubric",
    input_schema: {
        type: "object",
        required: ["scorecards", "policies", "conflicts", "placeholders"],
        properties: {
            scorecards: {
                type: "array",
                items: {
                    type: "object",
                    required: ["callType", "thresholds", "criteria"],
                    properties: {
                        callType: { type: "string" },
                        thresholds: {
                            type: "object",
                            properties: { gold: { type: "integer" }, green: { type: "integer" } },
                        },
                        criteria: {
                            type: "array",
                            items: {
                                type: "object",
                                required: ["id", "quadrant", "label", "qualityBar", "sourceRef"],
                                properties: {
                                    id: { type: "string", description: "snake_case, unique per scorecard" },
                                    quadrant: { type: "string" },
                                    label: { type: "string" },
                                    qualityBar: { type: "string" },
                                    appliesWhen: { type: "string" },
                                    ifNotApplicable: { enum: ["auto_pass", "exclude"] },
                                    sourceRef: { type: "string", description: "document name + section" },
                                },
                            },
                        },
                    },
                },
            },
            policies: {
                type: "array",
                items: { type: "object", properties: { rule: { type: "string" }, sourceRef: { type: "string" } } },
            },
            conflicts: {
                type: "array",
                items: { type: "object", properties: { description: { type: "string" }, question: { type: "string" } } },
            },
            placeholders: { type: "array", items: { type: "string" } },
        },
    },
};

const anthropic = new Anthropic();

/** Each document is either a PDF (sent natively) or text already extracted from a DOCX. */
export type SourceDocument = { name: string } & ({ pdf: Buffer } | { text: string });

export async function extractRubric(documents: SourceDocument[]): Promise<RubricData> {
    const content: Anthropic.ContentBlockParam[] = documents.flatMap((doc): Anthropic.ContentBlockParam[] =>
        "pdf" in doc
            ? [
                  { type: "text", text: `<document name="${doc.name}">` },
                  {
                      type: "document",
                      title: doc.name,
                      source: { type: "base64", media_type: "application/pdf", data: doc.pdf.toString("base64") },
                  },
                  { type: "text", text: "</document>" },
              ]
            : [{ type: "text", text: `<document name="${doc.name}">\n${doc.text}\n</document>` }],
    );
    content.push({ type: "text", text: "Extract the rubric from these documents." });

    // Sonnet 5.5 rejects a forced tool_choice, so the system prompt asks for the tool and we check it was called.
    // Streamed because large manuals can produce long outputs that exceed non-streaming timeouts.
    const response = await anthropic.messages
        .stream({
            model: CLAUDE_MODEL,
            max_tokens: 64000,
            system: SYSTEM_PROMPT,
            tools: [saveRubricTool],
            tool_choice: { type: "auto", disable_parallel_tool_use: true },
            messages: [{ role: "user", content }],
        })
        .finalMessage();

    if (response.stop_reason === "refusal") throw new Error("Claude declined to process these documents.");
    if (response.stop_reason === "max_tokens") throw new Error("Extraction was cut off at max_tokens.");
    const toolUse = response.content.find((b) => b.type === "tool_use" && b.name === saveRubricTool.name);
    if (!toolUse || toolUse.type !== "tool_use") {
        throw new Error(`Claude did not call ${saveRubricTool.name} (stop_reason: ${response.stop_reason}).`);
    }
    return toolUse.input as RubricData;
}
