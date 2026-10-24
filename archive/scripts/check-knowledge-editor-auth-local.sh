#!/usr/bin/env bash
# Disposable integration only. No production secrets, DB URLs or external dispatch.
set -euo pipefail
cd "$(dirname "$0")/../.."
repo_root="$PWD"
output_dir="${1:-/tmp/knowledge-editor-auth-local}"
mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
fixture_name="knowledge-editor-626-$$"
fixture_dir="$(mktemp -d /tmp/knowledge-editor-auth-XXXXXX)"
cleanup() {
  docker rm -f "$fixture_name-auth" "$fixture_name-rest" "$fixture_name-db" >/dev/null 2>&1 || true
  docker network rm "$fixture_name" >/dev/null 2>&1 || true
  rm -rf "$fixture_dir"
}
trap cleanup EXIT
# Reuse the repository's CI bootstrap verbatim, excluding the separate legacy
# fixture pipe (requires host Node and is tested separately by the DB CI job).
python - "$fixture_dir/bootstrap.sh" <<'PY'
from pathlib import Path
import sys
text=Path('.github/workflows/archive-exporter-migration.yml').read_text()
start=text.index('      - name: Create Supabase API roles for Knowledge migrations')
end=text.index('\n  illustration-db-contract:',start)
lines=['set -eu'];block=False
for line in text[start:end].splitlines():
 if line.startswith('        run: '):
  block=line.endswith('|')
  if not block: lines.append(line[len('        run: '):])
 elif block and line.startswith('          '):
  if 'knowledge-editor-legacy-fixture.mjs' not in line: lines.append(line[10:])
 elif line.strip():block=False
Path(sys.argv[1]).write_text('\n'.join(lines)+'\n')
PY
docker network create --internal "$fixture_name" >/dev/null
docker run -d --name "$fixture_name-db" --network "$fixture_name" -e POSTGRES_PASSWORD=isolated-fixture-only -v "$repo_root:/repo:ro" -v "$fixture_dir/bootstrap.sh:/verify.sh:ro" -w /repo postgres:17 >/dev/null
for attempt in $(seq 1 40); do
  if docker exec "$fixture_name-db" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 0.25
done
docker exec -e PGUSER=postgres "$fixture_name-db" sh /verify.sh > "$output_dir/db-bootstrap.log" 2>&1
docker exec -e PGUSER=postgres "$fixture_name-db" psql -c 'ALTER DATABASE knowledge_semantic_test SET search_path=auth,public;' >/dev/null
docker run -d --name "$fixture_name-auth" --network "$fixture_name" \
 -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 \
 -e API_EXTERNAL_URL=http://127.0.0.1:54330/auth/v1 -e GOTRUE_SITE_URL=http://127.0.0.1:54330 \
 -e GOTRUE_DB_DRIVER=postgres -e "GOTRUE_DB_DATABASE_URL=postgres://postgres:isolated-fixture-only@$fixture_name-db:5432/knowledge_semantic_test" \
 -e GOTRUE_JWT_SECRET=local-editor-integration-only-not-a-production-secret -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
 -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_MAILER_AUTOCONFIRM=true supabase/gotrue:v2.177.0 >/dev/null
docker run -d --name "$fixture_name-rest" --network "$fixture_name" \
 -e "PGRST_DB_URI=postgres://postgres:isolated-fixture-only@$fixture_name-db:5432/knowledge_semantic_test" \
 -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
 -e PGRST_JWT_SECRET=local-editor-integration-only-not-a-production-secret postgrest/postgrest:v12.2.3 >/dev/null
for attempt in $(seq 1 40); do
  if docker exec "$fixture_name-auth" wget -Y off -qO- http://127.0.0.1:9999/health >/dev/null 2>&1; then break; fi
  sleep 0.25
done
auth_ip="$(docker inspect "$fixture_name-auth" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
rest_ip="$(docker inspect "$fixture_name-rest" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
(cd archive/web && VITE_SUPABASE_URL=http://127.0.0.1:54330 VITE_SUPABASE_PUBLISHABLE_KEY=local-integration-public-key npm run build:verified) > "$output_dir/build.log" 2>&1
python archive/scripts/check-knowledge-editor-auth-local.py --auth-url "http://$auth_ip:9999" --rest-url "http://$rest_ip:3000" --db-container "$fixture_name-db" --output "$output_dir"
