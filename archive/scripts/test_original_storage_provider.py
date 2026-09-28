"""Offline tests for the private original-storage provider boundary."""
import sys
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "archive/scripts"))
import original_storage_provider as storage


class DummyOpener:
    def __init__(self):
        self.requests = []

    def open(self, request, timeout):
        self.requests.append((request, timeout))
        if "/storage/v1/object/authenticated/" in request.full_url:
            raise storage.HTTPError(request.full_url, 404, "Missing", {}, None)
        return DummyResponse(201, b"{}")


class DummyResponse:
    def __init__(self, status, body):
        self.status = status
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, _limit):
        return self.body


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
        opener = DummyOpener()
        provider = storage.build_original_storage_provider(
            opener,
            20 * 1024 * 1024,
            env={
                "ARCHIVE_ORIGINAL_STORAGE_PROVIDER": "supabase",
                "ARCHIVE_SUPABASE_URL": "https://example.supabase.co",
                "ARCHIVE_ORIGINAL_STORAGE_BUCKET": "survival-archive-originals",
                "ARCHIVE_SUPABASE_SERVICE_ROLE_KEY": "synthetic-service-role-value-12345",
            },
        )
        path = "AFTERFALL/point-a/generation-b/source.png"
        self.assertEqual(
            provider.registry_object_path(path),
            f"survival-archive-originals/{path}",
        )
        png = b"\x89PNG\r\n\x1a\ntrusted-test-image"
        import hashlib
        result = provider.upload_original(path, png, hashlib.sha256(png).hexdigest())
        self.assertEqual(result["status"], "UPLOADED_REQUIRES_TRUSTED_READBACK")
        upload_request = opener.requests[-1][0]
        self.assertEqual(upload_request.get_method(), "POST")
        self.assertIn("/storage/v1/object/survival-archive-originals/", upload_request.full_url)
        self.assertEqual(upload_request.get_header("X-upsert"), "false")
        self.assertEqual(upload_request.get_header("Content-type"), "image/png")
        self.assertEqual(upload_request.data, png)
        self.assertNotIn("/upload/sign/", upload_request.full_url)

    def test_supabase_requires_service_role_for_direct_upload(self):
        provider = storage.build_original_storage_provider(
            DummyOpener(), 20 * 1024 * 1024,
            env={"ARCHIVE_ORIGINAL_STORAGE_PROVIDER": "supabase",
                 "ARCHIVE_SUPABASE_URL": "https://example.supabase.co",
                 "ARCHIVE_ORIGINAL_STORAGE_BUCKET": "private-originals"},
        )
        with self.assertRaisesRegex(ValueError, "STORAGE_CREDENTIALS_REQUIRED"):
            provider._trusted_headers()

    def test_bucket_must_be_confirmed_private_before_handoff(self):
        class BucketOpener:
            def __init__(self, public):
                self.public = public

            def open(self, request, timeout):
                self.request = request
                self.timeout = timeout
                return DummyResponse(200, json.dumps({
                    "id": "private-originals", "public": self.public,
                }).encode())

        for public in (False, True):
            opener = BucketOpener(public)
            provider = storage.build_original_storage_provider(
                opener, 20 * 1024 * 1024,
                env={"ARCHIVE_ORIGINAL_STORAGE_PROVIDER": "supabase",
                     "ARCHIVE_SUPABASE_URL": "https://example.supabase.co",
                     "ARCHIVE_ORIGINAL_STORAGE_BUCKET": "private-originals",
                     "ARCHIVE_SUPABASE_SERVICE_ROLE_KEY": "synthetic-service-role-value-12345"},
            )
            if public:
                with self.assertRaisesRegex(ValueError, "STORAGE_BUCKET_NOT_PRIVATE"):
                    provider.assert_private_bucket()
            else:
                self.assertEqual(provider.assert_private_bucket(), {
                    "bucket": "private-originals", "public": False,
                })
            self.assertIn("/storage/v1/bucket/private-originals", opener.request.full_url)


if __name__ == "__main__":
    unittest.main()
