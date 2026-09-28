"""Scoped private Storage and registry handoff for one public illustration.

The trusted GitHub runner issues a one-object upload token, then verifies the
private readback and inserts the READY registry row. The local machine only
decrypts the short-lived token and uploads the already reviewed PNG once.
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

from original_storage_provider import (
    DEFAULT_SUPABASE_URL,
    build_original_storage_provider,
    load_original_storage_selection,
)


REGISTRY_BASE_URL = DEFAULT_SUPABASE_URL
ROOT = Path(__file__).resolve().parents[2]
IDENTITY = ROOT / "archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_WAREHOUSE.json"
CATALOG = ROOT / "archive/content/visuals/C03-AFTERFALL/VISUALS.json"
SITE_ASSETS = ROOT / "archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json"
PUBLIC_KEY = ROOT / ".github/warehouse-e2e-upload-public.pem"
LIMIT = 20 * 1024 * 1024


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        raise ValueError("STORAGE_REDIRECT_REJECTED")


OPENER = build_opener(NoRedirect)


def demand(ok, code):
    if not ok:
        raise ValueError(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def identity():
    record = json.loads(IDENTITY.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    manifest = json.loads(SITE_ASSETS.read_text(encoding="utf-8"))
    point = next((item for item in catalog.get("points", [])
                  if item.get("point_id") == record.get("point_id")), None)
    demand(record.get("version") == "illustration-e2e-identity-v1", "IDENTITY_VERSION_INVALID")
    demand(point is not None and point.get("status") == "READY"
           and point.get("visibility") == "PUBLIC_ARCHIVE"
           and point.get("subject_id") == record.get("subject_id")
           and point.get("generation_key") == record.get("generation_key"), "IDENTITY_NOT_CURRENT_READY_POINT")
    demand(point.get("point_type") in ("CHARACTER", "LOCATION", "EVENT")
           and point.get("brief", {}).get("art_direction", {}).get("style_version") == "AFTERFALL_ARCHIVE_V1",
           "IDENTITY_BRIEF_INVALID")
    demand(__import__("re").fullmatch(r"point-[a-f0-9]{64}", record.get("point_id", "")) is not None
           and __import__("re").fullmatch(r"generation-[a-f0-9]{64}", record.get("generation_key", "")) is not None
           and __import__("re").fullmatch(r"[a-f0-9]{64}", record.get("source_sha256", "")) is not None,
           "IDENTITY_HASH_INVALID")
    demand(record.get("content_review") == "MATCHES_INTENDED_BRIEF"
           and record.get("provider") == "image_gen.imagegen"
           and isinstance(record.get("tool_result_id"), str), "IDENTITY_PROVENANCE_INVALID")
    existing = [asset for asset in manifest.get("assets", [])
                if asset.get("point_id") == record["point_id"]
                or asset.get("generation_key") == record["generation_key"]
                or asset.get("subject_id") == record["subject_id"]]
    demand(not existing, "SITE_ASSET_ALREADY_EXISTS")
    path = (f"AFTERFALL/{record['point_id']}/{record['generation_key']}/"
            f"{record['source_sha256']}.png")
    return record, catalog, point, path


def storage_provider():
    return build_original_storage_provider(OPENER, LIMIT)


def registry_credentials():
    url = os.environ.get("ARCHIVE_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("ARCHIVE_SUPABASE_SERVICE_ROLE_KEY", "")
    demand(url == REGISTRY_BASE_URL and len(key) >= 20, "REGISTRY_CREDENTIALS_REQUIRED")
    return url, {"apikey": key, "Authorization": f"Bearer {key}"}


def envelope_aad(provider, bucket, path, sha):
    return f"{provider}:{bucket}/{path}:{sha}".encode()


def encrypt_token(token, path, sha):
    selection = load_original_storage_selection()
    public = load_pem_public_key(PUBLIC_KEY.read_bytes())
    key, nonce = os.urandom(32), os.urandom(12)
    aad = envelope_aad(selection.provider, selection.bucket, path, sha)
    wrapped = public.encrypt(key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),
                                               algorithm=hashes.SHA256(), label=None))
    return {"version": 2, "provider": selection.provider, "bucket": selection.bucket,
            "path": path, "source_sha256": sha,
            "wrapped_key": base64.b64encode(wrapped).decode("ascii"),
            "nonce": base64.b64encode(nonce).decode("ascii"),
            "ciphertext": base64.b64encode(AESGCM(key).encrypt(nonce, token.encode(), aad)).decode("ascii")}


def decrypt_token(envelope, private_path, path, sha):
    selection = load_original_storage_selection()
    demand(set(envelope) == {"version", "provider", "bucket", "path", "source_sha256",
                             "wrapped_key", "nonce", "ciphertext"}
           and envelope.get("version") == 2
           and envelope.get("provider") == selection.provider
           and envelope.get("bucket") == selection.bucket
           and envelope.get("path") == path
           and envelope.get("source_sha256") == sha,
           "SIGNED_TOKEN_ENVELOPE_INVALID")
    decode = lambda key: base64.b64decode(envelope[key], validate=True)
    private = load_pem_private_key(Path(private_path).read_bytes(), password=None)
    key = private.decrypt(decode("wrapped_key"), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),
                                                              algorithm=hashes.SHA256(), label=None))
    aad = envelope_aad(selection.provider, selection.bucket, path, sha)
    token = AESGCM(key).decrypt(decode("nonce"), decode("ciphertext"), aad).decode("ascii")
    demand(20 <= len(token) <= 4096, "SIGNED_TOKEN_INVALID")
    return token


def issue(envelope_path):
    record, _, _, path = identity()
    provider = storage_provider()
    existing = provider.readback(path, missing_ok=True)
    if existing is not None:
        demand(digest(existing) == record["source_sha256"], "STORAGE_EXISTING_OBJECT_SHA_MISMATCH")
        Path(envelope_path).write_text(json.dumps({"version": 0, "status": "EXISTING_OBJECT_REUSED",
                                                   "storage_provider": provider.provider_id,
                                                   "source_sha256": digest(existing)}), encoding="utf-8")
        return {"status": "EXISTING_OBJECT_REUSED", "storage_provider": provider.provider_id,
                "source_sha256": digest(existing), "storage_uploads": 0}
    grant = provider.issue_upload_grant(path)
    Path(envelope_path).write_text(
        json.dumps(encrypt_token(grant, path, record["source_sha256"])),
        encoding="utf-8",
    )
    return {"status": "SIGNED_UPLOAD_READY", "storage_provider": provider.provider_id,
            "source_sha256": record["source_sha256"],
            "storage_object_path": path, "storage_uploads": 0}


def upload(image_path, envelope_path, private_key):
    record, _, _, path = identity()
    provider = storage_provider()
    original = Path(image_path).read_bytes()
    demand(0 < len(original) <= LIMIT and original.startswith(b"\\x89PNG\\r\\n\\x1a\\n")
           and digest(original) == record["source_sha256"], "LOCAL_ORIGINAL_SHA_MISMATCH")
    envelope = json.loads(Path(envelope_path).read_text(encoding="utf-8"))
    grant = decrypt_token(envelope, private_key, path, record["source_sha256"])
    url = provider.upload_url(path, grant)
    request = Request(url, data=original, method="PUT",
                      headers={"Content-Type": "image/png", "x-upsert": "false"})
    try:
        with OPENER.open(request, timeout=60) as response:
            demand(response.status in (200, 201), "STORAGE_UPLOAD_OUTCOME_UNKNOWN")
    except HTTPError as error:
        if error.code == 409:
            return {"status": "OBJECT_EXISTS_REQUIRES_TRUSTED_READBACK",
                    "storage_provider": provider.provider_id, "upload_attempts": 1}
        raise ValueError("STORAGE_UPLOAD_OUTCOME_UNKNOWN" if error.code >= 500
                         else f"STORAGE_HTTP_ERROR_{error.code}") from None
    except URLError:
        raise ValueError("STORAGE_UPLOAD_OUTCOME_UNKNOWN") from None
    return {"status": "UPLOAD_SUBMITTED_REQUIRES_TRUSTED_READBACK",
            "storage_provider": provider.provider_id, "upload_attempts": 1,
            "source_sha256": record["source_sha256"], "storage_object_path": path}


def registry_row(record, catalog, point, path):
    asset_type = point["asset_type"]
    tag = {"CHARACTER": "CHAR", "LOCATION": "LOC", "EVENT": "EVENT"}[asset_type]
    suffix = record["point_id"].split("-", 1)[1][:24].upper()
    return {
        "worldline_id": "AFTERFALL", "asset_id": f"AF-{tag}-{suffix}",
        "asset_type": asset_type, "status": "READY", "visibility": "PLAYER_ARCHIVE",
        "title": point["title"], "style_version": point["brief"]["art_direction"]["style_version"],
        "source": {"kind": "CODEX_BUILTIN_FOREGROUND", "point_id": record["point_id"],
                   "subject_id": record["subject_id"], "catalog_ref": record["catalog_ref"],
                   "source_sha256": record["source_sha256"], "catalog_sha256": catalog["content_sha256"],
                   "generation_key": record["generation_key"]},
        "brief": point["brief"], "prompt_snapshot": None,
        "provider": record["provider"], "provider_model": None,
        "provider_asset_id": record["tool_result_id"],
        "object_path": storage_provider().registry_object_path(path), "image_url": None,
        "generation_meta": {"source_sha256": record["source_sha256"], "content_review": record["content_review"],
                            "storage_verified": True, "storage_provider": storage_provider().provider_id,
                            "tool": record["tool"],
                            "surface": record["surface"], "tool_result_id": record["tool_result_id"],
                            "generation_attempts": record["generation_attempts"],
                            "unattended_generation_proven": False, "paid_api_calls": 0},
    }


def verify_register():
    record, catalog, point, path = identity()
    provider = storage_provider()
    source = provider.readback(path)
    demand(source is not None and digest(source) == record["source_sha256"], "STORAGE_ORIGINAL_SHA_MISMATCH")
    registry_url, headers = registry_credentials()
    url = f"{registry_url}/rest/v1/visual_assets"
    profile_headers = {**headers, "Accept-Profile": "survival_rpg"}
    get = Request(f"{url}?select=*&worldline_id=eq.AFTERFALL&limit=1000", headers=profile_headers)
    try:
        with OPENER.open(get, timeout=30) as response:
            rows = json.loads(response.read(2_000_001))
    except (HTTPError, URLError):
        raise ValueError("REGISTRY_READ_FAILED") from None
    demand(isinstance(rows, list) and len(rows) < 1000, "REGISTRY_SCAN_INCOMPLETE")
    expected = registry_row(record, catalog, point, path)
    matched = [row for row in rows if row.get("source", {}).get("point_id") == record["point_id"]
               or row.get("source", {}).get("generation_key") == record["generation_key"]]
    if matched:
        demand(len(matched) == 1 and all(matched[0].get(key) == value for key, value in expected.items()),
               "REGISTRY_EXISTING_ASSET_CONFLICT")
        return {"status": "EXISTING_READY_ASSET_REUSED", "asset_id": expected["asset_id"],
                "registry_writes": 0, "storage_readback_sha256": digest(source)}
    post_headers = {**profile_headers, "Content-Profile": "survival_rpg",
                    "Content-Type": "application/json", "Prefer": "return=minimal"}
    try:
        with OPENER.open(Request(url, data=json.dumps(expected).encode(), method="POST", headers=post_headers), timeout=30) as response:
            demand(response.status in (200, 201, 204), "REGISTRY_INSERT_FAILED")
    except HTTPError as error:
        if error.code not in (409,) and error.code < 500:
            raise ValueError("REGISTRY_INSERT_FAILED") from None
    except URLError:
        pass
    # Whether the response arrived or not, reconcile from a fresh DB read before reporting success.
    return verify_registry_readback(headers, expected, url, profile_headers, digest(source))


def verify_registry_readback(headers, expected, url, profile_headers, source_sha):
    request = Request(f"{url}?select=*&worldline_id=eq.AFTERFALL&limit=1000", headers=profile_headers)
    try:
        with OPENER.open(request, timeout=30) as response:
            rows = json.loads(response.read(2_000_001))
    except (HTTPError, URLError):
        raise ValueError("REGISTRY_READ_FAILED") from None
    matches = [row for row in rows if row.get("source", {}).get("point_id") == expected["source"]["point_id"]
               or row.get("source", {}).get("generation_key") == expected["source"]["generation_key"]]
    demand(len(matches) == 1 and all(matches[0].get(key) == value for key, value in expected.items()),
           "REGISTRY_INSERT_NOT_VERIFIED")
    return {"status": "READY_REGISTRY_ROW_VERIFIED", "asset_id": expected["asset_id"],
            "registry_writes": 1, "storage_readback_sha256": source_sha}


def main():
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--issue", action="store_true")
    modes.add_argument("--upload", action="store_true")
    modes.add_argument("--verify-register", action="store_true")
    parser.add_argument("--envelope", type=Path)
    parser.add_argument("--image", type=Path)
    parser.add_argument("--private-key", type=Path)
    args = parser.parse_args()
    if args.issue:
        demand(args.envelope is not None, "ENVELOPE_OUTPUT_REQUIRED")
        return issue(args.envelope)
    if args.upload:
        demand(args.envelope and args.image and args.private_key, "UPLOAD_INPUTS_REQUIRED")
        return upload(args.image, args.envelope, args.private_key)
    return verify_register()


if __name__ == "__main__":
    try:
        print(json.dumps(main(), separators=(",", ":")))
    except Exception as error:
        code = (str(error) if isinstance(error, ValueError) and str(error).isupper()
                and str(error).replace("_", "").isalnum() else "HANDOFF_UNEXPECTED_ERROR")
        print(json.dumps({"status": "IMAGE_HANDOFF_REJECTED", "code": code}))
        raise SystemExit(1)
