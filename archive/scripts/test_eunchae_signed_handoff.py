"""Offline security checks for the scoped signed-upload handoff."""
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

import eunchae_signed_handoff as handoff


class Response:
    def __init__(self, status, data=b""):
        self.status = status
        self.data = data

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, *_):
        return self.data


class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.private_path = self.root / "private.pem"
        self.public_path = self.root / "public.pem"
        self.private_path.write_bytes(private.private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption()))
        self.public_path.write_bytes(private.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
        self.public_patch = patch.object(handoff, "PUBLIC_KEY", self.public_path)
        self.public_patch.start()
        self.addCleanup(self.public_patch.stop)

    def test_issue_encrypts_token_and_has_no_plaintext_field(self):
        token = "synthetic-signed-token-12345678901234567890"
        expected_url = f"/object/upload/sign/{handoff.BUCKET}/{handoff.OBJECT_PATH}?token={token}"
        for missing_status in (400, 404):
            with self.subTest(missing_status=missing_status):
                class Opener:
                    def open(self, request, timeout):
                        if request.get_method() == "GET":
                            raise HTTPError(request.full_url, missing_status, "not found", {}, None)
                        assert request.get_method() == "POST"
                        return Response(200, json.dumps({"url": expected_url}).encode())

                with patch.object(handoff, "OPENER", Opener()), patch.dict(os.environ, {
                        "ARCHIVE_SUPABASE_URL": handoff.BASE_URL,
                        "ARCHIVE_SUPABASE_SERVICE_ROLE_KEY": "synthetic-service-role-value-12345"}):
                    result = handoff.issue()
                self.assertEqual(result["status"], "SIGNED_UPLOAD_READY")
                self.assertNotIn(token, json.dumps(result))
                self.assertEqual(handoff.decrypt_token(result["envelope"], self.private_path), token)

    def test_local_upload_sends_only_scoped_token_and_image(self):
        source = b"\x89PNG\r\n\x1a\n" + b"synthetic-test-image"
        image_path = self.root / "original.png"
        image_path.write_bytes(source)
        envelope_path = self.root / "envelope.json"
        envelope_path.write_text(json.dumps(handoff.encrypt_token("synthetic-signed-token-1234567890")))

        class Opener:
            def open(self, request, timeout):
                assert request.get_method() == "PUT"
                assert request.data == source
                assert "token=" in request.full_url
                assert request.get_header("Authorization") is None
                assert request.get_header("Apikey") is None
                return Response(200)

        with patch.object(handoff, "SOURCE_SHA", hashlib.sha256(source).hexdigest()), \
                patch.object(handoff, "OPENER", Opener()):
            result = handoff.upload(image_path, envelope_path, self.private_path)
        self.assertEqual(result["status"], "UPLOAD_SUBMITTED_REQUIRES_READBACK")

    def test_existing_wrong_object_rejects_before_signing(self):
        class Opener:
            def open(self, request, timeout):
                if request.get_method() != "GET":
                    raise AssertionError("signing should not occur")
                return Response(200, b"wrong-object")

        with patch.object(handoff, "OPENER", Opener()), patch.dict(os.environ, {
                "ARCHIVE_SUPABASE_URL": handoff.BASE_URL,
                "ARCHIVE_SUPABASE_SERVICE_ROLE_KEY": "synthetic-service-role-value-12345"}):
            with self.assertRaisesRegex(ValueError, "STORAGE_ORIGINAL_SHA_MISMATCH"):
                handoff.issue()


if __name__ == "__main__":
    unittest.main()
