"""Offline contract checks; no Storage or database calls are made."""
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("handoff", ROOT / "archive/scripts/illustration_storage_handoff.py")
handoff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handoff)


class IllustrationStorageHandoffTests(unittest.TestCase):
    def test_identity_is_latest_ready_warehouse_and_path_binds_all_hashes(self):
        record, catalog, point, path = handoff.identity()
        self.assertEqual(record["subject_id"], "loc-guild-rear-warehouse")
        self.assertEqual(point["priority"], 20)
        self.assertEqual(point["status"], "READY")
        self.assertEqual(path, f"AFTERFALL/{record['point_id']}/{record['generation_key']}/{record['source_sha256']}.png")

    def test_token_envelope_is_bound_to_one_bucket_path_and_sha(self):
        record, _, _, path = handoff.identity()
        envelope = handoff.encrypt_token("test-upload-token-123456789", path, record["source_sha256"])
        private_path = Path(__file__).resolve().parents[2] / ".github/warehouse-e2e-upload-public.pem"
        # The private key is never in the repository. The test instead verifies that mismatched
        # identity metadata is rejected before attempting decryption.
        envelope["path"] = path + "/other"
        with self.assertRaisesRegex(ValueError, "SIGNED_TOKEN_ENVELOPE_INVALID"):
            handoff.decrypt_token(envelope, private_path, path, record["source_sha256"])

    def test_registry_row_is_ready_location_and_private_original_bound(self):
        record, catalog, point, path = handoff.identity()
        row = handoff.registry_row(record, catalog, point, path)
        self.assertEqual(row["asset_type"], "LOCATION")
        self.assertEqual(row["status"], "READY")
        self.assertEqual(row["visibility"], "PLAYER_ARCHIVE")
        self.assertEqual(row["source"]["generation_key"], point["generation_key"])
        self.assertEqual(row["generation_meta"]["source_sha256"], record["source_sha256"])
        self.assertEqual(row["object_path"], f"survival-archive-originals/{path}")
        self.assertIsNone(row["image_url"])
        self.assertFalse(row["generation_meta"]["unattended_generation_proven"])


if __name__ == "__main__":
    unittest.main()
