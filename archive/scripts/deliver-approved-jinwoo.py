"""Deliver the previously approved Jinwoo original to the Archive site.

Storage mode is the production evidence path. Local mode only verifies the
historical approved original and is deliberately reported as local evidence.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from PIL import Image

from derive_site_original import derive


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json"
PUBLIC = ROOT / "archive/web/public/visual-assets"
CATALOG = ROOT / "archive/content/visuals/C03-AFTERFALL/VISUALS.json"
SOURCE_SHA = "f4882707c0272d1eb7123493bb46dc7193e0235ceba778d3582d0112a087a78d"
DERIVATIVE_SHA = "5112dc7b2e8901aed2fcbe2c4a34736af0fefed2394a5c82e7d08fa6f2d558c8"
ASSET = {
    "point_id": "point-e33f848046b1245234e579828dadc03939faf10d609c15bff315b8c421be1a72",
    "generation_key": "generation-a59f0391ed3fa13bcbcde8ea2123446837e6cc84ef5ab24f93d07f815170f7e8",
    "subject_id": "char-jinwoo",
    "accepted_candidate_id": "candidate-dac3f0800d1c4d06f73c9c2447649e9a3ac1103edd30c9cfd81d3614843307fc",
    "source_sha256": SOURCE_SHA,
    "storage_bucket": "survival-archive-originals",
    "storage_object_path": f"AFTERFALL/candidate-dac3f0800d1c4d06f73c9c2447649e9a3ac1103edd30c9cfd81d3614843307fc/{SOURCE_SHA}.png",
    "registry_asset_id": "AF-CHAR-DAC3F0800D1C4D06F73C9C24",
    "derivative_version": "site-png-512-v1",
    "public_path": f"/visual-assets/{DERIVATIVE_SHA}.png",
    "sha256": DERIVATIVE_SHA,
    "bytes": 153519,
    "width": 512,
    "height": 512,
    "mime_type": "image/png",
}
CATALOG_SHA = "fce74e24aa7ac5ddb8138c0427a7fddcb8b5325d425470ca49e55383474d5b1c"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fail_if(condition, code):
    if condition:
        raise ValueError(code)


def catalog_check(path):
    if not path.exists():
        return "CATALOG_NOT_IN_CHECKOUT"
    catalog = json.loads(path.read_text(encoding="utf-8"))
    fail_if(catalog.get("content_sha256") != CATALOG_SHA, "CATALOG_REVISION_MISMATCH")
    matching = [point for point in catalog["points"] if point["point_id"] == ASSET["point_id"]]
    fail_if(len(matching) != 1, "POINT_NOT_FOUND")
    point = matching[0]
    fail_if(point["status"] != "READY" or point["generation_key"] != ASSET["generation_key"]
            or point["subject_id"] != ASSET["subject_id"], "POINT_BINDING_MISMATCH")
    return "CATALOG_MATCHED"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        raise ValueError("STORAGE_REDIRECT_REJECTED")


def storage_readback():
    url = os.environ.get("ARCHIVE_SUPABASE_URL", "")
    key = os.environ.get("ARCHIVE_SUPABASE_SERVICE_ROLE_KEY", "")
    fail_if(url.rstrip("/") != "https://jgsxpdflgkqroecfjzxq.supabase.co" or len(key) < 20,
            "STORAGE_CREDENTIALS_REQUIRED")
    url = url.rstrip("/")
    path = ASSET["storage_object_path"]
    request = Request(f"{url}/storage/v1/object/authenticated/{ASSET['storage_bucket']}/{path}",
                      headers={"apikey": key, "Authorization": f"Bearer {key}"})
    opener = build_opener(NoRedirect)
    try:
        with opener.open(request, timeout=30) as response:
            fail_if(response.status != 200, "STORAGE_READBACK_FAILED")
            original = response.read(20 * 1024 * 1024 + 1)
    except HTTPError as error:
        code = ({401: "STORAGE_AUTH_FAILED", 403: "STORAGE_AUTH_FAILED",
                 404: "STORAGE_OBJECT_NOT_FOUND"}.get(error.code)
                or f"STORAGE_HTTP_ERROR_{error.code}")
        raise ValueError(code) from None
    except URLError:
        raise ValueError("STORAGE_NETWORK_ERROR") from None
    return original


def checked_pixels(data):
    with Image.open(io.BytesIO(data)) as image:
        fail_if(image.format != "PNG" or image.size != (512, 512), "DERIVATIVE_IMAGE_INVALID")
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        return digest(image.convert("RGB").tobytes())


def image_check(source, generated, committed):
    fail_if(digest(source) != SOURCE_SHA, "APPROVED_ORIGINAL_SHA_MISMATCH")
    fail_if(digest(committed) != DERIVATIVE_SHA or len(committed) != ASSET["bytes"],
            "DERIVATIVE_MISMATCH")
    fail_if(checked_pixels(generated) != checked_pixels(committed),
            "DERIVATIVE_NOT_FROM_ORIGINAL")
    return "BYTE_EXACT" if generated == committed else "PIXEL_EQUIVALENT"


def desired_manifest(assets=None):
    body = {"version": "archive-site-assets-v1", "chronicle_id": "C03-AFTERFALL",
            "worldline_id": "AFTERFALL", "visibility": "PUBLIC_ARCHIVE",
            "visual_catalog_sha256": CATALOG_SHA, "assets": assets or [ASSET]}
    canonical = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return {**body, "content_sha256": digest(canonical)}


def deliver(source, mode, catalog_path, check_only=False):
    catalog_status = catalog_check(catalog_path)
    fail_if(digest(source) != SOURCE_SHA, "APPROVED_ORIGINAL_SHA_MISMATCH")
    derivative = derive(source)
    public_file = PUBLIC / f"{DERIVATIVE_SHA}.png"
    new_asset = not public_file.exists()
    committed = public_file.read_bytes() if not new_asset else derivative
    derivative_match = image_check(source, derivative, committed)
    new_manifest = not MANIFEST.exists()
    if not new_manifest:
        existing = json.loads(MANIFEST.read_text(encoding="utf-8"))
        assets = existing.get("assets")
        fail_if(not isinstance(assets, list) or len(assets) != 2 or assets[0] != ASSET,
                "EXISTING_MANIFEST_CONFLICT")
        expected = desired_manifest(assets)
        fail_if(json.loads(MANIFEST.read_text(encoding="utf-8")) != expected,
                "EXISTING_MANIFEST_CONFLICT")
    else:
        expected = desired_manifest()
    fail_if(check_only and (new_asset or new_manifest), "SITE_ASSET_NOT_COMMITTED")
    if new_asset and not check_only:
        PUBLIC.mkdir(parents=True, exist_ok=True)
        public_file.write_bytes(derivative)
    if new_manifest and not check_only:
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"status": "IMAGE_DELIVERY_LOCAL_SOURCE" if mode == "local" else "IMAGE_DELIVERY_STORAGE_READBACK",
            "catalog": catalog_status, "source_sha256": SOURCE_SHA, "derivative_sha256": DERIVATIVE_SHA,
            "storage_objects_created": 0, "site_assets_created": int(new_asset and not check_only),
            "manifests_created": int(new_manifest and not check_only), "duplicates": 0,
            "read_only": check_only, "derivative_match": derivative_match,
            "public_path": ASSET["public_path"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--storage", action="store_true")
    source.add_argument("--local-source", type=Path)
    parser.add_argument("--catalog", type=Path, default=CATALOG)
    parser.add_argument("--check", action="store_true", help="verify committed site files without writing")
    args = parser.parse_args()
    try:
        data = storage_readback() if args.storage else args.local_source.read_bytes()
        print(json.dumps(deliver(data, "storage" if args.storage else "local", args.catalog, args.check)))
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and str(error).isupper() else "UNEXPECTED_ERROR"
        print(json.dumps({"status": "IMAGE_DELIVERY_REJECTED", "code": code}))
        raise SystemExit(1)
