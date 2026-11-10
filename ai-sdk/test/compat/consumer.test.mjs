// Runs inside a throwaway project that installed the packed package together
// with one ai/zod combination. The model is the AI SDK's own test model, used
// only to emit a tool call; the tool then talks to the real Exa API.
import assert from "node:assert/strict";
import { test } from "node:test";
import { generateText, stepCountIs } from "ai";
import * as aiTest from "ai/test";
import { webSearch } from "@exalabs/ai-sdk";

const INVALID_KEY = "invalid-key-for-tests";
const MockModel = aiTest.MockLanguageModelV4 ?? aiTest.MockLanguageModelV3;

function toolCallingModel() {
  const usage = aiTest.MockLanguageModelV4
    ? { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }
    : { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
  let step = 0;
  return new MockModel({
    doGenerate: async () => {
      step++;
      if (step === 1) {
        return {
          content: [{ type: "tool-call", toolCallId: "call-1", toolName: "webSearch", input: JSON.stringify({ query: "Vercel AI SDK 7 release notes" }) }],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage,
          warnings: [],
        };
      }
      return { content: [{ type: "text", text: "done" }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] };
    },
  });
}

// Pass-through spy on the global fetch, so the same test also runs against
// releases that have no `fetch` option.
const realFetch = globalThis.fetch;
function spyGlobalFetch(onCall) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const p = realFetch(url, init);
    onCall?.();
    return p;
  };
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

test("generateText runs the Exa tool end to end and surfaces the real API error", async () => {
  const rec = spyGlobalFetch();
  const result = await generateText({
    model: toolCallingModel(),
    prompt: "search",
    tools: { webSearch: webSearch({ apiKey: INVALID_KEY }) },
    stopWhen: stepCountIs(2),
  }).finally(rec.restore);
  const parts = result.steps[0].content;
  const toolError = parts.find((p) => p.type === "tool-error");
  assert.ok(toolError, JSON.stringify(parts.map((p) => p.type)));
  assert.match(String(toolError.error?.message ?? toolError.error), /401/);
  assert.equal(rec.calls.length, 1);
  assert.equal(rec.calls[0].url, "https://api.exa.ai/search");
});

test("generateText abortSignal reaches the Exa request (#22)", async () => {
  const controller = new AbortController();
  const rec = spyGlobalFetch(() => controller.abort());
  const err = await generateText({
    model: toolCallingModel(),
    prompt: "search",
    tools: { webSearch: webSearch({ apiKey: INVALID_KEY }) },
    stopWhen: stepCountIs(2),
    abortSignal: controller.signal,
  }).then(() => undefined, (e) => e).finally(rec.restore);
  assert.ok(err, "generateText should reject after abort");
  assert.equal(rec.calls.length, 1);
  const sent = rec.calls[0].init.signal;
  assert.ok(sent, "fetch received no signal");
  assert.equal(sent.aborted, true);
});
