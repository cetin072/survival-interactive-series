"""Prepare one deterministic public site derivative from a trusted private original."""
import argparse
import hashlib
import io
import json
import re
from pathlib import Path

from PIL import Image

from derive_site_original import derive
import illustration_storage_handoff as handoff


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json"
PUBLIC = ROOT / "archive/web/public/visual-assets"
REQUEST_VERSION = "site-derivative-request-v1"


def demand(ok, code):
    if not ok:
        raise ValueError(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def canonical_manifest_hash(body):
    canonical = json.dumps(
        body, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return digest(canonical)


def load_request(path):
    path = Path(path).resolve()
    requests_root = (ROOT / "archive/automation/site-derivative-requests").resolve()
    demand(path.is_relative_to(requests_root) and path.suffix == ".json",
           "SITE_DERIVATIVE_REQUEST_PATH_INVALID")
    request = json.loads(path.read_text(encoding="utf-8"))
    demand(request.get("version") == REQUEST_VERSION,
           "SITE_DERIVATIVE_REQUEST_VERSION_INVALID")
    demand(re.fullmatch(
        r"archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_[A-Z0-9_-]+\.json",
        request.get("identity_path", ""),
    ) is not None, "SITE_DERIVATIVE_IDENTITY_PATH_INVALID")
    for key, pattern in (
        ("point_id", r"point-[a-f0-9]{64}"),
        ("generation_key", r"generation-[a-f0-9]{64}"),
        ("source_sha256", r"[a-f0-9]{64}"),
    ):
        demand(re.fullmatch(pattern, request.get(key, "")) is not None,
               "SITE_DERIVATIVE_REQUEST_IDENTITY_INVALID")
    demand(isinstance(request.get("subject_id"), str) and request["subject_id"],
           "SITE_DERIVATIVE_REQUEST_IDENTITY_INVALID")
    return request


def registry_asset(record, object_path):
    registry_url, headers = handoff.registry_credentials()
    rows = handoff.read_registry_rows(registry_url, headers, record)
    demand(isinstance(rows, list) and len(rows) <= 2, "REGISTRY_SCAN_INCOMPLETE")
    matches = [
        row for row in rows
        if row.get("source", {}).get("point_id") == record["point_id"]
        or row.get("source", {}).get("generation_key") == record["generation_key"]
    ]
    demand(len(matches) == 1, "REGISTRY_DIAGNOSTIC_MATCH_COUNT_INVALID")
    row = matches[0]
    expected_object_path = handoff.storage_provider().registry_object_path(object_path)
    demand(
        row.get("source", {}).get("point_id") == record["point_id"]
        and row.get("source", {}).get("generation_key") == record["generation_key"]
        and row.get("source", {}).get("source_sha256") == record["source_sha256"]
        and row.get("object_path") == expected_object_path
        and isinstance(row.get("asset_id"), str) and row["asset_id"],
        "REGISTRY_DIAGNOSTIC_BINDING_INVALID",
    )
    return row


def validate_original(source, record):
    demand(len(source) == record["original_bytes"]
           and digest(source) == record["source_sha256"],
           "SITE_DERIVATIVE_ORIGINAL_SHA_MISMATCH")
    try:
        with Image.open(io.BytesIO(source)) as image:
            demand(image.format == "PNG"
                   and image.width == record["original_width"]
                   and image.height == record["original_height"],
                   "SITE_DERIVATIVE_ORIGINAL_IMAGE_INVALID")
            image.verify()
    except ValueError:
        raise
    except Exception:
        raise ValueError("SITE_DERIVATIVE_ORIGINAL_IMAGE_INVALID") from None


def build_site_asset(record, registry_row, object_path, derivative):
    derivative_sha = digest(derivative)
    return {
        "point_id": record["point_id"],
        "generation_key": record["generation_key"],
        "subject_id": record["subject_id"],
        "source_sha256": record["source_sha256"],
        "storage_bucket": handoff.storage_provider().bucket,
        "storage_object_path": object_path,
        "registry_asset_id": registry_row["asset_id"],
        "derivative_version": "site-png-512-v1",
        "public_path": f"/visual-assets/{derivative_sha}.png",
        "sha256": derivative_sha,
        "bytes": len(derivative),
        "width": 512,
        "height": 512,
        "mime_type": "image/png",
    }


def desired_manifest(existing, catalog_sha, asset):
    demand(existing.get("version") == "archive-site-assets-v1"
           and existing.get("chronicle_id") == "C03-AFTERFALL"
           and existing.get("worldline_id") == "AFTERFALL"
           and existing.get("visibility") == "PUBLIC_ARCHIVE"
           and isinstance(existing.get("assets"), list),
           "SITE_ASSET_MANIFEST_INVALID")
    matches = [
        item for item in existing["assets"]
        if item.get("point_id") == asset["point_id"]
        or item.get("generation_key") == asset["generation_key"]
        or item.get("subject_id") == asset["subject_id"]
    ]
    if matches:
        demand(len(matches) == 1 and matches[0] == asset,
               "SITE_ASSET_EXISTING_CONFLICT")
        assets = existing["assets"]
    else:
        assets = [*existing["assets"], asset]
    body = {
        "version": "archive-site-assets-v1",
        "chronicle_id": "C03-AFTERFALL",
        "worldline_id": "AFTERFALL",
        "visibility": "PUBLIC_ARCHIVE",
        "visual_catalog_sha256": catalog_sha,
        "assets": assets,
    }
    return {**body, "content_sha256": canonical_manifest_hash(body)}, bool(matches)


def prepare(request_path):
    request = load_request(request_path)
    identity_path = ROOT / request["identity_path"]
    record, catalog, point, object_path = handoff.identity(identity_path)
    demand(
        request["point_id"] == record["point_id"]
        and request["generation_key"] == record["generation_key"]
        and request["subject_id"] == record["subject_id"]
        and request["source_sha256"] == record["source_sha256"],
        "SITE_DERIVATIVE_REQUEST_IDENTITY_MISMATCH",
    )
    demand(point.get("status") == "READY"
           and point.get("visibility") == "PUBLIC_ARCHIVE",
           "SITE_DERIVATIVE_POINT_NOT_READY")

    provider = handoff.storage_provider()
    source = provider.readback(object_path)
    demand(source is not None, "SITE_DERIVATIVE_ORIGINAL_NOT_FOUND")
    validate_original(source, record)

    registry_row = registry_asset(record, object_path)
    derivative = derive(source)
    asset = build_site_asset(record, registry_row, object_path, derivative)

    existing = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest, already_present = desired_manifest(
        existing, catalog["content_sha256"], asset
    )
    public_file = PUBLIC / f"{asset['sha256']}.png"

    if already_present:
        demand(public_file.is_file()
               and public_file.read_bytes() == derivative,
               "SITE_ASSET_EXISTING_DERIVATIVE_CONFLICT")
        status = "SITE_DERIVATIVE_NOOP"
    else:
        demand(not public_file.exists(), "SITE_DERIVATIVE_PATH_CONFLICT")
        PUBLIC.mkdir(parents=True, exist_ok=True)
        public_file.write_bytes(derivative)
        MANIFEST.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        status = "SITE_DERIVATIVE_PREPARED"

    return {
        "status": status,
        "subject_id": record["subject_id"],
        "point_id": record["point_id"],
        "generation_key": record["generation_key"],
        "source_sha256": record["source_sha256"],
        "registry_asset_id": registry_row["asset_id"],
        "derivative_sha256": asset["sha256"],
        "derivative_bytes": asset["bytes"],
        "derivative_width": 512,
        "derivative_height": 512,
        "public_path": asset["public_path"],
        "manifest_path": MANIFEST.relative_to(ROOT).as_posix(),
        "derivative_path": public_file.relative_to(ROOT).as_posix(),
        "visual_catalog_sha256": catalog["content_sha256"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    args = parser.parse_args()
    return prepare(args.request)


if __name__ == "__main__":
    try:
        print(json.dumps(main(), ensure_ascii=False, separators=(",", ":")))
    except Exception as error:
        code = (
            str(error)
            if isinstance(error, ValueError)
            and str(error).isupper()
            and str(error).replace("_", "").isalnum()
            else "SITE_DERIVATIVE_UNEXPECTED_ERROR"
        )
        print(json.dumps({"status": "SITE_DERIVATIVE_REJECTED", "code": code}))
        raise SystemExit(1)
