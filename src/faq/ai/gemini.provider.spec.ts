import { ConfigService } from '@nestjs/config';
import { AiProviderError } from './ai-provider';
import { DEFAULT_GEMINI_MODEL, GeminiProvider } from './gemini.provider';

const REQUEST = {
  system: 'system rules',
  prompt: '{"latestQuestion":"Where is the museum?"}',
  responseSchema: { type: 'OBJECT' },
  maxOutputTokens: 300,
  timeoutMs: 1000,
};

function provider(values: Record<string, string | undefined>) {
  return new GeminiProvider({
    get: (key: string) => values[key],
  } as unknown as ConfigService);
}

function reply(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

function candidate(text: string, finishReason = 'STOP') {
  return { candidates: [{ finishReason, content: { parts: [{ text }] } }] };
}

describe('GeminiProvider', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('is not configured without a key and makes no request', async () => {
    const gemini = provider({});
    expect(gemini.isConfigured()).toBe(false);
    await expect(gemini.generateJson(REQUEST)).rejects.toMatchObject({
      kind: 'not_configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the key only in a header and parses the JSON answer', async () => {
    fetchMock.mockResolvedValue(
      reply(candidate('{"status":"NO_ANSWER","answer":"","sourceIds":[]}')),
    );
    const gemini = provider({ GEMINI_API_KEY: 'secret-key' });

    await expect(gemini.generateJson(REQUEST)).resolves.toEqual({
      status: 'NO_ANSWER',
      answer: '',
      sourceIds: [],
    });

    const [url, init = {}] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`,
    );
    expect(url).not.toContain('secret-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'secret-key',
    );
    const body = JSON.parse(init.body as string) as {
      systemInstruction: { parts: Array<{ text: string }> };
      generationConfig: { responseMimeType: string; maxOutputTokens: number };
    };
    expect(body.systemInstruction.parts[0].text).toBe('system rules');
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      maxOutputTokens: 300,
    });
  });

  it('uses a configured model and ignores an unsafe model name', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reply(candidate('{}'))));
    await provider({
      GEMINI_API_KEY: 'k',
      GEMINI_MODEL: 'gemini-3.1-flash-lite',
    }).generateJson(REQUEST);
    await provider({
      GEMINI_API_KEY: 'k',
      GEMINI_MODEL: '../../evil?x=1',
    }).generateJson(REQUEST);
    expect(fetchMock.mock.calls[0][0]).toContain(
      '/models/gemini-3.1-flash-lite:',
    );
    expect(fetchMock.mock.calls[1][0]).toContain(
      `/models/${DEFAULT_GEMINI_MODEL}:`,
    );
  });

  it.each([
    [reply({}, 429, { 'retry-after': '30' }), 'rate_limited'],
    [reply({ error: {} }, 403), 'unavailable'],
    [reply({ promptFeedback: { blockReason: 'SAFETY' } }), 'blocked'],
    [reply(candidate('{"a":1}', 'SAFETY')), 'blocked'],
    [reply(candidate('{"a":', 'MAX_TOKENS')), 'invalid_response'],
    [reply(candidate('not json')), 'invalid_response'],
    [reply({ candidates: [] }), 'invalid_response'],
  ])('maps a failed response to a typed error', async (response, kind) => {
    fetchMock.mockResolvedValue(response);
    const error = (await provider({ GEMINI_API_KEY: 'k' })
      .generateJson(REQUEST)
      .catch((e: unknown) => e)) as AiProviderError;
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.kind).toBe(kind);
  });

  it('keeps the HTTP status of a failed request for diagnostics', async () => {
    fetchMock.mockResolvedValue(reply({ error: {} }, 404));
    const error = (await provider({ GEMINI_API_KEY: 'k' })
      .generateJson(REQUEST)
      .catch((e: unknown) => e)) as AiProviderError;
    expect(error).toMatchObject({ kind: 'unavailable', httpStatus: 404 });
  });

  it('reports Retry-After and timeouts', async () => {
    fetchMock.mockResolvedValueOnce(reply({}, 429, { 'retry-after': '30' }));
    const limited = (await provider({ GEMINI_API_KEY: 'k' })
      .generateJson(REQUEST)
      .catch((e: unknown) => e)) as AiProviderError;
    expect(limited.retryAfterMs).toBe(30_000);

    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
    );
    await expect(
      provider({ GEMINI_API_KEY: 'k' }).generateJson(REQUEST),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
});
