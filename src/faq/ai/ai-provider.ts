/**
 * Replaceable text-generation layer for the FAQ Assistant. A provider only
 * rewords approved FAQ excerpts it is given; it is never the source of truth,
 * and every result is validated server-side before a visitor sees it.
 */
export const FAQ_AI_PROVIDER = Symbol('FAQ_AI_PROVIDER');

/** One short reply per visitor message keeps usage inside free-tier quotas. */
export const AI_PROVIDER_LIMITS = { maxOutputTokens: 300 } as const;

export interface AiJsonRequest {
  system: string;
  prompt: string;
  /** JSON schema (Gemini/OpenAPI subset) the provider must answer with. */
  responseSchema: Record<string, unknown>;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface AiProvider {
  /** Short provider/model label for logs; never includes credentials. */
  readonly label: string;
  /** True when credentials are present. Feature flags are checked elsewhere. */
  isConfigured(): boolean;
  /** Returns the parsed JSON answer, or throws AiProviderError. */
  generateJson(request: AiJsonRequest): Promise<unknown>;
}

export type AiProviderErrorKind =
  | 'not_configured'
  | 'rate_limited'
  | 'timeout'
  | 'unavailable'
  | 'blocked'
  | 'invalid_response';

export class AiProviderError extends Error {
  constructor(
    readonly kind: AiProviderErrorKind,
    readonly retryAfterMs?: number,
    /** Provider HTTP status, for diagnostics only (e.g. 404 retired model). */
    readonly httpStatus?: number,
  ) {
    super(`AI provider error: ${kind}`);
    this.name = 'AiProviderError';
  }
}
