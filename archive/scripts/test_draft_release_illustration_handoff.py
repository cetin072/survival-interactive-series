"""Offline tests for temporary private Draft Release image handoff."""
import hashlib
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "archive/scripts"))
import draft_release_illustration_handoff as handoff


def png_bytes(width=7, height=5):
    output = io.BytesIO()
    Image.new("RGB", (width, height), (20, 40, 60)).save(output, format="PNG")
    return output.getvalue()


class DraftReleaseHandoffTests(unittest.TestCase):
    def setUp(self):
        image = png_bytes()
        self.record = {"subject_id": "loc-test", "source_sha256": hashlib.sha256(image).hexdigest(),
                       "original_bytes": len(image), "original_width": 7, "original_height": 5}
        self.source_commit = "a" * 40

    def test_target_point_stability_ignores_unrelated_catalog_changes(self):
        source_catalog = {
            "content_sha256": "old",
            "points": [
                {"point_id": "point-" + "b" * 64, "subject_id": "char-test", "brief": {"v": 1}},
                {"point_id": "point-" + "c" * 64, "subject_id": "char-other", "brief": {"v": 1}},
            ],
        }
        current_catalog = {
            "content_sha256": "new",
            "points": [
                {"point_id": "point-" + "b" * 64, "subject_id": "char-test", "brief": {"v": 1}},
                {"point_id": "point-" + "c" * 64, "subject_id": "char-other", "brief": {"v": 2}},
            ],
        }
        point_id = "point-" + "b" * 64
        source_point = next(item for item in source_catalog["points"] if item["point_id"] == point_id)
        current_point = next(item for item in current_catalog["points"] if item["point_id"] == point_id)
        self.assertEqual(source_point, current_point)
        self.assertNotEqual(source_catalog["content_sha256"], current_catalog["content_sha256"])

    def test_target_point_change_is_detectable(self):
        point_id = "point-" + "b" * 64
        source_point = {"point_id": point_id, "brief": {"v": 1}}
        current_point = {"point_id": point_id, "brief": {"v": 2}}
        self.assertNotEqual(source_point, current_point)

    def test_release_tag_and_asset_name_bind_identity_and_source_commit(self):
        self.assertEqual(
            handoff.expected_release_tag(self.record, self.source_commit),
            f"codex-private-image-{self.record['subject_id']}-{'a' * 12}-{self.record['source_sha256'][:12]}",
        )
        self.assertEqual(
            handoff.expected_asset_name(self.record),
            f"afterfall-original-{self.record['subject_id']}-{self.record['source_sha256']}.png",
        )

    def test_release_tag_rejects_unsafe_subject_and_incomplete_commit(self):
        self.record["subject_id"] = "loc-test\ncleanup_ready=false"
        with self.assertRaisesRegex(ValueError, "IDENTITY_SUBJECT_ID_INVALID"):
            handoff.expected_release_tag(self.record, self.source_commit)
        self.record["subject_id"] = "loc-test"
        with self.assertRaisesRegex(ValueError, "SOURCE_COMMIT_INVALID"):
            handoff.expected_release_tag(self.record, "not-a-commit")

    def test_unpublished_draft_release_accepts_missing_git_tag(self):
        release = {"id": 42, "draft": True, "prerelease": False,
                   "tag_name": handoff.expected_release_tag(self.record, self.source_commit)}

        class FakeApi:
            def release(self, _release_id):
                return release

            def tag_commit_if_exists(self, _tag):
                return None

        actual, tag = handoff.validate_release(FakeApi(), 42, self.record, self.source_commit)
        self.assertIs(actual, release)
        self.assertEqual(tag, release["tag_name"])

    def test_release_rejects_a_tag_pointing_to_another_commit(self):
        release = {"id": 42, "draft": True, "prerelease": False,
                   "tag_name": handoff.expected_release_tag(self.record, self.source_commit)}

        class FakeApi:
            def release(self, _release_id):
                return release

            def tag_commit_if_exists(self, _tag):
                return "b" * 40

        with self.assertRaisesRegex(ValueError, "DRAFT_RELEASE_SOURCE_COMMIT_MISMATCH"):
            handoff.validate_release(FakeApi(), 42, self.record, self.source_commit)
        release["draft"] = False
        with self.assertRaisesRegex(ValueError, "DRAFT_RELEASE_REQUIRED"):
            handoff.validate_release(FakeApi(), 42, self.record, self.source_commit)

    def test_asset_must_be_the_single_exact_private_png_with_expected_bytes(self):
        original = png_bytes()
        self.record["source_sha256"] = hashlib.sha256(original).hexdigest()
        self.record["original_bytes"] = len(original)
        asset = {"id": 7, "name": handoff.expected_asset_name(self.record),
                 "state": "uploaded", "content_type": "image/png", "size": len(original),
                 "browser_download_url": "https://github.com/cetin072/survival-interactive-series/releases/download/x/file.png"}

        class FakeApi:
            def assert_asset_private(self, _url):
                return {"status": "ANONYMOUS_DOWNLOAD_DENIED", "http_status": 404}

            def asset_bytes(self, _asset_id):
                return original

        contents, metadata = handoff.validate_asset(FakeApi(), {"assets": [asset]}, self.record)
        self.assertEqual(contents, original)
        self.assertEqual(metadata["sha256"], self.record["source_sha256"])
        self.assertEqual((metadata["width"], metadata["height"]), (7, 5))
        self.assertEqual(metadata["private_visibility"], "ANONYMOUS_DOWNLOAD_DENIED")

    def test_asset_count_must_be_exactly_one(self):
        with self.assertRaisesRegex(ValueError, "DRAFT_RELEASE_ASSET_COUNT_INVALID"):
            handoff.validate_asset(object(), {"assets": []}, self.record)

    def test_anonymous_asset_download_success_is_rejected(self):
        class PublicAssetApi:
            def assert_asset_private(self, _url):
                raise ValueError("DRAFT_RELEASE_ASSET_PUBLIC")

        original = png_bytes()
        self.record.update(source_sha256=hashlib.sha256(original).hexdigest(),
                           original_bytes=len(original))
        asset = {"id": 7, "name": handoff.expected_asset_name(self.record),
                 "state": "uploaded", "content_type": "image/png", "size": len(original),
                 "browser_download_url": "https://github.com/cetin072/survival-interactive-series/releases/download/x/file.png"}
        with self.assertRaisesRegex(ValueError, "DRAFT_RELEASE_ASSET_PUBLIC"):
            handoff.validate_asset(PublicAssetApi(), {"assets": [asset]}, self.record)


if __name__ == "__main__":
    unittest.main()
