import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GmailMessage } from './reply-parser';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const REQUEST_TIMEOUT_MS = 15_000;
// Renew a little before Google's expiry so a request never races it.
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export class GmailApiError extends Error {}

// Minimal read-only Gmail REST client. It uses an OAuth refresh token for
// the museum mailbox (scope gmail.readonly) kept in server env vars, so no
// token is ever stored in the database or sent to the browser.
@Injectable()
export class GmailClient {
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('GMAIL_CLIENT_ID') &&
      this.config.get<string>('GMAIL_CLIENT_SECRET') &&
      this.config.get<string>('GMAIL_REFRESH_TOKEN') &&
      this.config.get<string>('GMAIL_MAILBOX'),
    );
  }

  // Ids of messages matching a Gmail search query, newest first. Pages to
  // the end by default: a truncated list would drop the oldest messages,
  // and the sync's watermark would then move past them for good.
  async listMessageIds(
    query: string,
    maxPages = Number.POSITIVE_INFINITY,
  ): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({ q: query, maxResults: '50' });
      if (pageToken) params.set('pageToken', pageToken);
      const body = await this.get<{
        messages?: { id: string }[];
        nextPageToken?: string;
      }>(`/messages?${params.toString()}`);
      ids.push(...(body.messages ?? []).map((message) => message.id));
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    return ids;
  }

  getMessage(id: string): Promise<GmailMessage> {
    return this.get<GmailMessage>(
      `/messages/${encodeURIComponent(id)}?format=full`,
    );
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${GMAIL_URL}${path}`, {
      headers: { authorization: `Bearer ${await this.token()}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 401) {
      // The access token was revoked early; get a new one next time.
      this.accessToken = null;
    }
    if (!response.ok) {
      throw new GmailApiError(`Gmail API returned HTTP ${response.status}.`);
    }
    return (await response.json()) as T;
  }

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now()) {
      return this.accessToken.value;
    }
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.get<string>('GMAIL_CLIENT_ID') ?? '',
        client_secret: this.config.get<string>('GMAIL_CLIENT_SECRET') ?? '',
        refresh_token: this.config.get<string>('GMAIL_REFRESH_TOKEN') ?? '',
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!response.ok || !body.access_token) {
      // invalid_grant usually means the refresh token expired or was
      // revoked; it must be re-issued for the museum mailbox.
      throw new GmailApiError(
        `Google token refresh failed (HTTP ${response.status}${
          body.error ? `, ${body.error}` : ''
        }).`,
      );
    }
    this.accessToken = {
      value: body.access_token,
      expiresAt:
        Date.now() + (body.expires_in ?? 3600) * 1000 - TOKEN_EXPIRY_MARGIN_MS,
    };
    return this.accessToken.value;
  }
}
