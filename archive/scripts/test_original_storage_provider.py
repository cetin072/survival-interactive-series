"""Offline tests for the private original-storage provider boundary."""
import importlib.util
import os
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "archive/scripts/original_storage_provider.py"
spec = importlib.util.spec_from_file_location("original_storage_provider", MODULE_PATH)
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)


class DummyOpener:
    pass


class OriginalStorageProviderTests(unittest.TestCase):
    def test_default_provider_is_current_supabase_store(self):
        selection = storage.load_original_storage_selection({})
        self.assertEqual(selection.provider, "supabase")
        self.assertEqual(selection.bucket, "survival-archive-originals")
        self.assertEqual(
            selection.endpoint,
            "https://jgsxpdflgkqroecfjzxq.supabase.co",
        )

    def test_supabase_bucket_can_be_reconfigured_without_changing_callers(self):
        selection = storage.load_original_storage_selection({
            "ARCHIVE_ORIGINAL_STORAGE_PROVIDER": "supabase",
            "ARCHIVE_SUPABASE_URL": "https://example.supabase.co",
            "ARCHIVE_ORIGINAL_STORAGE_BUCKET": "future-originals",
        })
        self.assertEqual(selection.provider, "supabase")
        self.assertEqual(selection.bucket, "future-originals")
        self.assertEqual(selection.endpoint, "https://example.supabase.co")

    def test_unknown_provider_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "STORAGE_PROVIDER_UNSUPPORTED"):
            storage.load_original_storage_selection({
                "ARCHIVE_ORIGINAL_STORAGE_PROVIDER": "mystery",
            })

    def test_r2_selection_requires_explicit_configuration(self):
        with self.assertRaisesRegex(ValueError, "R2_STORAGE_NOT_CONFIGURED"):
            storage.load_original_storage_selection({
                "ARCHIVE_ORIGINAL_STORAGE_PROVIDER": "r2",
            })

    def test_r2_configuration_does_not_silently_fall_back_to_supabase(self):
        with self.assertRaisesRegex(ValueError, "R2_STORAGE_ADAPTER_NOT_IMPLEMENTED"):
            storage.build_original_storage_provider(
                DummyOpener(),
                20 * 1024 * 1024,
                env={
                    "ARCHIVE_ORIGINAL_STORAGE_PROVIDER": "r2",
                    "ARCHIVE_R2_ENDPOINT": "https://example.r2.cloudflarestorage.com",
                    "ARCHIVE_R2_BUCKET": "survival-originals",
                },
            )

    def test_supabase_registry_path_contract_is_preserved(self):
        provider = storage.build_original_storage_provider(
            DummyOpener(),
            20 * 1024 * 1024,
            env={
                "ARCHIVE_ORIGINAL_STORAGE_PROVIDER": "supabase",
                "ARCHIVE_SUPABASE_URL": "https://example.supabase.co",
                "ARCHIVE_ORIGINAL_STORAGE_BUCKET": "survival-archive-originals",
            },
        )
        path = "AFTERFALL/point-a/generation-b/source.png"
        self.assertEqual(
            provider.registry_object_path(path),
            f"survival-archive-originals/{path}",
        )
        self.assertIn(
            "/storage/v1/object/upload/sign/survival-archive-originals/",
            provider.upload_url(path, "x" * 20),
        )


if __name__ == "__main__":
    unittest.main()
