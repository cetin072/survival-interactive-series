#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
container="bunker-roadmap-test-${RANDOM}"
helper=$(mktemp)
trap 'docker rm -f "$container" >/dev/null 2>&1 || true; rm -f "$helper"' EXIT
python3 - "$helper" <<'PY'
from pathlib import Path
import sys
s=Path('supabase/migrations/20260929173506_archive_review_control_plane_v1.sql').read_text()
a=s.index('create or replace function survival_ops.private_require_archive_operator()')
b=s.index('create or replace function public.archive_operator_review_inbox()',a)
Path(sys.argv[1]).write_text(s[a:b])
PY
docker run --network none --name "$container" -e POSTGRES_PASSWORD=isolated-only -d postgres:17 >/dev/null
for attempt in {1..30}; do docker exec "$container" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker cp "$helper" "$container:/tmp/roadmap-helper.sql"
docker cp supabase/migrations/20261010230000_bunker_os_operator_log_v1.sql "$container:/tmp/roadmap-v1.sql"
docker cp supabase/migrations/20261011005000_bunker_os_supervisor_dashboard_v1_1.sql "$container:/tmp/roadmap-v11.sql"
docker cp supabase/migrations/20261027142431_bunker_roadmap_reads_v2.sql "$container:/tmp/roadmap-v2.sql"
docker cp supabase/tests/bunker_roadmap_reads_v2.sql "$container:/tmp/test.sql"
docker exec "$container" psql -U postgres -f /tmp/test.sql
