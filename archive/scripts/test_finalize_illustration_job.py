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
            "review_summary": "matches visual brief",
        }

    def test_identity_path_is_stable_and_subject_scoped(self):
        self.assertEqual(
            MODULE.identity_path_for_subject("loc-west-road"),
            "archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_WEST_ROAD.json",
        )
        self.assertEqual(
            MODULE.identity_path_for_subject("char-taehoon"),
            "archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_TAEHOON.json",
        )

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
