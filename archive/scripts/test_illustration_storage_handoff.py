"""Offline contract checks; no Storage or database calls are made."""
import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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

    def test_cli_does_not_expose_encrypted_signed_upload_modes(self):
        with patch("sys.argv", ["illustration_storage_handoff.py", "--issue"]):
            with self.assertRaises(SystemExit):
                handoff.main()
        with patch("sys.argv", ["illustration_storage_handoff.py", "--upload"]):
            with self.assertRaises(SystemExit):
                handoff.main()

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

    def test_identity_path_is_explicit_and_diagnostic_can_read_published_asset(self):
        record = json.loads(handoff.IDENTITY.read_text(encoding="utf-8"))
        with self.assertRaisesRegex(ValueError, "SITE_ASSET_ALREADY_EXISTS"):
            handoff.identity(handoff.IDENTITY)
        resolved, _, _, _ = handoff.identity(handoff.IDENTITY, allow_published=True)
        self.assertEqual(resolved["point_id"], record["point_id"])

    def test_identity_argument_accepts_a_different_ready_visual_subject(self):
        catalog = json.loads(handoff.CATALOG.read_text(encoding="utf-8"))
        point = next(item for item in catalog["points"] if item.get("subject_id") == "loc-baekun")
        record = json.loads(handoff.IDENTITY.read_text(encoding="utf-8"))
        record.update({"subject_id": point["subject_id"], "point_id": point["point_id"],
                       "generation_key": point["generation_key"], "source_sha256": "a" * 64,
                       "tool_result_id": "native-generation-test"})
        with tempfile.TemporaryDirectory() as directory:
            identity_path = Path(directory) / "baekun.json"
            identity_path.write_text(json.dumps(record), encoding="utf-8")
            resolved, _, resolved_point, object_path = handoff.identity(identity_path)
        self.assertEqual(resolved_point["subject_id"], "loc-baekun")
        self.assertEqual(resolved["point_id"], point["point_id"])
        self.assertTrue(object_path.endswith("/" + "a" * 64 + ".png"))

    def test_registry_http_error_preserves_status_and_response(self):
        error = handoff.HTTPError("https://example.invalid", 406, "Not Acceptable", {},
                                  io.BytesIO(b'{"code":"PGRST106"}'))
        diagnostic = handoff.registry_read_error(error)
        self.assertEqual(str(diagnostic), 'REGISTRY_READ_FAILED_HTTP_406:{"code":"PGRST106"}')

    def test_trusted_registry_read_uses_public_rpc_with_explicit_identity(self):
        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self, _limit):
                return b'[]'

        class CapturingOpener:
            def open(self, request, timeout):
                self.request = request
                self.timeout = timeout
                return Response()

        opener = CapturingOpener()
        original_opener = handoff.OPENER
        handoff.OPENER = opener
        try:
            record = {"point_id": "point-test", "generation_key": "generation-test"}
            rows = handoff.read_registry_rows("https://example.supabase.co", {"apikey": "test"}, record)
        finally:
            handoff.OPENER = original_opener
        self.assertEqual(rows, [])
        self.assertEqual(opener.request.full_url,
                         "https://example.supabase.co/rest/v1/rpc/archive_visual_asset_readback")
        self.assertEqual(opener.request.get_method(), "POST")
        self.assertEqual(opener.request.get_header("Content-profile"), "public")
        self.assertIsNone(opener.request.get_header("Accept-profile"))
        self.assertEqual(json.loads(opener.request.data),
                         {"p_point_id": record["point_id"],
                          "p_generation_key": record["generation_key"]})

    def test_registry_diagnostic_validates_legacy_warehouse_binding(self):
        record = json.loads(handoff.IDENTITY.read_text(encoding="utf-8"))
        _, _, _, path = handoff.identity(allow_published=True)
        registry_row = {
            "source": {"point_id": record["point_id"],
                       "generation_key": record["generation_key"],
                       "source_sha256": record["source_sha256"]},
            "object_path": f"survival-archive-originals/{path}",
            "generation_meta": {},
        }
        with patch.object(handoff, "registry_credentials", return_value=("https://example.invalid", {})), \
             patch.object(handoff, "read_registry_rows", return_value=[registry_row]):
            result = handoff.diagnose_registry()
        self.assertEqual(result["status"], "REGISTRY_READBACK_DIAGNOSTIC_PASS")
        self.assertIsNone(result["storage_provider"])
        self.assertEqual(result["storage_provider_inferred"], "supabase")
        self.assertEqual(result["duplicate_count"], 0)


if __name__ == "__main__":
    unittest.main()
