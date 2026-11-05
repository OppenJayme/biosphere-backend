#!/usr/bin/env bash
# Runs the compiled backend against the disposable stack. The working directory
# holds no .env, and every value below is local, so hosted credentials are never
# loaded. Port 3901 keeps clear of a developer's own server on 3001.
set -euo pipefail
HARNESS="$(cd "$(dirname "$0")" && pwd)"
RUN="${AUDIT_RUN_DIR:-$(cygpath -u "$TEMP")/biosphere-srs-audit}"
set -a; . "$RUN/audit.env"; set +a
cd "$RUN/build"
[ ! -e .env ] || { echo "refusing to run: .env present in $RUN/build"; exit 1; }

node "$HARNESS/sidecar.mjs" > "$RUN/sidecar.log" 2>&1 &
SIDE=$!
trap 'kill $SIDE 2>/dev/null || true' EXIT

env -i PATH="$PATH" SYSTEMROOT="${SYSTEMROOT:-C:\\Windows}" TEMP="$TEMP" TMP="$TEMP" \
  NODE_ENV=development PORT=3901 \
  DATABASE_URL="postgresql://postgres:$AUDIT_DB_PASSWORD@127.0.0.1:18399/postgres" \
  SUPABASE_URL=http://127.0.0.1:18397 \
  SUPABASE_SECRET_KEY="$AUDIT_SERVICE_KEY" SUPABASE_ANON_KEY="$AUDIT_ANON_KEY" \
  FRONTEND_URL=http://localhost:3000 PUBLIC_SITE_URL=http://localhost:3000 \
  CORS_ORIGINS=http://localhost:3000 \
  BREVO_API_KEY=audit-local-sink MAIL_FROM_EMAIL=audit@example.invalid \
  MAIL_FROM_NAME="USC Biological Museum" \
  FAQ_REVIEW_ENABLED="${FAQ_REVIEW_ENABLED:-true}" \
  NOTIFICATION_STATE_ENABLED="${NOTIFICATION_STATE_ENABLED:-true}" \
  AUDIT_EGRESS_LOG="$(cygpath -w "$RUN/egress.log")" \
  AUDIT_BREVO_SINK=http://127.0.0.1:18394/v3/smtp/email \
  node -r "$(cygpath -w "$HARNESS/egress-guard.cjs")" dist/main.js
