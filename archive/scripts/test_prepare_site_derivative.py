"""Offline tests for deterministic site derivative publication helpers."""
import hashlib
import io
import json
import sys
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "archive/scripts"))
import prepare_site_derivative as site


def png_bytes(width=20, height=10):
    output = io.BytesIO()
    Image.new("RGB", (width, height), (30, 50, 70)).save(output, format="PNG")
    return output.getvalue()


class SiteDerivativeTests(unittest.TestCase):
    def setUp(self):
        self.source = png_bytes()
        self.record = {
            "point_id": "point-" + "a" * 64,
            "generation_key": "generation-" + "b" * 64,
            "subject_id": "char-test",
            "source_sha256": hashlib.sha256(self.source).hexdigest(),
            "original_bytes": len(self.source),
            "original_width": 20,
            "original_height": 10,
        }
        self.registry = {"asset_id": "AF-CHAR-TEST"}
        self.object_path = (
            f"AFTERFALL/{self.record['point_id']}/"
            f"{self.record['generation_key']}/{self.record['source_sha256']}.png"
        )

    def test_original_validation_accepts_exact_png(self):
        site.validate_original(self.source, self.record)

    def test_original_validation_rejects_hash_mismatch(self):
        bad = dict(self.record, source_sha256="f" * 64)
        with self.assertRaisesRegex(ValueError, "SITE_DERIVATIVE_ORIGINAL_SHA_MISMATCH"):
            site.validate_original(self.source, bad)

    def test_manifest_append_is_deterministic_and_idempotent(self):
        derivative = site.derive(self.source)
        asset = site.build_site_asset(
            self.record, self.registry, self.object_path, derivative
        )
        existing = {
            "version": "archive-site-assets-v1",
            "chronicle_id": "C03-AFTERFALL",
            "worldline_id": "AFTERFALL",
            "visibility": "PUBLIC_ARCHIVE",
            "visual_catalog_sha256": "0" * 64,
            "assets": [],
            "content_sha256": "old",
        }
        first, existed = site.desired_manifest(existing, "1" * 64, asset)
        self.assertFalse(existed)
        self.assertEqual(first["assets"], [asset])
        body = {k: v for k, v in first.items() if k != "content_sha256"}
        self.assertEqual(first["content_sha256"], site.canonical_manifest_hash(body))
        second, existed = site.desired_manifest(first, "1" * 64, asset)
        self.assertTrue(existed)
        self.assertEqual(first, second)

    def test_manifest_rejects_same_subject_different_asset(self):
        derivative = site.derive(self.source)
        asset = site.build_site_asset(
            self.record, self.registry, self.object_path, derivative
        )
        conflicting = dict(asset, sha256="e" * 64)
        existing = {
            "version": "archive-site-assets-v1",
            "chronicle_id": "C03-AFTERFALL",
            "worldline_id": "AFTERFALL",
            "visibility": "PUBLIC_ARCHIVE",
            "visual_catalog_sha256": "0" * 64,
            "assets": [conflicting],
            "content_sha256": "old",
        }
        with self.assertRaisesRegex(ValueError, "SITE_ASSET_EXISTING_CONFLICT"):
            site.desired_manifest(existing, "1" * 64, asset)


if __name__ == "__main__":
    unittest.main()
