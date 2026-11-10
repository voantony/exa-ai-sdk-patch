import { tool, type Tool } from "ai";
import { z } from "zod";
import type { ExaApiResponse, ExaSearchConfig } from "./types";

declare const __PKG_VERSION__: string;

const EXA_SEARCH_URL = "https://api.exa.ai/search";

/**
 * Error thrown when the Exa API answers with a non-2xx status.
 *
 * The message keeps the 2.x format (`Exa API error: <status> - <body>`), and the
 * parsed fields are exposed so callers can branch on them instead of parsing text.
 */
export class ExaApiError extends Error {
  /** HTTP status code returned by the Exa API. */
  readonly status: number;
  /** Exa error tag such as `INVALID_API_KEY` or `RATE_LIMIT_EXCEEDED`, when the body is JSON. */
  readonly tag?: string;
  /** Exa request ID, when present. Include it when contacting Exa support. */
  readonly requestId?: string;
  /** Seconds from the `Retry-After` header, when present (429 and 503 responses). */
  readonly retryAfterSeconds?: number;
  /** Raw response body. */
  readonly body: string;

  constructor(status: number, body: string, retryAfter: string | null) {
    super(`Exa API error: ${status} - ${body}`);
    this.name = "ExaApiError";
    this.status = status;
    this.body = body;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.tag === "string") this.tag = parsed.tag;
        if (typeof parsed.requestId === "string") this.requestId = parsed.requestId;
      }
    } catch {
      // Non-JSON body, for example an HTML error page from a proxy. Keep it raw.
    }
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    if (Number.isFinite(seconds)) this.retryAfterSeconds = seconds;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    ((error as { name: unknown }).name === "AbortError" ||
      (error as { name: unknown }).name === "TimeoutError")
  );
}

/**
 * Creates a web search tool powered by Exa for use with Vercel AI SDK
 *
 * @param config - Configuration options for the Exa search
 * @returns A tool that can be used with AI SDK's generateText, streamText, etc.
 *
 * @example
 * ```ts
 * import { generateText } from "ai";
 * import { webSearch } from "@exalabs/ai-sdk";
 * import { openai } from "@ai-sdk/openai";
 *
 * // Just set EXA_API_KEY in .env, then:
 * const { text } = await generateText({
 *   model: openai('gpt-4o-mini'),
 *   prompt: 'What happened in San Francisco last week?',
 *   tools: {
 *     webSearch: webSearch({ numResults: 5 }),
 *   },
 * });
 * ```
 */
