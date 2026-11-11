# Visitor reply sync: deploy and Google setup

How to ship and switch on the read only import of visitor email replies
(spec `docs/specs/0002-gmail-visitor-reply-sync.md`). These are recommended
steps; check each with the team before running it on the live server.

## 1. Deploy order (live server)

1. Merge the visit calendar PR first, then the visitor reply PR.
2. Apply the migration to the production database **before** restarting the
   backend:

   ```bash
   npx prisma migrate deploy
   ```

   It is additive (`20261111000000_add_mailbox_reply_sync`): a nullable
   `external_message_id`, `recorded_by` allowed to be null only for `INBOUND`
   rows, and the `gmail_sync_state` table. Without it, history reads and
   curator emails fail on the missing column.
3. Restart the backend with `GMAIL_SYNC_ENABLED=false` (or unset). Outbound
   emails start storing Brevo's Message-ID, which replies match on later.
4. Check that a visit request history opens and a curator email sends.

## 2. Google Cloud project and OAuth client

Decide first who owns the Google Cloud project. It should be an institution
owned account the museum keeps, not a student's personal account, because the
refresh token stops working if the owner leaves or the project is deleted.

1. In Google Cloud Console, create a project for BioSphere and enable the
   Gmail API.
2. Configure the OAuth consent screen:
   - User type **External** (a consumer Gmail address has no Workspace).
   - Scope: `https://www.googleapis.com/auth/gmail.readonly` only.
   - Publishing status **In production**. In "Testing" status Google expires
     refresh tokens after 7 days and the sync quietly stops.
   - `gmail.readonly` is a restricted scope. An app in production that only
     its own owner authorizes usually runs with an "unverified app" warning;
     if Google asks for verification, plan for that review before relying on
     the sync.
3. Create an OAuth client ID (type Web application). Add
   `https://developers.google.com/oauthplayground` as an authorized redirect
   URI if you use the playground below.

## 3. Refresh token from the mailbox owner

The museum mailbox owner signs in once:

1. Open the OAuth 2.0 Playground, open its settings, tick "Use your own OAuth
   credentials" and paste the client ID and secret.
2. Authorize only `https://www.googleapis.com/auth/gmail.readonly`, signed in
   as the museum mailbox.
3. Exchange the code and copy the **refresh token**.

Treat the client secret and refresh token like passwords. Keep them only in
the server's `.env`, never in Git, chat or documents.

## 4. Switch it on

Set these on the server, then restart:

```
GMAIL_SYNC_ENABLED=true
GMAIL_MAILBOX=<the museum address>
GMAIL_CLIENT_ID=<from step 2>
GMAIL_CLIENT_SECRET=<from step 2>
GMAIL_REFRESH_TOKEN=<from step 3>
```

Optional: `GMAIL_SYNC_INTERVAL_SECONDS` (default 120, minimum 60) and
`GMAIL_SYNC_LOOKBACK_DAYS` (default 14, maximum 90).

Watch `GET /mailbox-sync/status`, or the Check for replies panel in any
inquiry history, for `lastSuccessAt` and `lastError`.

## 5. Turning it off

Set `GMAIL_SYNC_ENABLED=false` and restart. Imported replies stay. To cut
access completely, the mailbox owner removes BioSphere under Google Account,
Security, Third party access, which revokes the refresh token.

## Before enabling

The privacy notice must say that replies to museum emails are copied into the
request's record (frontend `/privacy`).
