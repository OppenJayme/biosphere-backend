# BioSphere deployment guide (DCISM server)

How to put the backend and frontend on the DCISM web server. Written 10 Nov
2026. Backup and restore, the privacy notice and the department handover are
covered elsewhere and are not part of this guide.

## Hosting layout

| Part | Public address | Local port | pm2 name |
| --- | --- | --- | --- |
| Frontend (Next.js) | https://biosphere.dcism.org | 127.0.0.1:20311 | `biosphere-web` |
| Backend (NestJS) | https://biosphere-api.dcism.org | 127.0.0.1:20312 | `biosphere-api` |
| Database and Auth | Hosted Supabase | n/a | n/a |

- The ports are fixed in the DCISM web admin panel ("Custom Application
  Hosting"). Apache terminates TLS and proxies to `127.0.0.1:<port>`, keeping
  the Host header and sending `X-Forwarded-For` and `X-Forwarded-Proto`.
- The server runs Debian with Node 24, npm, git and pm2. CI uses Node 22, and
  both apps build on 24.
- The server can reach the Supabase pooler. Campus PCs cannot (ports 5432 and
  6543 are blocked), so do not run the backend from a campus PC.
- Before each deployment, check that nothing else is listening on the ports:
  `ss -ltn | grep -E '2031[12]'`.

## 1. Before the first deployment

These are done once, outside the server.

- [ ] **Migrations.** Run `npx prisma migrate status` against the target
  database. Every migration on `main` must be applied. Apply new ones with
  `npx prisma migrate deploy` from an up-to-date `main` checkout, after any
  pre-check the migration's own comments ask for.
- [x] **Test records.** Done on 10 Nov 2026: the shared database was wiped
  except for the FAQ, accounts, the backup record and the starter collections
  and tags. The pre-wipe export is kept outside the repository.
- [ ] **Release.** `main` holds what is deployed. See section 7.
- [ ] **Supabase Auth URLs.** In Supabase, Authentication > URL Configuration:
  - Site URL: `https://biosphere.dcism.org`.
  - Redirect URLs: add `https://biosphere.dcism.org/**`.
  Invite, reset and verify links use these. Keep sign-ups disabled.
- [ ] **Link expiry (REQ-4.1-19).** Set Email OTP expiration to the approved
  period once there is one. The current value is 3600 s.
- [ ] **Email sender.** Set `MAIL_FROM_EMAIL` to a USC-owned address verified in
  Brevo once USC IT provides it.

## 2. Environment files

Copy each `.env.example` and fill it in on the server. Never commit the
results. Set the file mode to 600.

### Backend `.env`

| Setting | Production value |
| --- | --- |
| `PORT` | `20312` (pm2 also sets it) |
| `HOST` | `127.0.0.1` (pm2 also sets it) |
| `TRUST_PROXY` | `loopback` (the default; see `docs/RATE_LIMITING_GUIDE.md`) |
| `SWAGGER_ENABLED` | Leave unset. pm2 sets `NODE_ENV=production`, so `/docs` is off and the route list is not published. Set `true` only for a deliberate, temporary check. |
| `DATABASE_URL`, `DIRECT_URL` | The Supabase pooler URLs |
| `FRONTEND_URL` | `https://biosphere.dcism.org` |
| `PUBLIC_SITE_URL` | `https://biosphere.dcism.org`. QR labels encode this, so set it before printing any label. |
| `CORS_ORIGINS` | `https://biosphere.dcism.org` |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_ANON_KEY` | From the Supabase project |
| `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME` | Brevo key; the USC sender; `USC Biological Museum` |
| `CURATOR_ALERT_EMAILS` | The curator inbox(es) |
| `NOTIFICATION_STATE_ENABLED` | `true` (its migrations are applied) |
| `FAQ_REVIEW_ENABLED` | `false` |
| `RECOVERY_HISTORY_RECORDING_ENABLED` | `false` |
| `CHATBOT_AI_ENABLED`, `GEMINI_API_KEY` | Optional. Without them the FAQ assistant uses curated answers only. |

Values set by pm2 win over `.env`, because the backend does not overwrite
variables that already exist.

### Frontend `.env.local`

| Setting | Production value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From the Supabase project (anon key only) |
| `NEXT_PUBLIC_API_URL` | `https://biosphere-api.dcism.org` |
| `NEXT_PUBLIC_SESSION_IDLE_MINUTES` | `30`, or the value the Curator approves |
| `APP_ORIGIN` | `https://biosphere.dcism.org`. Server-only. The app's upload, report and notification routes compare the browser's `Origin` with it, because behind Apache the request URL is the internal address. Without it those routes answer 403. |

`NEXT_PUBLIC_*` values are built into the app. Rebuild the frontend after
changing any of them. `APP_ORIGIN` is read when the app starts, so a restart is
enough after changing it.

## 3. First deployment

On the server (`ssh -p 22072 <user>@web.dcism.org`).

### Repository access

Both repositories are private. Give the server one read-only deploy key per
repository (GitHub allows a deploy key on only one repository):

```bash
ssh-keygen -t ed25519 -N '' -C biosphere-backend-deploy -f ~/.ssh/biosphere_backend_deploy
ssh-keygen -t ed25519 -N '' -C biosphere-frontend-deploy -f ~/.ssh/biosphere_frontend_deploy
cat >> ~/.ssh/config <<'EOF'
Host github-biosphere-backend
  HostName github.com
  User git
  IdentityFile ~/.ssh/biosphere_backend_deploy
  IdentitiesOnly yes
Host github-biosphere-frontend
  HostName github.com
  User git
  IdentityFile ~/.ssh/biosphere_frontend_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
cat ~/.ssh/biosphere_backend_deploy.pub ~/.ssh/biosphere_frontend_deploy.pub
```

Add each public key in its repository under Settings > Deploy keys, with
"Allow write access" left off. A repository admin has to do this.

### Install and start

```bash
mkdir -p ~/apps && cd ~/apps
git clone -b main github-biosphere-backend:OppenJayme/biosphere-backend.git
git clone -b main github-biosphere-frontend:OppenJayme/biosphere-frontend.git

# Create the env files from section 2, then:
cd ~/apps/biosphere-backend
npm ci            # also generates the Prisma client
npm run build

cd ~/apps/biosphere-frontend
npm ci
npm run build

cd ~/apps/biosphere-backend
pm2 start deploy/ecosystem.config.cjs --only biosphere-api
# Check the API (section 4) before starting the web app:
pm2 start deploy/ecosystem.config.cjs --only biosphere-web
pm2 save
```

If the frontend is not cloned next to the backend, set
`BIOSPHERE_FRONTEND_DIR` before `pm2 start`.

pm2 cannot install a boot service without root. To restart the apps after a
server reboot, add `@reboot pm2 resurrect` with `crontab -e` if cron is
available to your account; otherwise ask DCISM, or run `pm2 resurrect` after a
reboot.

## 4. Smoke checks

Run these after every deployment.

```bash
pm2 status                                   # both online, not restarting
curl -s -o /dev/null -w '%{http_code}\n' https://biosphere-api.dcism.org/   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://biosphere.dcism.org/       # 200
pm2 logs --lines 50                          # no startup errors
```

Then, in a browser:

- [ ] The public home page, a public exhibit page and the FAQ assistant load.
- [ ] A curator can sign in, and the dashboard and specimen list load.
- [ ] An upload works, such as an exhibit photo or an AR asset (no 403
  "Cross-site requests are not allowed").
- [ ] A visit request or general inquiry submits, and the curator alert email
  arrives from the production sender.
- [ ] An exhibit QR label preview encodes `https://biosphere.dcism.org/exhibits/...`.
- [ ] The site installs as a PWA over HTTPS, and offline viewing works after
  one online visit.

## 5. Updating

Merge the change into `main` first (section 7), then:

```bash
cd ~/apps/biosphere-backend && git pull --ff-only && npm ci && npm run build
cd ~/apps/biosphere-frontend && git pull --ff-only && npm ci && npm run build
pm2 restart biosphere-api biosphere-web
```

Apply any new migration (section 1) before restarting the backend that needs
it. Then repeat the smoke checks.

## 6. Rolling back

In the affected checkout, check out the previous commit, then run `npm ci`
before rebuilding, because `package-lock.json` may differ between the two
commits. Restart it with pm2 and repeat the smoke checks.

```bash
cd ~/apps/biosphere-backend      # or ~/apps/biosphere-frontend
git checkout <previous-commit>
npm ci && npm run build
pm2 restart biosphere-api        # or biosphere-web
```

The checkout is now detached from `main`, so section 5's `git pull` will
fail. Run `git checkout main` once the fix is merged, then update as usual.
Each release is tagged (section 7), so `<previous-commit>` can be the previous
tag, such as `v1.0.0`.

A migration that was already applied is not rolled back this way. Ask the
migration's author before changing the database by hand.

## 7. Releasing to main

Day-to-day work merges into `develop`. The server deploys `main`.

1. Make sure `develop` CI is green and no migration is waiting.
2. Open a pull request from `develop` into `main` in each repository, backend
   first. Merge it with a merge commit (not squash), so `main` and `develop`
   share history and the next release merges cleanly.
3. Tag the merge commit on `main`, for example
   `git tag -a v1.0.0 -m "First DCISM release" && git push origin v1.0.0`.
4. Update the server (section 5), backend first, and run the smoke checks.

Do not commit to `main` directly. A fix found after release goes to `develop`
and is released the same way.
