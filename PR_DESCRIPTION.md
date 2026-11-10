# Draft PR for exa-labs/ai-sdk. Not submitted.

Target: https://github.com/exa-labs/ai-sdk, base `main`.

Two variants are ready. Pick whichever fits where the maintainers are:

| Variant | Branch (local) | Patch files | Use when |
| - | - | - | - |
| A | `ai-sdk-v7-abort` (3 commits on `main` a7c4761) | `patches/0001..0003` | #21 isn't merging soon |
| B | `ai-sdk-v7-abort-on-pr21` (1 commit on #21's head b434bf7) | `patches-on-pr21/0001` | #21 is about to merge. B leaves #21's config-surface work alone and adds only what #21 lacks |

Apply either one with `git am` on a fresh clone of exa-labs/ai-sdk. For B,
first run `git fetch origin pull/21/head:pr21 && git checkout pr21`.

---

**Title:** feat: support AI SDK 7 and zod 4, forward abortSignal, typed errors

**Body:**

`ai@7` has been `latest` since 2026-06-25. In the last week it accounted for 48%
of `ai` downloads. `@exalabs/ai-sdk@2.1.0` still declares `peer ai@^6.0.0`, so
`npm install ai@7 @exalabs/ai-sdk` fails with ERESOLVE. People are vendoring the
tool to get around it (see the v7 comment in #4). The tool also ignores the AI
SDK's `abortSignal` (#22).

Changes:

- `peerDependencies`: `ai ^6.0.0 || ^7.0.0`, and `zod ^3.25.76 || ^4.1.8`, which
  is the range `ai` itself declares. zod moves out of `dependencies`, so the app
  and the tool share one zod instead of the tool carrying its own zod 3.
- Forward `abortSignal` to `fetch`. A call whose signal is already aborted rejects
  before making any request. `AbortError` is rethrown unchanged instead of being
  wrapped in a generic `Error`, so callers can tell a cancel from a failure.
  Fixes #22.
- Non-2xx responses throw `ExaApiError`, which carries `status`, `tag`,
  `requestId`, `retryAfterSeconds` and `body`. The message text is unchanged from
  2.x (`Failed to search with Exa: Exa API error: <status> - <body>`).
- Optional `config.fetch` for proxies and tests.
- Tool output is typed as `ExaApiResponse` instead of `unknown` (variant A; #21
  already does this in B).
- Stop sending the deprecated `contents.livecrawl: "fallback"` on every call.
  Omitting it gives the same API default. Add `contents.maxAgeHours`, which the
  docs page's "Configure search" example uses but 2.1.0 rejects at type-check
  and drops at runtime. Passing `livecrawl` together with `maxAgeHours` now
  throws up front, because the API rejects that combination. Variant A also adds
  the `lite` / `deep-lite` types, the `people` / `publication` categories and
  `highlights.maxCharacters`, and marks deprecated options with `@deprecated`,
  following the OpenAPI spec. #21 covers those in B.

Tests (new; the repo had none):

- `npm test`: 10 `node:test` cases against the built `dist/`.
  - They call the real `https://api.exa.ai/search` with a deliberately invalid
    key, so the real 401 `INVALID_API_KEY` comes back. No Exa responses are faked.
  - Request bodies are validated with ajv against the live
    `https://exa.ai/docs/exa-spec.json` `SearchRequest` schema, and checked for
    any field the spec marks deprecated or legacy.
  - The `type: "lite"` body is checked against lite's parameter allow-list taken
    from the spec.
  - Covers pre-aborted and mid-flight cancellation.
- `npm run test:compat`: packs the package and installs it with plain
  `npm install` (no `--legacy-peer-deps`) into fresh projects for ai@6/7 × zod@3/4.
  For each project it:
  - type-checks the example from exa.ai/docs/integrations/vercel/ai-sdk;
  - runs `generateText` with the AI SDK's own test model emitting a `webSearch`
    tool call, which then hits the real API;
  - checks that `generateText`'s `abortSignal` reaches the Exa request.
- `node test/compat/run.mjs --baseline` runs the same matrix against the
  published 2.1.0, for comparison.

```
published 2.1.0
ai@6 zod@3  install=ok    types=FAIL (maxAgeHours, docs example)  runtime=1 pass / 1 fail (abortSignal not forwarded)
ai@6 zod@4  install=ok    types=FAIL                               runtime=1 pass / 1 fail
ai@7 zod@3  install=FAIL  ERESOLVE peer ai@"^6.0.0"
ai@7 zod@4  install=FAIL  ERESOLVE

this branch
ai@6 zod@3  install=ok  types=ok  runtime=2 pass / 0 fail
ai@6 zod@4  install=ok  types=ok  runtime=2 pass / 0 fail
ai@7 zod@3  install=ok  types=ok  runtime=2 pass / 0 fail
ai@7 zod@4  install=ok  types=ok  runtime=2 pass / 0 fail
```

CI runs both suites. The tests need outbound HTTPS to api.exa.ai and exa.ai,
and no secrets.

Not tested, because there is no Exa API key: a successful search response
through the tool, whether the API returns warnings for the old `livecrawl`
default, and real 429 / `Retry-After` values. The `ExaApiError` parsing was only
exercised on a real 401 body.

Possible semver note: moving zod to `peerDependencies` matters only for an app
that uses this package without depending on `ai` (which already peers zod). npm
7 and later install peers automatically.

Refs #4, fixes #22.
