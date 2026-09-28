"""Offline contract checks; no Storage or database calls are made."""
import contextlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "archive/scripts"))
spec = importlib.util.spec_from_file_location("handoff", ROOT / "archive/scripts/illustration_storage_handoff.py")
handoff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handoff)


@contextlib.contextmanager
def pre_delivery_site_assets():
    original_path = handoff.SITE_ASSETS
    manifest = json.loads(original_path.read_text(encoding="utf-8"))
    target = json.loads(handoff.IDENTITY.read_text(encoding="utf-8"))
    manifest["assets"] = [asset for asset in manifest["assets"]
                          if asset.get("point_id") != target["point_id"]
                          and asset.get("generation_key") != target["generation_key"]
                          and asset.get("subject_id") != target["subject_id"]]
    with tempfile.TemporaryDirectory() as directory:
        handoff.SITE_ASSETS = Path(directory) / "SITE_ASSETS.json"
        handoff.SITE_ASSETS.write_text(json.dumps(manifest), encoding="utf-8")
        try:
            yield
        finally:
            handoff.SITE_ASSETS = original_path


class IllustrationStorageHandoffTests(unittest.TestCase):
    def test_identity_is_latest_ready_warehouse_and_path_binds_all_hashes(self):
        with pre_delivery_site_assets():
            record, catalog, point, path = handoff.identity()
            self.assertEqual(record["subject_id"], "loc-guild-rear-warehouse")
            self.assertEqual(point["priority"], 20)
            self.assertEqual(point["status"], "READY")
            self.assertEqual(path, f"AFTERFALL/{record['point_id']}/{record['generation_key']}/{record['source_sha256']}.png")

    def test_token_envelope_is_bound_to_one_bucket_path_and_sha(self):
        with pre_delivery_site_assets():
            record, _, _, path = handoff.identity()
            envelope = handoff.encrypt_token("test-upload-token-123456789", path, record["source_sha256"])
            self.assertEqual(envelope["version"], 2)
            self.assertEqual(envelope["provider"], "supabase")
            self.assertEqual(envelope["bucket"], "survival-archive-originals")
            private_path = Path(__file__).resolve().parents[2] / ".github/warehouse-e2e-upload-public.pem"
            # The private key is never in the repository. The test instead verifies that mismatched
            # identity metadata is rejected before attempting decryption.
            envelope["path"] = path + "/other"
            with self.assertRaisesRegex(ValueError, "SIGNED_TOKEN_ENVELOPE_INVALID"):
                handoff.decrypt_token(envelope, private_path, path, record["source_sha256"])

    def test_registry_row_is_ready_location_and_private_original_bound(self):
        with pre_delivery_site_assets():
            record, catalog, point, path = handoff.identity()
            row = handoff.registry_row(record, catalog, point, path)
            self.assertEqual(row["asset_type"], "LOCATION")
            self.assertEqual(row["status"], "READY")
            self.assertEqual(row["visibility"], "PLAYER_ARCHIVE")
            self.assertEqual(row["source"]["generation_key"], point["generation_key"])
            self.assertEqual(row["generation_meta"]["source_sha256"], record["source_sha256"])
            self.assertEqual(row["generation_meta"]["storage_provider"], "supabase")
            self.assertEqual(row["object_path"], f"survival-archive-originals/{path}")
            self.assertIsNone(row["image_url"])
            self.assertFalse(row["generation_meta"]["unattended_generation_proven"])

    def test_published_target_is_rejected_from_new_handoff(self):
        with self.assertRaisesRegex(ValueError, "SITE_ASSET_ALREADY_EXISTS"):
            handoff.identity()


if __name__ == "__main__":
    unittest.main()
