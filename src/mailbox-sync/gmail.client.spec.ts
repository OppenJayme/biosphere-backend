import { ConfigService } from '@nestjs/config';
import { GmailApiError, GmailClient } from './gmail.client';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SECRET = 'client-secret-value';
const REFRESH = 'refresh-token-value';

const json = (status: number, body: unknown) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);

describe('GmailClient', () => {
  const env: Record<string, string | undefined> = {};
  const config = { get: jest.fn((key: string) => env[key]) };
  let fetchMock: jest.SpyInstance;
  let client: GmailClient;

  beforeEach(() => {
    Object.assign(env, {
      GMAIL_CLIENT_ID: 'client-id',
      GMAIL_CLIENT_SECRET: SECRET,
      GMAIL_REFRESH_TOKEN: REFRESH,
      GMAIL_MAILBOX: 'museum@example.com',
    });
    fetchMock = jest.spyOn(global, 'fetch');
    client = new GmailClient(config as unknown as ConfigService);
  });

  afterEach(() => {
    fetchMock.mockRestore();
    jest.useRealTimers();
  });

  const tokenOk = (expiresIn = 3600) =>
    json(200, { access_token: 'access-1', expires_in: expiresIn });

  it.each([
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REFRESH_TOKEN',
    'GMAIL_MAILBOX',
  ])('is not configured without %s', (key) => {
    env[key] = '';
    expect(client.isConfigured()).toBe(false);
  });

  it('is configured when every credential and the mailbox are set', () => {
    expect(client.isConfigured()).toBe(true);
  });

  it('refreshes a token, then lists ids across pages with the query', async () => {
    fetchMock
      .mockImplementationOnce(() => tokenOk())
      .mockImplementationOnce(() =>
        json(200, { messages: [{ id: 'a' }], nextPageToken: 'p2' }),
      )
      .mockImplementationOnce(() => json(200, { messages: [{ id: 'b' }] }));

    await expect(client.listMessageIds('in:inbox after:1')).resolves.toEqual([
      'a',
      'b',
    ]);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(tokenUrl).toBe(TOKEN_URL);
    expect((tokenInit.body as URLSearchParams).toString()).toContain(
      'grant_type=refresh_token',
    );
    const [secondUrl, secondInit] = fetchMock.mock.calls[2] as [
      string,
      RequestInit,
    ];
    expect(secondUrl).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in%3Ainbox+after%3A1&maxResults=50&pageToken=p2',
    );
    expect(secondInit.headers).toEqual({ authorization: 'Bearer access-1' });
  });

  it('stops after maxPages even when Gmail offers more', async () => {
    fetchMock
      .mockImplementationOnce(() => tokenOk())
      .mockImplementation(() =>
        json(200, { messages: [{ id: 'x' }], nextPageToken: 'more' }),
      );

    await expect(client.listMessageIds('q', 2)).resolves.toEqual(['x', 'x']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reuses the access token until shortly before it expires', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-11-11T00:00:00.000Z'));
    fetchMock.mockImplementation((url: string) =>
      url === TOKEN_URL ? tokenOk(3600) : json(200, { id: 'm1' }),
    );

    await client.getMessage('m1');
    await client.getMessage('m1');
    expect(
      fetchMock.mock.calls.filter(([url]) => url === TOKEN_URL),
    ).toHaveLength(1);

    // One minute before Google's expiry the token is renewed.
    jest.setSystemTime(new Date('2026-11-11T00:59:30.000Z'));
    await client.getMessage('m1');
    expect(
      fetchMock.mock.calls.filter(([url]) => url === TOKEN_URL),
    ).toHaveLength(2);
  });

  it('asks for the full message and escapes the id in the path', async () => {
    fetchMock
      .mockImplementationOnce(() => tokenOk())
      .mockImplementationOnce(() => json(200, { id: 'a/b' }));

    await client.getMessage('a/b');

    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/a%2Fb?format=full',
    );
  });

  it('reports an expired refresh token without leaking any secret', async () => {
    fetchMock.mockImplementationOnce(() =>
      json(400, { error: 'invalid_grant', error_description: REFRESH }),
    );

    const failure = client.listMessageIds('q');

    await expect(failure).rejects.toBeInstanceOf(GmailApiError);
    await expect(failure).rejects.toThrow(
      'Google token refresh failed (HTTP 400, invalid_grant).',
    );
    const message = await failure.catch((error: Error) => error.message);
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain(REFRESH);
  });

  it('turns a Gmail error into GmailApiError with only the status', async () => {
    fetchMock
      .mockImplementationOnce(() => tokenOk())
      .mockImplementationOnce(() => json(500, { error: { message: 'boom' } }));

    await expect(client.getMessage('m1')).rejects.toThrow(
      'Gmail API returned HTTP 500.',
    );
  });

  it('drops a revoked access token so the next call refreshes it', async () => {
    fetchMock
      .mockImplementationOnce(() => tokenOk())
      .mockImplementationOnce(() => json(401, {}))
      .mockImplementationOnce(() =>
        json(200, { access_token: 'access-2', expires_in: 3600 }),
      )
      .mockImplementationOnce(() => json(200, { id: 'm1' }));

    await expect(client.getMessage('m1')).rejects.toBeInstanceOf(GmailApiError);
    await expect(client.getMessage('m1')).resolves.toEqual({ id: 'm1' });

    const lastInit = fetchMock.mock.calls[3][1] as RequestInit;
    expect(lastInit.headers).toEqual({ authorization: 'Bearer access-2' });
  });
});
