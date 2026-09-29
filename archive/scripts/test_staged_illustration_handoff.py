"""Offline tests for Supabase private staged illustration handoff."""
import base64
import hashlib
import io
import sys
import unittest
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "archive/scripts"))
import staged_illustration_handoff as staged


def png_bytes(width=9, height=6):
    output = io.BytesIO()
    Image.new("RGB", (width, height), (25, 45, 65)).save(output, format="PNG")
    return output.getvalue()


class StagedIllustrationHandoffTests(unittest.TestCase):
    def setUp(self):
        self.original = png_bytes()
        self.sha = hashlib.sha256(self.original).hexdigest()
        self.staging_id = "test-stage-12345678"
        self.source_commit = "a" * 40
        self.identity_path = (
            "archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_TEST.json"
        )
        self.record = {
            "point_id": "point-" + "b" * 64,
            "generation_key": "generation-" + "c" * 64,
            "subject_id": "char-test",
            "source_sha256": self.sha,
            "original_bytes": len(self.original),
            "original_width": 9,
            "original_height": 6,
        }
        encoded = base64.b64encode(self.original).decode("ascii")
        midpoint = len(encoded) // 2
        self.chunks = [
            {"chunk_index": 0, "chunk_b64": encoded[:midpoint]},
            {"chunk_index": 1, "chunk_b64": encoded[midpoint:]},
        ]
        self.meta = {
            "staging_id": self.staging_id,
            "status": "READY",
            "point_id": self.record["point_id"],
            "generation_key": self.record["generation_key"],
            "subject_id": self.record["subject_id"],
            "source_commit": self.source_commit,
            "identity_path": self.identity_path,
            "source_sha256": self.sha,
            "byte_count": len(self.original),
            "width": 9,
            "height": 6,
            "mime_type": "image/png",
            "chunk_count": 2,
        }

    def decode(self):
        return staged.decode_staged_original(
            self.meta,
            self.chunks,
            self.record,
            self.staging_id,
            self.source_commit,
            self.identity_path,
        )

    def test_valid_chunks_reconstruct_exact_png(self):
        original, metadata = self.decode()
        self.assertEqual(original, self.original)
        self.assertEqual(metadata["sha256"], self.sha)
        self.assertEqual((metadata["width"], metadata["height"]), (9, 6))
        self.assertEqual(metadata["private_visibility"], "SUPABASE_PRIVATE_STAGING")

    def test_noncontiguous_chunks_are_rejected(self):
        self.chunks[1]["chunk_index"] = 3
        with self.assertRaisesRegex(ValueError, "ILLUSTRATION_STAGING_CHUNK_SET_INVALID"):
            self.decode()

    def test_identity_mismatch_is_rejected(self):
        self.meta["source_commit"] = "d" * 40
        with self.assertRaisesRegex(ValueError, "ILLUSTRATION_STAGING_IDENTITY_MISMATCH"):
            self.decode()

    def test_sha_mismatch_is_rejected(self):
        self.record["source_sha256"] = "e" * 64
        self.meta["source_sha256"] = "e" * 64
        with self.assertRaisesRegex(ValueError, "ORIGINAL_SHA256_MISMATCH"):
            self.decode()

    def test_invalid_png_is_rejected_even_with_matching_hash(self):
        bad = b"not-a-png"
        encoded = base64.b64encode(bad).decode("ascii")
        sha = hashlib.sha256(bad).hexdigest()
        self.record.update(
            source_sha256=sha,
            original_bytes=len(bad),
            original_width=9,
            original_height=6,
        )
        self.meta.update(
            source_sha256=sha,
            byte_count=len(bad),
            chunk_count=1,
        )
        self.chunks = [{"chunk_index": 0, "chunk_b64": encoded}]
        with self.assertRaisesRegex(ValueError, "ORIGINAL_NOT_PNG"):
            self.decode()


if __name__ == "__main__":
    unittest.main()
