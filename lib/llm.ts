import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { toJSONSchema, type z } from "zod";
import { MAX_ATTEMPTS } from "@/lib/calls";
import { errorMessage } from "@/utils/error-message";

// withRetries owns retrying, so SDK retries would multiply the attempt count.
export const anthropic = new Anthropic({ maxRetries: 0 });

export const HAIKU = "claude-haiku-5-5";
export const SONNET = "claude-sonnet-5-5";

type OutputKind = "refusal" | "max_tokens" | "schema" | "validation";

export type AttemptLog = { stage: string; attempt: number; kind: "api" | OutputKind; message: string };

export class OutputIssues extends Error {
    constructor(
        public issues: string[],
        public output: string,
        public kind: OutputKind = "validation",
    ) {
        super(issues.join("; "));
        this.name = "OutputIssues";
    }
}

export type PreviousAttempt = { output: string; issues: string[] };

type OutputConfig = { effort?: Anthropic.OutputConfig["effort"] };
type JsonParams =
    | (Omit<Anthropic.MessageCreateParamsNonStreaming, "output_config"> & { betas?: undefined; output_config?: OutputConfig })
    | (Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, "output_config"> & {
          betas: Anthropic.Beta.AnthropicBeta[];
          output_config?: OutputConfig;
      });

type JsonSchema = { [key: string]: unknown };

// The SDK's schema transform moves `enum` into the description, but the API enforces enums, so put them back.
function restoreEnums(target: JsonSchema, source: JsonSchema) {
    if (source.enum) target.enum = source.enum;
    for (const key of ["properties", "$defs"] as const) {
        const children = source[key] as Record<string, JsonSchema> | undefined;
        for (const name in children) restoreEnums((target[key] as Record<string, JsonSchema>)[name], children[name]);
    }
    for (const key of ["anyOf", "allOf"] as const) {
        (source[key] as JsonSchema[] | undefined)?.forEach((child, i) => restoreEnums((target[key] as JsonSchema[])[i], child));
    }
    if (source.items) restoreEnums(target.items as JsonSchema, source.items as JsonSchema);
}

export function outputFormat(schema: z.ZodType) {
    const format = zodOutputFormat(schema);
    restoreEnums(format.schema, toJSONSchema(schema, { reused: "ref" }) as JsonSchema);
    return format;
}

export async function requestJson<S extends z.ZodType>(params: JsonParams, schema: S) {
    const format = outputFormat(schema);
    const response = params.betas
        ? await anthropic.beta.messages.create({ ...params, output_config: { ...params.output_config, format } })
        : await anthropic.messages.create({ ...params, output_config: { ...params.output_config, format } });

    const output = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    if (response.stop_reason === "refusal") throw new OutputIssues(["the model declined to respond"], output, "refusal");
    if (response.stop_reason === "max_tokens") {
        throw new OutputIssues([`the response was cut off at max_tokens (${params.max_tokens}); be more concise`], output, "max_tokens");
    }

    let json: unknown;
    try {
        json = JSON.parse(output);
    } catch (err) {
        throw new OutputIssues([`the response is not valid JSON: ${errorMessage(err)}`], output, "schema");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
        throw new OutputIssues(issues, output, "schema");
    }
    return { data: parsed.data as z.infer<S>, output, usage: response.usage };
}

const RETRY_AFTER_CAP_MS = 30_000;
const BACKOFF_MS = [1000, 3000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Delay before the next attempt, or null when the error can't be fixed by retrying. */
function retryDelay(err: unknown, attempt: number): number | null {
    const backoff = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length) - 1] + Math.random() * 500;
    if (err instanceof OutputIssues || err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.InternalServerError) return backoff;
    if (err instanceof Anthropic.RateLimitError) {
        const retryAfter = Number(err.headers?.get("retry-after"));
        return retryAfter > 0 ? Math.min(retryAfter * 1000, RETRY_AFTER_CAP_MS) : backoff;
    }
    if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) return backoff;
    return null;
}

export async function withRetries<T>(
    stage: string,
    run: (attempt: number, previous?: PreviousAttempt) => Promise<T>,
    log: AttemptLog[],
    onAttempt?: (attempt: number) => Promise<void>,
): Promise<T> {
    let previous: PreviousAttempt | undefined;
    for (let attempt = 1; ; attempt++) {
        await onAttempt?.(attempt);
        try {
            return await run(attempt, previous);
        } catch (err) {
            log.push({ stage, attempt, kind: err instanceof OutputIssues ? err.kind : "api", message: errorMessage(err) });
            const delay = retryDelay(err, attempt);
            if (delay === null || attempt >= MAX_ATTEMPTS) throw err;
            if (err instanceof OutputIssues) previous = { output: err.output, issues: err.issues };
            await sleep(delay);
        }
    }
}

export function retryNote(previous?: PreviousAttempt): string {
    if (!previous) return "";
    return `

Your previous attempt was rejected.
<previous_attempt>
${previous.output}
</previous_attempt>

Problems:
${previous.issues.map((issue) => `- ${issue}`).join("\n")}

Respond again with a complete, fully corrected response that fixes every problem above.`;
}
