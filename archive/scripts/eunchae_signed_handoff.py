"""One-image private Storage handoff. The service key is runner-only.

Issue and verify run in a trusted GitHub Actions job. Upload runs locally with
only a short-lived, single-object signed token encrypted for this checkout.
This deliberately has no generic path or bucket input and never prints HTTP
response bodies, credentials, signed URLs, or decrypted tokens.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import load_pem_private_key, load_pem_public_key


BASE_URL = "https://jgsxpdflgkqroecfjzxq.supabase.co"
BUCKET = "survival-archive-originals"
POINT_ID = "point-5458129f6175ce205357c35dae480389c1c88ec3a8480b141aa775a7b31fa59b"
GENERATION_KEY = "generation-a1b923f9a5e050ab359aee428f3f504c284c18e229e5e20398ff09b6a91c6a30"
SOURCE_SHA = "47af97c1defa474275204dc73592f12ce59ee23591eec0d13d1f49b114d7875c"
OBJECT_PATH = f"AFTERFALL/{POINT_ID}/{GENERATION_KEY}/{SOURCE_SHA}.png"
ROOT = Path(__file__).resolve().parents[2]
PUBLIC_KEY = ROOT / ".github/eunchae-upload-public.pem"
AAD = f"{BUCKET}/{OBJECT_PATH}:{SOURCE_SHA}".encode()
LIMIT = 20 * 1024 * 1024


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        raise ValueError("STORAGE_REDIRECT_REJECTED")


OPENER = build_opener(NoRedirect)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def b64(data):
    return base64.b64encode(data).decode("ascii")


def unb64(value):
    return base64.b64decode(value, validate=True)


def safe_http_code(error):
    if error.code in (401, 403):
        return "STORAGE_AUTH_FAILED"
    if error.code == 404:
        return "STORAGE_OBJECT_NOT_FOUND"
    return f"STORAGE_HTTP_ERROR_{error.code}"


def credentials():
    url = os.environ.get("ARCHIVE_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("ARCHIVE_SUPABASE_SERVICE_ROLE_KEY", "")
    if url != BASE_URL or len(key) < 20:
        raise ValueError("STORAGE_CREDENTIALS_REQUIRED")
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def readback(headers, missing_ok=False):
    request = Request(f"{BASE_URL}/storage/v1/object/authenticated/{BUCKET}/{OBJECT_PATH}",
                      headers=headers)
    try:
        with OPENER.open(request, timeout=30) as response:
            if response.status != 200:
                raise ValueError("STORAGE_READBACK_FAILED")
            data = response.read(LIMIT + 1)
    except HTTPError as error:
        if missing_ok and error.code == 404:
            return None
        raise ValueError(safe_http_code(error)) from None
    except URLError:
        raise ValueError("STORAGE_NETWORK_ERROR") from None
    if len(data) > LIMIT or digest(data) != SOURCE_SHA:
        raise ValueError("STORAGE_ORIGINAL_SHA_MISMATCH")
    return data


def encrypt_token(token):
    public = load_pem_public_key(PUBLIC_KEY.read_bytes())
    key = os.urandom(32)
    nonce = os.urandom(12)
    wrapped = public.encrypt(key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),
                                               algorithm=hashes.SHA256(), label=None))
    return {"version": 1, "wrapped_key": b64(wrapped), "nonce": b64(nonce),
            "ciphertext": b64(AESGCM(key).encrypt(nonce, token.encode(), AAD))}


def decrypt_token(envelope, private_path):
    if envelope.get("version") != 1 or set(envelope) != {"version", "wrapped_key", "nonce", "ciphertext"}:
        raise ValueError("SIGNED_TOKEN_ENVELOPE_INVALID")
    private = load_pem_private_key(private_path.read_bytes(), password=None)
    key = private.decrypt(unb64(envelope["wrapped_key"]),
                          padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),
                                       algorithm=hashes.SHA256(), label=None))
    token = AESGCM(key).decrypt(unb64(envelope["nonce"]),
                                unb64(envelope["ciphertext"]), AAD).decode("ascii")
    if len(token) < 20 or len(token) > 4096:
        raise ValueError("SIGNED_TOKEN_INVALID")
    return token


def issue():
    headers = credentials()
    if readback(headers, missing_ok=True) is not None:
        return {"status": "EXISTING_OBJECT_REUSED", "source_sha256": SOURCE_SHA,
                "storage_uploads": 0}
    url = f"{BASE_URL}/storage/v1/object/upload/sign/{BUCKET}/{OBJECT_PATH}"
    request = Request(url, data=b"{}", method="POST",
                      headers={**headers, "Content-Type": "application/json"})
    try:
        with OPENER.open(request, timeout=30) as response:
            if response.status not in (200, 201):
                raise ValueError("STORAGE_SIGN_FAILED")
            payload = response.read(8193)
    except HTTPError as error:
        raise ValueError(safe_http_code(error)) from None
    except URLError:
        raise ValueError("STORAGE_NETWORK_ERROR") from None
    if len(payload) > 8192:
        raise ValueError("STORAGE_SIGN_RESPONSE_INVALID")
    data = json.loads(payload)
    signed = urlparse(data.get("url", ""))
    # Storage returns a relative URL. Never accept another host or path.
    if signed.scheme or signed.netloc or signed.path != f"/object/upload/sign/{BUCKET}/{OBJECT_PATH}":
        raise ValueError("STORAGE_SIGN_RESPONSE_INVALID")
    tokens = parse_qs(signed.query).get("token", [])
    if len(tokens) != 1:
        raise ValueError("STORAGE_SIGN_RESPONSE_INVALID")
    return {"status": "SIGNED_UPLOAD_READY", "source_sha256": SOURCE_SHA,
            "object_path": OBJECT_PATH, "envelope": encrypt_token(tokens[0]),
            "storage_uploads": 0}


def upload(image_path, envelope_path, private_path):
    original = image_path.read_bytes()
    if len(original) > LIMIT or digest(original) != SOURCE_SHA or not original.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("LOCAL_ORIGINAL_SHA_MISMATCH")
    token = decrypt_token(json.loads(envelope_path.read_text(encoding="utf-8")), private_path)
    url = (f"{BASE_URL}/storage/v1/object/upload/sign/{BUCKET}/{OBJECT_PATH}"
           f"?token={quote(token, safe='')}")
    request = Request(url, data=original, method="PUT",
                      headers={"Content-Type": "image/png", "x-upsert": "false"})
    try:
        with OPENER.open(request, timeout=60) as response:
            if response.status not in (200, 201):
                raise ValueError("STORAGE_UPLOAD_OUTCOME_UNKNOWN")
    except HTTPError as error:
        if error.code == 409:
            return {"status": "OBJECT_ALREADY_EXISTS_REQUIRES_READBACK", "source_sha256": SOURCE_SHA,
                    "upload_attempts": 1}
        raise ValueError("STORAGE_UPLOAD_OUTCOME_UNKNOWN" if error.code >= 500
                         else safe_http_code(error)) from None
    except URLError:
        raise ValueError("STORAGE_UPLOAD_OUTCOME_UNKNOWN") from None
    return {"status": "UPLOAD_SUBMITTED_REQUIRES_READBACK", "source_sha256": SOURCE_SHA,
            "upload_attempts": 1}


def main():
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--issue", action="store_true")
    modes.add_argument("--verify", action="store_true")
    modes.add_argument("--upload", action="store_true")
    modes.add_argument("--self-test", action="store_true")
    parser.add_argument("--image", type=Path)
    parser.add_argument("--envelope", type=Path)
    parser.add_argument("--private-key", type=Path)
    args = parser.parse_args()
    if args.issue:
        return issue()
    if args.verify:
        readback(credentials())
        return {"status": "PRIVATE_ORIGINAL_SHA_VERIFIED", "source_sha256": SOURCE_SHA,
                "storage_uploads": 0}
    if args.upload:
        if not all((args.image, args.envelope, args.private_key)):
            raise ValueError("UPLOAD_INPUTS_REQUIRED")
        return upload(args.image, args.envelope, args.private_key)
    if not args.private_key:
        raise ValueError("PRIVATE_KEY_REQUIRED")
    sample = "test-token-for-local-crypto-roundtrip-only"
    if decrypt_token(encrypt_token(sample), args.private_key) != sample:
        raise ValueError("ENVELOPE_ROUNDTRIP_FAILED")
    return {"status": "ENVELOPE_ROUNDTRIP_PASS", "network_calls": 0}


if __name__ == "__main__":
    try:
        print(json.dumps(main(), separators=(",", ":")))
    except Exception as error:
        code = (str(error) if isinstance(error, ValueError) and
                str(error).replace("_", "").isalnum() and str(error).upper() == str(error)
                else "HANDOFF_UNEXPECTED_ERROR")
        print(json.dumps({"status": "IMAGE_HANDOFF_REJECTED", "code": code}))
        raise SystemExit(1)
