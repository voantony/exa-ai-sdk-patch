import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { webSearch, ExaApiError } from "../dist/index.js";
import { INVALID_KEY, recordingFetch, loadSpec, deprecatedPaths } from "./helpers.mjs";

const opts = (signal) => ({ toolCallId: "t1", messages: [], abortSignal: signal, context: {} });

test("default request body is valid for Exa's SearchRequest schema and uses no deprecated fields", async () => {
  const spec = await loadSpec();
  const rec = recordingFetch();
  const search = webSearch({ apiKey: INVALID_KEY, fetch: rec.fetch });
  await assert.rejects(search.execute({ query: "latest AI SDK release" }, opts()));
  const body = rec.calls[0].body;

  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  ajv.addSchema(spec, "exa-spec");
  const validate = ajv.compile({ $ref: "exa-spec#/components/schemas/SearchRequest" });
  assert.ok(validate(body), JSON.stringify(validate.errors));
  assert.deepEqual(deprecatedPaths(spec, body), []);
  assert.equal(body.contents.livecrawl, undefined);
});

test("documented example from exa.ai/docs/integrations/vercel/ai-sdk forwards maxAgeHours", async () => {
  const spec = await loadSpec();
  const rec = recordingFetch();
  // Options copied from the "Configure search" example on the Exa docs page.
  const search = webSearch({
    apiKey: INVALID_KEY,
    fetch: rec.fetch,
    type: "auto",
    numResults: 6,
    category: "company",
    contents: { text: { maxCharacters: 1000 }, maxAgeHours: 1, summary: true },
  });
  await assert.rejects(search.execute({ query: "top AI companies in Europe founded after 2018" }, opts()));
  const body = rec.calls[0].body;
  assert.equal(body.contents.maxAgeHours, 1);
  assert.equal(body.contents.livecrawl, undefined);
  assert.deepEqual(deprecatedPaths(spec, body), []);
});

test("lite search body only uses parameters the spec allows for lite", async () => {
  const spec = await loadSpec();
  const liteDesc = spec.components.schemas.SearchRequest.properties.type.anyOf.find((s) => s.const === "lite").description;
  const rec = recordingFetch();
  const search = webSearch({ apiKey: INVALID_KEY, fetch: rec.fetch, type: "lite" });
  await assert.rejects(search.execute({ query: "q" }, opts()));
  const body = rec.calls[0].body;
  const paths = [];
  for (const [k, v] of Object.entries(body)) {
    if (k === "contents") for (const ck of Object.keys(v)) paths.push(`contents.${ck}`);
    else paths.push(k);
  }
  for (const p of paths.filter((p) => p !== "type")) assert.ok(liteDesc.includes("`" + p + "`"), `${p} is not in lite's allow-list`);
});

test("livecrawl combined with maxAgeHours is rejected up front", () => {
  assert.throws(
    () => webSearch({ apiKey: INVALID_KEY, contents: { livecrawl: "always", maxAgeHours: 0 } }),
    /cannot be combined/,
  );
});

test("real API error surfaces as ExaApiError with status, tag and requestId", async () => {
  const search = webSearch({ apiKey: INVALID_KEY });
  const err = await search.execute({ query: "x" }, opts()).catch((e) => e);
  assert.ok(err instanceof ExaApiError, String(err));
  assert.equal(err.status, 401);
  assert.equal(err.tag, "INVALID_API_KEY");
  assert.match(err.requestId, /^[0-9a-f]{16,}$/);
  assert.match(err.message, /^Failed to search with Exa: Exa API error: 401 - /);
});

test("sends the integration headers and the configured key", async () => {
  const rec = recordingFetch();
  const search = webSearch({ apiKey: INVALID_KEY, fetch: rec.fetch });
  await search.execute({ query: "x" }, opts()).catch(() => {});
  const h = rec.calls[0].init.headers;
  assert.equal(rec.calls[0].url, "https://api.exa.ai/search");
  assert.equal(h["x-api-key"], INVALID_KEY);
  assert.equal(h["x-exa-integration"], "vercel-ai-sdk");
  assert.match(h["User-Agent"], /^exa-vercel-ai-sdk \d+\.\d+\.\d+/);
});

test("missing key fails before any request", async () => {
  const saved = process.env.EXA_API_KEY;
  delete process.env.EXA_API_KEY;
  try {
    const rec = recordingFetch();
    const search = webSearch({ fetch: rec.fetch });
    await assert.rejects(search.execute({ query: "x" }, opts()), /EXA_API_KEY is required/);
    assert.equal(rec.calls.length, 0);
  } finally {
    if (saved !== undefined) process.env.EXA_API_KEY = saved;
  }
});

test("already-aborted signal: rejects with AbortError and makes no request (#22)", async () => {
  const rec = recordingFetch();
  const search = webSearch({ apiKey: INVALID_KEY, fetch: rec.fetch });
  const c = new AbortController();
  c.abort();
  const err = await search.execute({ query: "x" }, opts(c.signal)).catch((e) => e);
  assert.equal(err?.name, "AbortError");
  assert.equal(rec.calls.length, 0);
});

test("abort mid-flight cancels the real HTTP request (#22)", async () => {
  const rec = recordingFetch();
  const search = webSearch({ apiKey: INVALID_KEY, fetch: rec.fetch });
  const c = new AbortController();
  const started = Date.now();
  const pending = search.execute({ query: "x" }, opts(c.signal));
  c.abort();
  const err = await Promise.resolve(pending).catch((e) => e);
  assert.equal(err?.name, "AbortError");
  assert.equal(rec.calls.length, 1);
  assert.equal(rec.calls[0].init.signal, c.signal);
  assert.ok(Date.now() - started < 1000);
});

test("abort while the request is on the wire settles promptly (#22)", async () => {
  const rec = recordingFetch();
  const search = webSearch({ apiKey: INVALID_KEY, fetch: rec.fetch });
  const c = new AbortController();
  const pending = Promise.resolve(search.execute({ query: "x" }, opts(c.signal)));
  setTimeout(() => c.abort(new DOMException("User stopped", "AbortError")), 20);
  const started = Date.now();
  const outcome = await pending.then(() => "resolved", (e) => e?.name);
  // Either the abort landed first (AbortError), or Exa answered inside 20 ms
  // (ExaApiError). Both are fine; hanging is not.
  assert.ok(outcome === "AbortError" || outcome === "ExaApiError", String(outcome));
  assert.ok(Date.now() - started < 2000);
});