export function webSearch(
  config: ExaSearchConfig = {},
): Tool<{ query: string }, ExaApiResponse> {
  const {
    apiKey = process.env.EXA_API_KEY,
    fetch: customFetch,
    ...searchOptions
  } = config;

  const contents = searchOptions.contents || {};
  if (contents.livecrawl !== undefined && contents.maxAgeHours !== undefined) {
    throw new Error(
      "Exa: contents.livecrawl and contents.maxAgeHours cannot be combined. livecrawl is deprecated; use maxAgeHours only (always -> 0, never -> -1, fallback -> omit).",
    );
  }

  return tool({
    description: "Search the web for code docs, current information, news, articles, and content. Use this when you need up-to-date information or facts from the internet. Performs real-time web searches and can scrape content from specific URLs.",
    inputSchema: z.object({
      query: z.string().min(1).max(500).describe("The web search query - be specific and clear about what you're looking for"),
    }),
    execute: async ({ query }, options) => {
      const abortSignal = options?.abortSignal;
      // Do no network work for a call that was already cancelled.
      abortSignal?.throwIfAborted();

      if (!apiKey) {
        throw new Error("EXA_API_KEY is required. Set it in environment variables or pass it in config.");
      }

      // Build the request body matching Exa API structure
      const requestBody: any = {
        query,
        type: searchOptions.type || "auto",
        numResults: searchOptions.numResults || 10,
      };

      // Add optional search parameters
      if (searchOptions.category) {
        requestBody.category = searchOptions.category;
      }
      if (searchOptions.userLocation) {
        requestBody.userLocation = searchOptions.userLocation;
      }
      if (searchOptions.includeDomains && searchOptions.includeDomains.length > 0) {
        requestBody.includeDomains = searchOptions.includeDomains;
      }
      if (searchOptions.excludeDomains && searchOptions.excludeDomains.length > 0) {
        requestBody.excludeDomains = searchOptions.excludeDomains;
      }
      if (searchOptions.startCrawlDate) {
        requestBody.startCrawlDate = searchOptions.startCrawlDate;
      }
      if (searchOptions.endCrawlDate) {
        requestBody.endCrawlDate = searchOptions.endCrawlDate;
      }
      if (searchOptions.startPublishedDate) {
        requestBody.startPublishedDate = searchOptions.startPublishedDate;
      }
      if (searchOptions.endPublishedDate) {
        requestBody.endPublishedDate = searchOptions.endPublishedDate;
      }
      if (searchOptions.includeText && searchOptions.includeText.length > 0) {
        requestBody.includeText = searchOptions.includeText;
      }
      if (searchOptions.excludeText && searchOptions.excludeText.length > 0) {
        requestBody.excludeText = searchOptions.excludeText;
      }

      // Build contents object with defaults
      // Default: text with 3000 chars. Freshness is left to the API default
      // (cached content when available, live crawl otherwise), which is what
      // the deprecated livecrawl: "fallback" used to request.
      requestBody.contents = {};

      // Handle text content
      if (contents.text !== undefined) {
        requestBody.contents.text = contents.text;
      } else {
        // Default: get text with 3000 characters
        requestBody.contents.text = { maxCharacters: 3000 };
      }

      // Add other content options
      if (contents.highlights !== undefined) {
        requestBody.contents.highlights = contents.highlights;
      }
      if (contents.summary !== undefined) {
        requestBody.contents.summary = contents.summary;
      }
      if (contents.maxAgeHours !== undefined) {
        requestBody.contents.maxAgeHours = contents.maxAgeHours;
      }
      if (contents.livecrawl !== undefined) {
        requestBody.contents.livecrawl = contents.livecrawl;
      }
      if (contents.livecrawlTimeout) {
        requestBody.contents.livecrawlTimeout = contents.livecrawlTimeout;
      }
      if (contents.subpages !== undefined) {
        requestBody.contents.subpages = contents.subpages;
      }
      if (contents.subpageTarget) {
        requestBody.contents.subpageTarget = contents.subpageTarget;
      }
      if (contents.extras) {
        requestBody.contents.extras = contents.extras;
      }

      // Call Exa API
      const doFetch = customFetch ?? globalThis.fetch;
      try {
        const response = await doFetch(EXA_SEARCH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "x-exa-integration": "vercel-ai-sdk",
            "User-Agent": `exa-vercel-ai-sdk ${__PKG_VERSION__}`,
          },
          body: JSON.stringify(requestBody),
          signal: abortSignal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new ExaApiError(response.status, errorText, response.headers.get("retry-after"));
        }

        // Return the full API response for maximum flexibility and future-proofing
        const data = (await response.json()) as ExaApiResponse;
        return data;
      } catch (error) {
        // Cancellation must surface as-is so the AI SDK (and callers) can tell
        // an aborted call apart from a failed one.
        if (isAbortError(error) || abortSignal?.aborted) {
          throw error;
        }
        if (error instanceof ExaApiError) {
          error.message = `Failed to search with Exa: ${error.message}`;
          throw error;
        }
        if (error instanceof Error) {
          throw new Error(`Failed to search with Exa: ${error.message}`);
        }
        throw error;
      }
    },
  });
}

// Export types for users
export type {
  ExaSearchConfig,
  ExaSearchResult,
  ExaApiResponse,
  ContentsOptions,
  TextOptions,
  HighlightsOptions,
  SummaryOptions,
  ExtrasOptions,
} from "./types";
