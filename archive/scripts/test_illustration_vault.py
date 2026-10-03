import unittest
from unittest.mock import patch

import illustration_vault as vault


class FakeProvider:
    def assert_private_bucket(self):
        return {"bucket": vault.BUCKET, "public": False}

    def upload_original(self, path, raw, expected_sha256):
        return {"status": "UPLOADED_REQUIRES_TRUSTED_READBACK", "storage_uploads": 1}

    def readback(self, path):
        return b"png-bytes"


class IllustrationVaultTests(unittest.TestCase):
    def test_archive_noops_when_already_stored(self):
        with patch.object(vault, "rpc", return_value={
            "job_id": "job-12345678",
            "vault_status": "STORED",
            "object_path": "AFTERFALL/x.png",
        }), patch.object(vault, "provider") as provider:
            result = vault.archive("job-12345678")
        self.assertEqual(result["status"], "NOOP_ALREADY_STORED")
        provider.assert_not_called()

    def test_rejected_render_is_stored_then_transport_staging_is_cleaned(self):
        raw = b"png-bytes"
        source_sha = __import__("hashlib").sha256(raw).hexdigest()
        job = {
            "job_id": "job-12345678",
            "vault_status": "DISPATCHED",
            "object_path": "AFTERFALL/2026-10-03/job-12345678/x.png",
            "source_sha256": source_sha,
            "review_decision": "REJECT",
        }
        calls = []

        def fake_rpc(name, payload, max_bytes=8_000_000):
            calls.append((name, payload))
            if name == "archive_illustration_vault_job":
                return job
            if name == "archive_illustration_vault_mark_stored":
                return {"status": "STORED", "expires_at": "2026-11-02T00:00:00Z"}
            if name == "archive_illustration_vault_cleanup_review_staging":
                return {"deleted": 1}
            raise AssertionError(name)

        fake_provider = FakeProvider()
        with patch.object(vault, "rpc", side_effect=fake_rpc),              patch.object(vault, "read_staged_bytes", return_value=raw),              patch.object(vault, "provider", return_value=fake_provider):
            result = vault.archive("job-12345678")

        self.assertEqual(result["status"], "ILLUSTRATION_VAULT_STORED")
        self.assertEqual(result["review_decision"], "REJECT")
        self.assertTrue(any(name == "archive_illustration_vault_mark_stored" for name, _ in calls))
        self.assertTrue(any(name == "archive_illustration_vault_cleanup_review_staging" for name, _ in calls))

    def test_pass_keeps_review_staging_for_existing_finalizer(self):
        raw = b"png-bytes"
        source_sha = __import__("hashlib").sha256(raw).hexdigest()
        job = {
            "job_id": "job-12345678",
            "vault_status": "DISPATCHED",
            "object_path": "AFTERFALL/2026-10-03/job-12345678/x.png",
            "source_sha256": source_sha,
            "review_decision": "PASS",
        }
        calls = []

        def fake_rpc(name, payload, max_bytes=8_000_000):
            calls.append(name)
            if name == "archive_illustration_vault_job":
                return job
            if name == "archive_illustration_vault_mark_stored":
                return {"status": "STORED", "expires_at": "2026-11-02T00:00:00Z"}
            if name == "archive_illustration_vault_cleanup_review_staging":
                return {"deleted": 0}
            raise AssertionError(name)

        with patch.object(vault, "rpc", side_effect=fake_rpc),              patch.object(vault, "read_staged_bytes", return_value=raw),              patch.object(vault, "provider", return_value=FakeProvider()):
            vault.archive("job-12345678")

        self.assertIn("archive_illustration_vault_cleanup_review_staging", calls)

    def test_cleanup_deletes_storage_before_marking_metadata_deleted(self):
        calls = []
        expired = [{
            "job_id": "job-12345678",
            "object_path": "AFTERFALL/old.png",
            "source_sha256": "a" * 64,
        }]

        def fake_rpc(name, payload, max_bytes=8_000_000):
            calls.append(name)
            if name == "archive_illustration_vault_expired":
                return expired
            if name == "archive_illustration_vault_mark_deleted":
                return {"deleted": 1}
            raise AssertionError(name)

        with patch.object(vault, "rpc", side_effect=fake_rpc),              patch.object(vault, "delete_storage_object") as delete:
            result = vault.cleanup(50)

        delete.assert_called_once_with("AFTERFALL/old.png")
        self.assertEqual(result["deleted"], ["job-12345678"])
        self.assertEqual(calls, [
            "archive_illustration_vault_expired",
            "archive_illustration_vault_mark_deleted",
        ])


if __name__ == "__main__":
    unittest.main()
