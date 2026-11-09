import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiJsonRequest, AiProvider, AiProviderError } from './ai-provider';

// gemini-2.5-flash-lite returns 404 for API keys created after its retirement
// to new users (seen 2026-11-09), so new projects default to 3.5 Flash-Lite.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL_PATTERN = /^[a-z0-9][a-z0-9.-]{2,63}$/;

/**
 * Google Gemini Developer API through its REST endpoint (no SDK dependency).
 * The key is read server-side only and sent in a header, never in a URL,
 * log line or response. One request per call: no automatic retries, so a
 * rate limit or outage falls straight back to the curated FAQ answer.
 */
@Injectable()
export class GeminiProvider implements AiProvider {
  constructor(private readonly config: ConfigService) {}

  get label(): string {
    return `gemini:${this.model()}`;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  async generateJson(request: AiJsonRequest): Promise<unknown> {
    const key = this.apiKey();
    if (!key) throw new AiProviderError('not_configured');

    let response: Response;
    try {
      response = await fetch(
        `${GEMINI_ENDPOINT}/models/${this.model()}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.system }] },
            contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: request.maxOutputTokens,
              responseMimeType: 'application/json',
              responseSchema: request.responseSchema,
            },
          }),
          signal: AbortSignal.timeout(request.timeoutMs),
          redirect: 'error',
        },
      );
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      throw new AiProviderError(
        name === 'TimeoutError' || name === 'AbortError'
          ? 'timeout'
          : 'unavailable',
      );
    }

    if (response.status === 429) {
      const seconds = Number(response.headers.get('retry-after'));
      throw new AiProviderError(
        'rate_limited',
        Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
      );
    }
    if (!response.ok) {
      // 400/403 usually mean a bad key, disabled API or unknown model: treat
      // as unavailable so the assistant keeps answering from curated FAQs.
      throw new AiProviderError('unavailable', undefined, response.status);
    }

    const body = (await response.json().catch(() => null)) as {
      promptFeedback?: { blockReason?: string };
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
    } | null;
    if (body?.promptFeedback?.blockReason) {
      throw new AiProviderError('blocked');
    }
    const candidate = body?.candidates?.[0];
    if (!candidate) throw new AiProviderError('invalid_response');
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      // SAFETY, RECITATION, MAX_TOKENS and others: never show partial output.
      throw new AiProviderError(
        candidate.finishReason === 'SAFETY' ? 'blocked' : 'invalid_response',
      );
    }
    const text = (candidate.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AiProviderError('invalid_response');
    }
  }

  private apiKey(): string {
    return this.config.get<string>('GEMINI_API_KEY')?.trim() ?? '';
  }

  private model(): string {
    const configured = this.config.get<string>('GEMINI_MODEL')?.trim();
    return configured && MODEL_PATTERN.test(configured)
      ? configured
      : DEFAULT_GEMINI_MODEL;
  }
}
