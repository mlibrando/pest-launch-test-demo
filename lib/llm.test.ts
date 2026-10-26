import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { MAX_ATTEMPTS, OutputIssues, retryNote, withRetries, type AttemptLog, type PreviousAttempt } from "@/lib/llm";

const delays: number[] = [];
beforeEach(() => {
    delays.length = 0;
    mock.method(globalThis, "setTimeout", (fn: () => void, ms: number) => {
        delays.push(ms);
        fn();
    });
});
afterEach(() => mock.restoreAll());

const apiError = (status: number, headers: Record<string, string> = {}) =>
    Anthropic.APIError.generate(status, { type: "error", error: { type: "x", message: "boom" } }, undefined, new Headers(headers));

describe("retryNote", () => {
    it("is empty on the first attempt", () => {
        assert.equal(retryNote(), "");
    });

    it("quotes the previous output and lists the problems", () => {
        const note = retryNote({ output: '{"a":1}', issues: ["a: too small", "b: missing"] });
        assert.match(note, /<previous_attempt>\n\{"a":1\}\n<\/previous_attempt>/);
        assert.match(note, /- a: too small\n- b: missing/);
        assert.match(note, /fully corrected/);
    });
});

describe("withRetries", () => {
    it("retries on OutputIssues and passes the previous attempt along", async () => {
        const log: AttemptLog[] = [];
        const seen: (PreviousAttempt | undefined)[] = [];
        const result = await withRetries(
            "test",
            async (attempt, previous) => {
                seen.push(previous);
                if (attempt === 1) throw new OutputIssues(["x: bad"], "first", "schema");
                return "ok";
            },
            log,
        );
        assert.equal(result, "ok");
        assert.deepEqual(seen, [undefined, { output: "first", issues: ["x: bad"] }]);
        assert.deepEqual(log, [{ stage: "test", attempt: 1, kind: "schema", message: "x: bad" }]);
        assert.equal(delays.length, 1);
        assert.ok(delays[0] >= 1000 && delays[0] <= 1500);
    });

    it("stops after MAX_ATTEMPTS and throws the last error", async () => {
        const log: AttemptLog[] = [];
        const attempts: number[] = [];
        const onAttempt = async (attempt: number) => void attempts.push(attempt);
        await assert.rejects(
            withRetries("test", async () => Promise.reject(new OutputIssues(["nope"], "out")), log, onAttempt),
            OutputIssues,
        );
        assert.deepEqual(attempts, [1, 2, 3]);
        assert.equal(log.length, MAX_ATTEMPTS);
        assert.ok(log.every((l) => l.kind === "validation"));
        assert.equal(delays.length, 2);
        assert.ok(delays[1] >= 3000 && delays[1] <= 3500);
    });

    it("retries server, connection and rate-limit errors, honoring retry-after", async () => {
        const errors = [apiError(529), new Anthropic.APIConnectionError({ message: "down" }), apiError(429, { "retry-after": "60" })];
        const log: AttemptLog[] = [];
        let calls = 0;
        await assert.rejects(withRetries("test", async () => Promise.reject(errors[calls++]), log), Anthropic.RateLimitError);
        assert.equal(calls, 3);
        assert.ok(log.every((l) => l.kind === "api"));

        delays.length = 0;
        const result = await withRetries("test", async (attempt) => (attempt === 1 ? Promise.reject(apiError(429, { "retry-after": "60" })) : "ok"), []);
        assert.equal(result, "ok");
        assert.deepEqual(delays, [30_000]);
    });

    for (const status of [400, 401, 403, 404]) {
        it(`throws a ${status} at once`, async () => {
            const log: AttemptLog[] = [];
            let calls = 0;
            await assert.rejects(
                withRetries("test", async () => {
                    calls++;
                    throw apiError(status);
                }, log),
                Anthropic.APIError,
            );
            assert.equal(calls, 1);
            assert.equal(log.length, 1);
            assert.equal(delays.length, 0);
        });
    }
});
