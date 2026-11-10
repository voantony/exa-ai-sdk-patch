/**
 * Text content options
 */
export interface TextOptions {
  /** Maximum characters for the text content */
  maxCharacters?: number;
  /** Include HTML tags in the response */
  includeHtmlTags?: boolean;
}

/**
 * Summary options
 */
export interface SummaryOptions {
  /** Custom query for the summary */
  query?: string;
}

/**
 * Highlights options - text snippets the LLM identifies as most relevant from each page
 */
export interface HighlightsOptions {
  /** Maximum characters of highlights to return for each result */
  maxCharacters?: number;
  /** @deprecated Use `maxCharacters`. The API maps this to a character budget. */
  numSentences?: number;
  /** @deprecated Ignored by the API. */
  highlightsPerUrl?: number;
  /** Custom query to direct the LLM's selection of highlights */
  query?: string;
}

/**
 * Extras options
 */
export interface ExtrasOptions {
  /** Number of links to return from each page */
  links?: number;
  /** Number of image links to return */
  imageLinks?: number;
}

/**
 * Contents configuration - controls what content to retrieve from search results
 */
export interface ContentsOptions {
  /** Get page text content. Pass true or an object with options (default: {maxCharacters: 1000}) */
  text?: boolean | TextOptions;
  /** Get text snippets the LLM identifies as most relevant from each page */
  highlights?: boolean | HighlightsOptions;
  /** Get AI-generated summary */
  summary?: boolean | SummaryOptions;
  /**
   * Maximum age of cached content in hours (-1 to 720). `0` always fetches live,
   * `-1` always uses the cache. When omitted, cached content is used when
   * available and pages without it are fetched live.
   */
  maxAgeHours?: number;
  /**
   * @deprecated Use `maxAgeHours` (always -> 0, never -> -1, fallback -> omit).
   * Cannot be combined with `maxAgeHours`. No longer sent by default.
   */
  livecrawl?: "never" | "fallback" | "always" | "preferred";
  /** Livecrawl timeout in milliseconds */
  livecrawlTimeout?: number;
  /** @deprecated on search. Pass result URLs to the Contents API instead. */
  subpages?: number;
  /** @deprecated on search. Pass result URLs to the Contents API instead. */
  subpageTarget?: string | string[];
  /** Extra content to retrieve */
  extras?: ExtrasOptions;
}

/**
 * Main search configuration
 */
export interface ExaSearchConfig {
  /**
   * Your Exa API key. Get one at https://dashboard.exa.ai/api-keys
   * Defaults to process.env.EXA_API_KEY
   */
  apiKey?: string;

  /**
   * Custom fetch implementation, for example to route through a proxy or to
   * observe requests in tests. Defaults to the global `fetch`.
   */
  fetch?: typeof globalThis.fetch;
  
  /**
   * Search type (default: "auto")
   * - auto: Best search, intelligently combines keyword and neural
   * - keyword: Fast keyword search
   * - neural: Deep semantic search
   * - lite: Low-cost, low-latency search (accepts a restricted parameter set)
   * - deep-lite: Lightweight research with synthesized results
   * - deep: Comprehensive deep search with enhanced analysis
   * - fast, instant, deep-reasoning: legacy types, still accepted by the API
   */
  type?: "auto" | "lite" | "deep-lite" | "deep" | "fast" | "instant" | "deep-reasoning" | "keyword" | "neural";
  
  /**
   * Category to focus the search on
   */
  category?:
    | "company"
    | "publication"
    | "news"
    | "personal site"
    | "people"
    | "financial report"
    // Older values. The API treats unlisted strings as category hints.
    | "research paper"
    | "pdf"
    | "github"
    | "linkedin profile";
  
  /**
   * Two-letter ISO country code for localized results (e.g., "US")
   */
  userLocation?: string;
  
  /**
   * Number of results to return (default: 8)
   * Keyword max: 10, Neural max: 100
   */
  numResults?: number;
  
  /**
   * List of domains to include (e.g., ["arxiv.org", "github.com"])
   */
  includeDomains?: string[];
  
  /**
   * List of domains to exclude
   */
  excludeDomains?: string[];
  
  /**
   * @deprecated Ignored by the API, which adds an `IGNORED_FIELD` warning.
   */
  startCrawlDate?: string;
  
  /**
   * @deprecated Ignored by the API, which adds an `IGNORED_FIELD` warning.
   */
  endCrawlDate?: string;
  
  /**
   * Return results published after this date (ISO 8601 format)
   */
  startPublishedDate?: string;
  
  /**
   * Return results published before this date (ISO 8601 format)
   */
  endPublishedDate?: string;
  
  /**
   * Text that must be present in results (max 1 string, up to 5 words)
   */
  includeText?: string[];
  
  /**
   * Text that must not be present in results (max 1 string, up to 5 words)
   */
  excludeText?: string[];
  
  /**
   * Contents options - what to retrieve from each result
   */
  contents?: ContentsOptions;
}

/**
 * Search result returned from Exa
 */
export interface ExaSearchResult {
  /** Title of the page */
  title: string;
  /** URL of the page */
  url: string;
  /** Unique ID for the result */
  id?: string;
  /** Published date (ISO 8601 format) */
  publishedDate?: string;
  /** Author of the content */
  author?: string;
  /** URL of an image associated with the result */
  image?: string;
  /** URL of the favicon */
  favicon?: string;
  /** Full text content of the page */
  text?: string;
  /** Array of highlights extracted from the search result content */
  highlights?: string[];
  /** Array of cosine similarity scores for each highlight */
  highlightScores?: number[];
  /** AI-generated summary */
  summary?: string;
  /** Array of subpages */
  subpages?: ExaSearchResult[];
  /** Extra content (links, images) */
  extras?: {
    links?: string[];
    imageLinks?: string[];
  };
}

/**
 * API response from Exa search endpoint
 * This includes the full response with all metadata for maximum flexibility
 */
export interface ExaApiResponse {
  /** Unique request ID */
  requestId?: string;
  /** @deprecated May be an empty string. Do not branch on this value. */
  resolvedSearchType?: string;
  /** Array of search results */
  results: ExaSearchResult[];
  /** Detailed request tags and metadata */
  requestTags?: Record<string, any>;
  /** Filters that were applied to the search */
  effectiveFilters?: {
    includeDomains?: string[];
    excludeDomains?: string[];
    includeUrls?: string[];
    excludeUrls?: string[];
    includeText?: string[];
    excludeText?: string[];
  };
  /** Total search time in milliseconds */
  searchTime?: number;
  /** Cost breakdown for the request */
  costDollars?: {
    total?: number;
    search?: Record<string, number>;
    contents?: Record<string, number>;
  };
  /** Any additional fields from the API */
  [key: string]: any;
}

