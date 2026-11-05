#!/usr/bin/env bash
# Brings up the disposable stack and compiles the backend OUTSIDE the repo
# (dist/ is untouched). Never reads the repo's .env. Run from Git Bash.
# Usage: bash docs/progress-report-backend/harness/up.sh
set -euo pipefail
HARNESS="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HARNESS/../../.." && pwd)"
RUN="${AUDIT_RUN_DIR:-$(cygpath -u "$TEMP")/biosphere-srs-audit}"
export DOCKER_HOST=npipe:////./pipe/dockerDesktopLinuxEngine
mkdir -p "$RUN"

if [ ! -f "$RUN/audit.env" ]; then
  node -e '
    const c=require("crypto");
    const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64url");
    const secret=c.randomBytes(32).toString("hex");
    const jwt=(role)=>{const h=b({alg:"HS256",typ:"JWT"})+"."+b({role,iss:"supabase",iat:1700000000,exp:2000000000});
      return h+"."+c.createHmac("sha256",secret).update(h).digest("base64url")};
    console.log("AUDIT_DB_PASSWORD="+c.randomBytes(16).toString("hex"));
    console.log("AUDIT_JWT_SECRET="+secret);
    console.log("AUDIT_ANON_KEY="+jwt("anon"));
    console.log("AUDIT_SERVICE_KEY="+jwt("service_role"));
  ' > "$RUN/audit.env"
fi
set -a; . "$RUN/audit.env"; set +a
COMPOSE="docker compose -f $HARNESS/compose.yml"

$COMPOSE up -d --wait db mail
psql_su() { $COMPOSE exec -T db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres "$@"; }

psql_su -q <<SQL
ALTER ROLE supabase_auth_admin WITH PASSWORD '$AUDIT_DB_PASSWORD';
ALTER ROLE supabase_storage_admin WITH PASSWORD '$AUDIT_DB_PASSWORD';
ALTER ROLE postgres WITH PASSWORD '$AUDIT_DB_PASSWORD';
ALTER ROLE authenticator WITH PASSWORD '$AUDIT_DB_PASSWORD';
SQL

$COMPOSE --profile app up -d auth storage
for i in $(seq 1 60); do
  a=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18396/health || true)
  s=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18395/status || true)
  [ "$a" = 200 ] && [ "$s" = 200 ] && break
  sleep 2
done
echo "auth=$a storage=$s"

# Application schema: the repo's own migrations, in order, applied only here.
if [ "$(psql_su -Atc "select to_regclass('public.user_account') is not null")" != t ]; then
  for m in $(ls -d "$REPO"/prisma/migrations/*/ | sort); do
    echo "migrate $(basename "$m")"
    psql_su -q < "$m/migration.sql"
  done
  psql_su -q <<SQL
GRANT USAGE ON SCHEMA public, auth TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO postgres;
ALTER ROLE postgres BYPASSRLS;
INSERT INTO storage.buckets (id, name, public) VALUES
  ('specimen-media','specimen-media',false),
  ('exhibit-media','exhibit-media',true),
  ('ar-assets','ar-assets',true),
  ('user-avatars','user-avatars',false),
  ('inquiry-attachments','inquiry-attachments',false)
ON CONFLICT DO NOTHING;
SQL
fi

# Compile from current source into the run directory.
if [ "${AUDIT_SKIP_BUILD:-}" != 1 ]; then
  (cd "$REPO" && npx tsc -p tsconfig.build.json --outDir "$(cygpath -w "$RUN/build/dist")" --incremental false --noEmitOnError false || true)
fi
# Junction, not a copy; down.sh removes only the link.
[ -e "$RUN/build/node_modules" ] || cmd //c mklink //J "$(cygpath -w "$RUN/build/node_modules")" "$(cygpath -w "$REPO/node_modules")"
mkdir -p "$RUN/build/assets" && cp -r "$REPO/assets/." "$RUN/build/assets/"
echo "RUN=$RUN"
