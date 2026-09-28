"""Verify a private Storage original and reconcile its READY registry row.

Draft Release validation and the trusted direct upload live in
draft_release_illustration_handoff.py. This module owns the exact private
readback and registry read/reconcile/readback steps.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener

from original_storage_provider import (
    DEFAULT_SUPABASE_URL,
    build_original_storage_provider,
)


REGISTRY_BASE_URL = DEFAULT_SUPABASE_URL
ROOT = Path(__file__).resolve().parents[2]
IDENTITY = ROOT / "archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_WAREHOUSE.json"
CATALOG = ROOT / "archive/content/visuals/C03-AFTERFALL/VISUALS.json"
SITE_ASSETS = ROOT / "archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json"
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


def identity(identity_path=IDENTITY, allow_published=False):
    record = json.loads(Path(identity_path).read_text(encoding="utf-8"))
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
    demand(allow_published or not existing, "SITE_ASSET_ALREADY_EXISTS")
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


def registry_read_error(error):
    body = error.read(4097).decode("utf-8", errors="replace")
    return ValueError(f"REGISTRY_READ_FAILED_HTTP_{error.code}:{body[:4000]}")


def registry_rpc_headers(headers):
    return {**headers, "Content-Profile": "public", "Content-Type": "application/json"}


def read_registry_rows(registry_url, headers, record):
    url = f"{registry_url}/rest/v1/rpc/archive_visual_asset_readback"
    payload = {"p_point_id": record["point_id"], "p_generation_key": record["generation_key"]}
    request = Request(url, data=json.dumps(payload).encode(), method="POST",
                      headers=registry_rpc_headers(headers))
    try:
        with OPENER.open(request, timeout=30) as response:
            return json.loads(response.read(2_000_001))
    except HTTPError as error:
        raise registry_read_error(error) from None
    except URLError:
        raise ValueError("REGISTRY_READ_FAILED_NETWORK") from None


def reconcile_registry_row(registry_url, headers, expected):
    url = f"{registry_url}/rest/v1/rpc/archive_visual_asset_reconcile"
    request = Request(url, data=json.dumps({"p_row": expected}).encode(), method="POST",
                      headers=registry_rpc_headers(headers))
    try:
        with OPENER.open(request, timeout=30) as response:
            return json.loads(response.read(2_000_001))
    except HTTPError as error:
        body = error.read(4097).decode("utf-8", errors="replace")[:4000]
        raise ValueError(f"REGISTRY_RECONCILE_FAILED_HTTP_{error.code}:{body}") from None
    except URLError:
        raise ValueError("REGISTRY_RECONCILE_FAILED_NETWORK") from None


def diagnose_registry(identity_path=IDENTITY):
    record, _, _, object_path = identity(identity_path, allow_published=True)
    registry_url, headers = registry_credentials()
    rows = read_registry_rows(registry_url, headers, record)
    demand(isinstance(rows, list) and len(rows) <= 2, "REGISTRY_SCAN_INCOMPLETE")
    matches = [row for row in rows if row.get("source", {}).get("point_id") == record["point_id"]
               or row.get("source", {}).get("generation_key") == record["generation_key"]]
    demand(len(matches) == 1, "REGISTRY_DIAGNOSTIC_MATCH_COUNT_INVALID")
    row = matches[0]
    expected_object_path = storage_provider().registry_object_path(object_path)
    observed_storage_provider = row.get("generation_meta", {}).get("storage_provider")
    demand(row.get("source", {}).get("point_id") == record["point_id"]
           and row.get("source", {}).get("generation_key") == record["generation_key"]
           and row.get("source", {}).get("source_sha256") == record["source_sha256"]
           and row.get("object_path") == expected_object_path
           and observed_storage_provider in (None, "supabase"),
           "REGISTRY_DIAGNOSTIC_BINDING_INVALID")
    return {
        "status": "REGISTRY_READBACK_DIAGNOSTIC_PASS",
        "point_id": record["point_id"],
        "generation_key": record["generation_key"],
        "source_sha256": row["source"]["source_sha256"],
        "object_path": row["object_path"],
        "storage_provider": observed_storage_provider,
        "storage_provider_inferred": ("supabase" if observed_storage_provider is None
                                       and row["object_path"].startswith("survival-archive-originals/")
                                       else observed_storage_provider),
        "duplicate_count": 0,
    }


def verify_register(identity_path=IDENTITY):
    record, catalog, point, path = identity(identity_path)
    provider = storage_provider()
    source = provider.readback(path)
    demand(source is not None and digest(source) == record["source_sha256"], "STORAGE_ORIGINAL_SHA_MISMATCH")
    registry_url, headers = registry_credentials()
    rows = read_registry_rows(registry_url, headers, record)
    demand(isinstance(rows, list) and len(rows) <= 2, "REGISTRY_SCAN_INCOMPLETE")
    expected = registry_row(record, catalog, point, path)
    matched = [row for row in rows if row.get("source", {}).get("point_id") == record["point_id"]
               or row.get("source", {}).get("generation_key") == record["generation_key"]]
    if matched:
        demand(len(matched) == 1 and all(matched[0].get(key) == value for key, value in expected.items()),
               "REGISTRY_EXISTING_ASSET_CONFLICT")
        return {"status": "EXISTING_READY_ASSET_REUSED", "asset_id": expected["asset_id"],
                "registry_writes": 0, "storage_readback_sha256": digest(source)}
    reconcile_registry_row(registry_url, headers, expected)
    # Reconcile only inserts when no matching row exists. Confirm its result with a fresh RPC read.
    return verify_registry_readback(headers, expected, registry_url, digest(source))


def verify_registry_readback(headers, expected, registry_url, source_sha):
    record = {"point_id": expected["source"]["point_id"],
              "generation_key": expected["source"]["generation_key"]}
    rows = read_registry_rows(registry_url, headers, record)
    demand(isinstance(rows, list) and len(rows) <= 2, "REGISTRY_SCAN_INCOMPLETE")
    matches = [row for row in rows if row.get("source", {}).get("point_id") == expected["source"]["point_id"]
               or row.get("source", {}).get("generation_key") == expected["source"]["generation_key"]]
    demand(len(matches) == 1 and all(matches[0].get(key) == value for key, value in expected.items()),
           "REGISTRY_INSERT_NOT_VERIFIED")
    return {"status": "READY_REGISTRY_ROW_VERIFIED", "asset_id": expected["asset_id"],
            "registry_writes": 1, "storage_readback_sha256": source_sha}


def main():
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--verify-register", action="store_true")
    modes.add_argument("--registry-diagnostic", action="store_true")
    parser.add_argument("--identity", type=Path, default=IDENTITY)
    args = parser.parse_args()
    if args.registry_diagnostic:
        return diagnose_registry(args.identity)
    return verify_register(args.identity)


if __name__ == "__main__":
    try:
        print(json.dumps(main(), separators=(",", ":")))
    except Exception as error:
        code = ("REGISTRY_READ_FAILED" if isinstance(error, ValueError)
                and str(error).startswith("REGISTRY_READ_FAILED_HTTP_") else
                "REGISTRY_RECONCILE_FAILED" if isinstance(error, ValueError)
                and str(error).startswith("REGISTRY_RECONCILE_FAILED_HTTP_") else
                str(error) if isinstance(error, ValueError) and str(error).isupper()
                and str(error).replace("_", "").isalnum() else "HANDOFF_UNEXPECTED_ERROR")
        result = {"status": "IMAGE_HANDOFF_REJECTED", "code": code}
        if isinstance(error, ValueError) and str(error).startswith(("REGISTRY_READ_FAILED_HTTP_",
                                                                    "REGISTRY_RECONCILE_FAILED_HTTP_")):
            prefix, response = str(error).split(":", 1)
            result["http_status"] = int(prefix.rsplit("_", 1)[1])
            result["response"] = response
        print(json.dumps(result))
        raise SystemExit(1)
