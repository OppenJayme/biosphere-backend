#!/usr/bin/env bash
# Removes the disposable stack. Removes the node_modules junction with rmdir
# first, so the repo's own node_modules is never followed or deleted.
set -uo pipefail
HARNESS="$(cd "$(dirname "$0")" && pwd)"
RUN="${AUDIT_RUN_DIR:-$(cygpath -u "$TEMP")/biosphere-srs-audit}"
export DOCKER_HOST=npipe:////./pipe/dockerDesktopLinuxEngine
set -a; . "$RUN/audit.env"; set +a
docker compose -f "$HARNESS/compose.yml" --profile app down --volumes
[ -e "$RUN/build/node_modules" ] && cmd //c rmdir "$(cygpath -w "$RUN/build/node_modules")"
if [ -e "$RUN/build/node_modules" ]; then echo "junction still present; not deleting $RUN"; exit 1; fi
rm -rf "$RUN"
echo removed
