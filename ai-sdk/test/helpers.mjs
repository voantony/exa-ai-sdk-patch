// Shared helpers. Nothing here fakes Exa: requests go to the real
// https://api.exa.ai/search, and request bodies are checked against Exa's
// published OpenAPI spec. A key is never needed; a deliberately invalid key
// makes the real API answer 401 INVALID_API_KEY.
export const INVALID_KEY = "invalid-key-for-tests";
export const SPEC_URL = "https://exa.ai/docs/exa-spec.json";

/** Wraps the real fetch, recording each call and passing it through unchanged. */
export function recordingFetch() {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init, body: init?.body ? JSON.parse(init.body) : undefined });
    return globalThis.fetch(url, init);
  };
  return { fetch: fn, calls };
}

let specPromise;
export function loadSpec() {
  specPromise ??= globalThis.fetch(SPEC_URL).then((r) => {
    if (!r.ok) throw new Error(`spec fetch failed: ${r.status}`);
    return r.json();
  });
  return specPromise;
}

/** Collects every property path in a request body that the spec marks deprecated or legacy. */
export function deprecatedPaths(spec, body) {
  const schemas = spec.components.schemas;
  const hits = [];
  const resolve = (s) => (s && s.$ref ? schemas[s.$ref.split("/").pop()] : s);
  const lifecycleOf = (s) => {
    s = resolve(s);
    if (!s) return undefined;
    if (s["x-exa-lifecycle"]) return s["x-exa-lifecycle"];
    for (const k of ["anyOf", "oneOf"]) for (const sub of s[k] ?? []) {
      const r = resolve(sub);
      // Branches with a const (enum values like type: "fast") are checked per value below.
      if (r && r["x-exa-lifecycle"] && r.type !== "null" && !("const" in r)) return r["x-exa-lifecycle"];
    }
    return undefined;
  };
  const objectSchema = (s) => {
    s = resolve(s);
    if (!s) return undefined;
    if (s.properties) return s;
    for (const k of ["anyOf", "oneOf"]) for (const sub of s[k] ?? []) {
      const r = objectSchema(sub);
      if (r) return r;
    }
    return undefined;
  };
  const walk = (schema, value, path) => {
    const obj = objectSchema(schema);
    if (!obj || typeof value !== "object" || value === null) return;
    for (const [k, v] of Object.entries(value)) {
      const prop = obj.properties[k];
      if (!prop) continue;
      const life = lifecycleOf(prop);
      if (life === "deprecated" || life === "legacy") hits.push(`${path}${k}`);
      // const-valued enums (e.g. type: "fast") carry lifecycle on the matching branch
      for (const sub of resolve(prop).anyOf ?? []) {
        const r = resolve(sub);
        if (r && r.const === v && r["x-exa-lifecycle"]) hits.push(`${path}${k}=${v}`);
      }
      walk(prop, v, `${path}${k}.`);
    }
  };
  walk(schemas.SearchRequest, body, "");
  return hits;
}
