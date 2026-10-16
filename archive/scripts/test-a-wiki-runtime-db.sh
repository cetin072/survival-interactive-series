#!/usr/bin/env bash
set -euo pipefail
# Uses standard PG* variables; only run against an isolated test database.
for file in \
 supabase/tests/a_wiki_native_jobs_test_bootstrap.sql \
 supabase/migrations/20261004012234_a_wiki_native_jobs_v1.sql \
 supabase/migrations/20261004053216_a_wiki_review_proposal_sha_contract_v2.sql \
 supabase/migrations/20261004053526_a_wiki_blocked_retry_v1.sql \
 supabase/migrations/20261005101808_a_wiki_native_jobs_recovery_v1.sql \
 supabase/migrations/20261012050000_a_wiki_label_correction_v1.sql \
 supabase/migrations/20261013223500_a_wiki_native_review_relation_revision_v1.sql \
 supabase/migrations/20261016141219_a_wiki_continuous_runtime_v1.sql \
 supabase/tests/a_wiki_native_jobs_recovery_verification.sql \
 supabase/tests/a_wiki_native_jobs_label_correction.sql \
 supabase/tests/a_wiki_native_jobs_human_review_revision.sql \
 supabase/tests/a_wiki_continuous_runtime.sql; do
 psql -v ON_ERROR_STOP=1 --file "$file"
done
