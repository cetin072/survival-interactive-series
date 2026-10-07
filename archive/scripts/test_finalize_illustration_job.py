"""Offline contract tests for Automation B program finalizer identity creation."""
import importlib.util
import json
import pathlib
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
PATH = ROOT / "archive/scripts/finalize-illustration-job.py"
SPEC = importlib.util.spec_from_file_location("automation_b_finalizer", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FinalizerIdentityTests(unittest.TestCase):
    def fixture(self):
        return {
            "job_id": "illustration-loc-west-road-5be38e37b9c4-20260930",
            "subject_id": "loc-west-road",
            "point_id": "point-" + "a" * 64,
            "generation_key": "generation-" + "b" * 64,
            "main_sha": "c" * 40,
            "output_sha256": "d" * 64,
            "output_bytes": 123456,
            "output_width": 1536,
            "output_height": 1024,
            "attempt_no": 1,
            "provider_asset_id": "file_00000000example",
            "prompt_sha256": "e" * 64,
            "review_provider": "native_chatgpt_vision",
            "review_decision": "PASS",
            "review_summary": "matches visual brief",
        }

    def test_identity_path_is_stable_and_subject_scoped(self):
        self.assertEqual(
            MODULE.identity_path_for_subject("loc-west-road"),
            "archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_LOC_WEST_ROAD.json",
        )
        self.assertEqual(
            MODULE.identity_path_for_subject("char-taehoon"),
            "archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_CHAR_TAEHOON.json",
        )

    def test_identity_type_prefix_prevents_same_suffix_collision(self):
        for suffix in ['shelter', 'foo', 'foo-bar']:
            paths = {MODULE.identity_path_for_subject(f'{kind}-{suffix}')
                     for kind in ['char', 'loc', 'event']}
            self.assertEqual(len(paths), 3)
        for invalid in ['shelter', 'char/foo', '../event-foo', 'event-', 'event_FOO']:
            with self.assertRaisesRegex(ValueError, 'FINALIZER_IDENTITY_SUBJECT_INVALID'):
                MODULE.identity_path_for_subject(invalid)

    def test_existing_legacy_loc_shelter_is_reused_without_rename(self):
        legacy = 'archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_SHELTER.json'
        payload = json.loads((ROOT / legacy).read_text(encoding='utf-8'))
        job = self.fixture() | {'subject_id': 'loc-shelter'}
        with mock.patch.object(MODULE, 'checkout_main'), \
             mock.patch.object(MODULE, 'identity_payload', return_value=payload), \
             mock.patch.object(MODULE, 'main_has', side_effect=lambda path: path == legacy), \
             mock.patch.object(MODULE, 'run', return_value=json.dumps(payload)), \
             mock.patch.object(MODULE, 'commit_for_path', return_value='a'*40), \
             mock.patch.object(MODULE, 'ensure_json_request') as create:
            self.assertEqual(MODULE.ensure_identity(job), (legacy, 'a'*40))
            create.assert_not_called()

    def test_published_legacy_shelter_still_passes_storage_identity_contract(self):
        import illustration_storage_handoff as handoff
        path = ROOT / 'archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_SHELTER.json'
        record, _, point, object_path = handoff.identity(path, allow_published=True)
        self.assertEqual(record['subject_id'], 'loc-shelter')
        self.assertEqual(point['subject_id'], record['subject_id'])
        manifest = json.loads(MODULE.SITE_ASSETS.read_text(encoding='utf-8'))
        assets = [a for a in manifest['assets'] if a['subject_id']=='loc-shelter']
        self.assertEqual(len(assets), 1)
        self.assertEqual(assets[0]['source_sha256'], record['source_sha256'])
        self.assertEqual(assets[0]['storage_object_path'], object_path)

    def test_event_shelter_ignores_other_subject_legacy_and_creates_typed_identity(self):
        legacy = 'archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_SHELTER.json'
        job = self.fixture() | {'subject_id': 'event-shelter'}
        canonical = MODULE.identity_path_for_subject(job['subject_id'])
        with mock.patch.object(MODULE, 'checkout_main'), \
             mock.patch.object(MODULE, 'main_has', side_effect=lambda path: path == legacy), \
             mock.patch.object(MODULE, 'run', return_value=(ROOT/legacy).read_text(encoding='utf-8')), \
             mock.patch.object(MODULE, 'ensure_json_request', return_value='b'*40) as create:
            self.assertEqual(MODULE.ensure_identity(job), (canonical, 'b'*40))
            self.assertTrue(canonical.endswith('ILLUSTRATION_E2E_EVENT_SHELTER.json'))
            self.assertEqual(create.call_args.args[:2], (canonical, MODULE.identity_payload(job)))

    def test_same_subject_identity_is_idempotent_and_conflicting_payload_fails_closed(self):
        job = self.fixture()
        payload = MODULE.identity_payload(job)
        for legacy in [False, True]:
            canonical = MODULE.identity_path_for_subject(job['subject_id'])
            path = canonical.replace('LOC_', '') if legacy else canonical
            with mock.patch.object(MODULE, 'checkout_main'), \
                 mock.patch.object(MODULE, 'main_has', side_effect=lambda p: p == path), \
                 mock.patch.object(MODULE, 'commit_for_path', return_value='a'*40), \
                 mock.patch.object(MODULE, 'run', return_value=json.dumps(payload)), \
                 mock.patch.object(MODULE, 'ensure_json_request') as create:
                self.assertEqual(MODULE.ensure_identity(job), (path, 'a'*40))
                create.assert_not_called()
            with mock.patch.object(MODULE, 'checkout_main'), \
                 mock.patch.object(MODULE, 'main_has', side_effect=lambda p: p == path), \
                 mock.patch.object(MODULE, 'run', return_value=json.dumps(payload | {'source_sha256':'f'*64})), \
                 mock.patch.object(MODULE, 'ensure_json_request') as create:
                with self.assertRaisesRegex(ValueError, 'FINALIZER_IDENTITY_EXISTING_CONFLICT'):
                    MODULE.ensure_identity(job)
                create.assert_not_called()

    def test_identity_payload_is_programmatic_and_review_bound(self):
        payload = MODULE.identity_payload(self.fixture())
        self.assertEqual(payload["version"], "illustration-e2e-identity-v1")
        self.assertEqual(payload["provider"], "image_gen.imagegen")
        self.assertEqual(payload["surface"], "CHATGPT_SCHEDULED_IMAGEGEN_QUEUE")
        self.assertEqual(payload["content_review"], "MATCHES_INTENDED_BRIEF")
        self.assertTrue(payload["unattended_generation_proven"])
        self.assertEqual(payload["accepted_image_count"], 1)
        self.assertEqual(payload["paid_api_calls"], 0)
        self.assertEqual(payload["review_provider"], "native_chatgpt_vision")
        self.assertEqual(payload["render_queue_job_id"], self.fixture()["job_id"])

    def test_identity_payload_rejects_missing_review_binding(self):
        job = self.fixture()
        job["provider_asset_id"] = None
        with self.assertRaisesRegex(ValueError, "FINALIZER_IDENTITY_JOB_INCOMPLETE"):
            MODULE.identity_payload(job)

    def test_finalizer_rejects_non_pass_review_decision_before_side_effects(self):
        job = self.fixture()
        job.update({
            "status": "FINALIZE_QUEUED",
            "review_decision": "REJECT",
            "review_staging_id": "illustration-review-staging-0001",
        })
        with mock.patch.object(MODULE, "checkout_main"), \
             mock.patch.object(MODULE, "rpc", return_value=job) as rpc:
            with self.assertRaisesRegex(ValueError, "FINALIZER_REVIEW_DECISION_NOT_PASS"):
                MODULE.finalize(job["job_id"])
        rpc.assert_called_once_with(
            "archive_illustration_render_job_readback",
            {"p_job_id": job["job_id"]},
        )

    def test_reviewer_runtime_contract_binds_each_mutation_and_decision_lifecycle(self):
        contract_path = ROOT / "archive/automation/illustration-reviewer-runtime-contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        self.assertEqual(contract["version"], "illustration-reviewer-runtime-contract-v2")
        self.assertTrue(contract["rollout_dependency"]["current_reservation_compatible"])
        self.assertEqual(
            contract["binding_snapshot"]["required_fields"],
            [
                "job_id", "attempt_no", "point_id", "generation_key", "subject_id",
                "prompt_sha256", "review_context_version", "review_context_sha256",
            ],
        )
        self.assertEqual(contract["binding_snapshot"]["authority"], "job.review_context")
        self.assertEqual(
            contract["review_context_authority"]["render_cues"],
            "ALLOWED_NOT_REQUIRED_NOT_NEW_CANON",
        )
        self.assertEqual(
            contract["review_context_authority"]["context_path"],
            "job.review_context",
        )
        self.assertEqual(
            contract["lease_acquire"]["rpc"],
            "archive_illustration_render_job_lease_acquire",
        )
        self.assertEqual(
            contract["lease_acquire"]["allowed_job_statuses"],
            ["PREPARED", "INGESTING", "READY_FOR_REVIEW"],
        )
        expected_rpcs = {
            "archive_illustration_review_staging_begin",
            "archive_illustration_review_staging_chunk_put",
            "archive_illustration_review_staging_finalize",
            "archive_illustration_review_complete",
        }
        self.assertEqual({item["rpc"] for item in contract["mutations"]}, expected_rpcs)
        expected_token_paths = {
            "archive_illustration_review_staging_begin": "p_meta.lease_token",
            "archive_illustration_review_staging_chunk_put": "p_lease_token",
            "archive_illustration_review_staging_finalize": "p_lease_token",
            "archive_illustration_review_complete": "p_review.lease_token",
        }
        for item in contract["mutations"]:
            self.assertEqual(item["token_path"], expected_token_paths[item["rpc"]])
            value = item["request"]
            for key in item["token_path"].split("."):
                value = value[key]
            self.assertEqual(value, "<lease_token_from_acquire>")
        lifecycle = contract["decision_lifecycle"]
        self.assertEqual(lifecycle["HUMAN_REVIEW"]["lease_until"], "decision_time + 7 days")
        self.assertIsNone(lifecycle["HUMAN_REVIEW"]["lease_owner"])
        self.assertIsNone(lifecycle["HUMAN_REVIEW"]["lease_token"])
        self.assertFalse(lifecycle["HUMAN_REVIEW"]["worker_may_acquire_during_sla"])
        self.assertEqual(lifecycle["REJECT"]["final_status"], "REVIEW_REJECTED")
        self.assertIsNone(lifecycle["REJECT"]["lease_owner"])
        self.assertIsNone(lifecycle["REJECT"]["lease_token"])
        self.assertIsNone(lifecycle["REJECT"]["lease_until"])
        self.assertEqual(lifecycle["PASS"]["final_status"], "FINALIZE_QUEUED")
        self.assertIsNone(lifecycle["PASS"]["lease_owner"])
        self.assertIsNone(lifecycle["PASS"]["lease_token"])
        review_complete = next(
            item for item in contract["mutations"]
            if item["rpc"] == "archive_illustration_review_complete"
        )
        self.assertEqual(
            review_complete["request"]["p_review"]["review_context_sha256"],
            "<exact_context_hash>",
        )
        self.assertEqual(
            review_complete["context_hash_path"],
            "p_review.review_context_sha256",
        )
        self.assertTrue(contract["review_staging_policy"]["required_for_every_decision"])
        self.assertEqual(
            review_complete["required_fields"],
            ["review_staging_id", "provider_asset_id"],
        )
        self.assertEqual(
            review_complete["request"]["p_review"]["review_staging_id"],
            "<staging_id>",
        )
        self.assertEqual(
            review_complete["request"]["p_review"]["provider_asset_id"],
            "<provider_asset_id>",
        )
        self.assertEqual(contract["vault"]["retention_days"], 30)
        self.assertFalse(contract["vault"]["ai_schedule_added"])
        self.assertEqual(
            lifecycle["REJECT"]["vault"],
            "REQUIRED_30_DAY_PRIVATE_ARCHIVE",
        )
        self.assertEqual(
            contract["legacy_compatibility"]["null_context_hash"],
            "PRE_V2_PATH_ALLOWED",
        )

    def test_finalizer_heartbeat_renews_current_job_lease(self):
        MODULE.CURRENT_JOB = {"job_id": "illustration-test-0001"}
        MODULE.LEASE_TOKEN = "00000000-0000-0000-0000-000000000001"
        with mock.patch.object(MODULE, "rpc", return_value={"status": "LEASE_RENEWED"}) as rpc:
            MODULE.heartbeat()
        rpc.assert_called_once_with("archive_illustration_render_job_lease_heartbeat", {
            "p_job_id": "illustration-test-0001",
            "p_lease_token": MODULE.LEASE_TOKEN,
            "p_lease_seconds": 7200,
        })

    def test_pr_check_propagation_budget_is_at_least_ten_minutes(self):
        self.assertGreaterEqual(
            MODULE.PR_CHECK_PROPAGATION_ATTEMPTS * MODULE.PR_CHECK_PROPAGATION_POLL_SECONDS,
            600,
        )

    def test_check_timeout_recovery_requires_exact_clean_passed_identity_pr(self):
        job = self.fixture()
        job.update({
            "status": "BLOCKED",
            "blocker_code": MODULE.RECOVERABLE_CHECK_TIMEOUT,
            "blocker_stage": "PROGRAM_FINALIZER",
            "review_staging_id": "site-event-network-decay-da22faf4814c",
        })
        branch = f"automation/finalize-identity-{job['job_id']}"
        identity_path = MODULE.identity_path_for_subject(job["subject_id"])
        head = "a" * 40
        existing = {"number": 436, "headRefOid": head}
        view = {
            "state": "OPEN",
            "mergeable": "MERGEABLE",
            "headRefName": branch,
            "headRefOid": head,
            "baseRefName": "main",
            "statusCheckRollup": [{"name": "Validate archive", "conclusion": "SUCCESS"}],
            "files": [{"path": identity_path}],
        }
        checked = mock.Mock(returncode=0)
        with mock.patch.object(MODULE, "find_open_pr", return_value=existing), \
             mock.patch.object(MODULE, "gh_json", return_value=view), \
             mock.patch.object(MODULE.subprocess, "run", return_value=checked), \
             mock.patch.object(
                 MODULE, "run",
                 side_effect=["", json.dumps(MODULE.identity_payload(job))],
             ):
            self.assertEqual(MODULE.validate_check_timeout_recovery_pr(job), 436)

    def test_check_timeout_recovery_rejects_non_matching_blocker(self):
        job = self.fixture()
        job.update({
            "status": "BLOCKED",
            "blocker_code": "SOME_OTHER_FINALIZER_ERROR",
            "blocker_stage": "PROGRAM_FINALIZER",
            "review_staging_id": "site-event-network-decay-da22faf4814c",
        })
        with self.assertRaisesRegex(ValueError, "FINALIZER_RECOVERY_NOT_ELIGIBLE"):
            MODULE.validate_check_timeout_recovery_pr(job)

    def test_recover_check_timeout_job_uses_binding_guard_rpc(self):
        job = self.fixture()
        job.update({
            "status": "BLOCKED",
            "blocker_code": MODULE.RECOVERABLE_CHECK_TIMEOUT,
            "blocker_stage": "PROGRAM_FINALIZER",
            "review_staging_id": "site-event-network-decay-da22faf4814c",
        })
        recovered = dict(job, status="FINALIZE_QUEUED", blocker_code=None, blocker_stage=None)
        with mock.patch.object(MODULE, "validate_check_timeout_recovery_pr", return_value=436), \
             mock.patch.object(MODULE, "rpc", side_effect=[{"status": "FINALIZE_QUEUED"}, recovered]) as rpc:
            self.assertEqual(MODULE.recover_check_timeout_job(job)["status"], "FINALIZE_QUEUED")
        self.assertEqual(rpc.call_args_list[0], mock.call(
            "archive_illustration_finalizer_recover_check_timeout",
            {
                "p_job_id": job["job_id"],
                "p_expected_output_sha256": job["output_sha256"],
                "p_expected_provider_asset_id": job["provider_asset_id"],
                "p_expected_review_staging_id": job["review_staging_id"],
            },
        ))

    def test_wait_pr_and_merge_waits_for_checks_to_appear(self):
        head = "a" * 40
        merged = "d" * 40
        views = [
            {
                "state": "OPEN", "mergeable": "UNKNOWN", "headRefOid": head,
                "mergeCommit": None, "statusCheckRollup": [],
            },
            {
                "state": "OPEN", "mergeable": "UNKNOWN", "headRefOid": head,
                "mergeCommit": None, "statusCheckRollup": [{"name": "Validate archive"}],
            },
            {
                "state": "OPEN", "mergeable": "MERGEABLE", "headRefOid": head,
                "mergeCommit": None,
            },
            {"merged": True, "sha": merged},
        ]
        with mock.patch.object(MODULE, "heartbeat"), \
             mock.patch.object(MODULE.time, "sleep"), \
             mock.patch.object(MODULE, "gh_json", side_effect=views) as gh_json, \
             mock.patch.object(MODULE, "run_with_heartbeat", return_value=(0, "")) as watch:
            self.assertEqual(MODULE.wait_pr_and_merge(418), merged)

        self.assertEqual(gh_json.call_count, 4)
        watch.assert_called_once_with(
            ["gh", "pr", "checks", "418", "--repo", MODULE.REPO, "--watch",
             "--fail-fast", "--interval", "10"],
            capture=False,
        )

    def test_wait_pr_and_merge_times_out_when_checks_never_attach(self):
        no_checks = {
            "state": "OPEN", "mergeable": "UNKNOWN", "headRefOid": "a" * 40,
            "mergeCommit": None, "statusCheckRollup": [],
        }
        with mock.patch.object(MODULE, "heartbeat"), \
             mock.patch.object(MODULE.time, "sleep"), \
             mock.patch.object(MODULE, "PR_CHECK_PROPAGATION_ATTEMPTS", 3), \
             mock.patch.object(MODULE, "gh_json", return_value=no_checks), \
             mock.patch.object(MODULE, "run_with_heartbeat") as watch:
            with self.assertRaisesRegex(
                ValueError, "FINALIZER_PR_CHECKS_NOT_REPORTED_TIMEOUT"
            ):
                MODULE.wait_pr_and_merge(418)
        watch.assert_not_called()

    def test_heartbeat_loss_kills_wait_and_prevents_later_side_effects(self):
        class Process:
            def __init__(self):
                self.returncode = None
                self.killed = False
            def poll(self): return self.returncode
            def kill(self): self.killed = True; self.returncode = -9
            def wait(self): return self.returncode

        process = Process()
        MODULE.CURRENT_JOB = {"job_id": "illustration-test-0001"}
        MODULE.LEASE_TOKEN = "00000000-0000-0000-0000-000000000001"
        MODULE.LEASE_LOST = False
        heartbeat = mock.Mock(side_effect=[None, ValueError("lease expired")])
        with mock.patch.object(MODULE, "heartbeat", heartbeat), \
             mock.patch.object(MODULE.subprocess, "Popen", return_value=process), \
             mock.patch.object(MODULE, "HEARTBEAT_INTERVAL_SECONDS", 0), \
             mock.patch.object(MODULE, "run") as later_side_effect:
            with self.assertRaisesRegex(ValueError, "FINALIZER_LEASE_LOST"):
                MODULE.run_with_heartbeat(["gh", "run", "watch", "123"], capture=False)
            later_side_effect.assert_not_called()
        self.assertTrue(process.killed)


if __name__ == "__main__":
    unittest.main()
