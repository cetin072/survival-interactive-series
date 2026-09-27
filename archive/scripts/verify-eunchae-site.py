"""Read-only trusted proof for the new Eunchae original and site derivative."""
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
URL = "https://jgsxpdflgkqroecfjzxq.supabase.co"
SOURCE_SHA = "47af97c1defa474275204dc73592f12ce59ee23591eec0d13d1f49b114d7875c"
DERIVATIVE_SHA = "d05543a3fb5f3ba23256c5d2d277074ee4650ea9708cd7980e79b7e4fa296314"
ASSET = {
    "point_id": "point-5458129f6175ce205357c35dae480389c1c88ec3a8480b141aa775a7b31fa59b",
    "generation_key": "generation-a1b923f9a5e050ab359aee428f3f504c284c18e229e5e20398ff09b6a91c6a30",
    "subject_id": "char-eunchae",
    "source_sha256": SOURCE_SHA,
    "storage_bucket": "survival-archive-originals",
    "storage_object_path": "AFTERFALL/point-5458129f6175ce205357c35dae480389c1c88ec3a8480b141aa775a7b31fa59b/generation-a1b923f9a5e050ab359aee428f3f504c284c18e229e5e20398ff09b6a91c6a30/47af97c1defa474275204dc73592f12ce59ee23591eec0d13d1f49b114d7875c.png",
    "registry_asset_id": "AF-CHAR-A1B923F9A5E050AB359AEE42",
    "derivative_version": "site-png-512-v1",
    "public_path": f"/visual-assets/{DERIVATIVE_SHA}.png",
    "sha256": DERIVATIVE_SHA,
    "bytes": 168453,
    "width": 512,
    "height": 512,
    "mime_type": "image/png",
}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        raise ValueError("STORAGE_REDIRECT_REJECTED")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def original_from_storage():
    url = os.environ.get("ARCHIVE_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("ARCHIVE_SUPABASE_SERVICE_ROLE_KEY", "")
    if url != URL or len(key) < 20:
        raise ValueError("STORAGE_CREDENTIALS_REQUIRED")
    path = ASSET["storage_object_path"]
    request = Request(f"{URL}/storage/v1/object/authenticated/{ASSET['storage_bucket']}/{path}",
                      headers={"apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with build_opener(NoRedirect).open(request, timeout=30) as response:
            if response.status != 200:
                raise ValueError("STORAGE_READBACK_FAILED")
            source = response.read(20 * 1024 * 1024 + 1)
    except HTTPError as error:
        code = ({401: "STORAGE_AUTH_FAILED", 403: "STORAGE_AUTH_FAILED",
                 404: "STORAGE_OBJECT_NOT_FOUND"}.get(error.code)
                or f"STORAGE_HTTP_ERROR_{error.code}")
        raise ValueError(code) from None
    except URLError:
        raise ValueError("STORAGE_NETWORK_ERROR") from None
    return source


def pixels(data):
    with Image.open(io.BytesIO(data)) as image:
        if image.format != "PNG" or image.size != (512, 512):
            raise ValueError("DERIVATIVE_IMAGE_INVALID")
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        return digest(image.convert("RGB").tobytes())


def verify(source):
    if len(source) != 1842150 or digest(source) != SOURCE_SHA:
        raise ValueError("ORIGINAL_SHA_MISMATCH")
    with Image.open(io.BytesIO(source)) as image:
        if image.format != "PNG" or image.size != (1254, 1254):
            raise ValueError("ORIGINAL_IMAGE_INVALID")
        image.verify()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if (manifest.get("version") != "archive-site-assets-v1"
            or manifest.get("visual_catalog_sha256") != "fce74e24aa7ac5ddb8138c0427a7fddcb8b5325d425470ca49e55383474d5b1c"
            or len(manifest.get("assets", [])) != 2 or manifest["assets"][1] != ASSET):
        raise ValueError("SITE_ASSET_BINDING_MISMATCH")
    body = {key: value for key, value in manifest.items() if key != "content_sha256"}
    canonical = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    if digest(canonical) != manifest.get("content_sha256"):
        raise ValueError("SITE_MANIFEST_SHA_MISMATCH")
    committed = (PUBLIC / f"{DERIVATIVE_SHA}.png").read_bytes()
    if len(committed) != ASSET["bytes"] or digest(committed) != DERIVATIVE_SHA:
        raise ValueError("SITE_DERIVATIVE_SHA_MISMATCH")
    generated = derive(source)
    if pixels(generated) != pixels(committed):
        raise ValueError("DERIVATIVE_NOT_FROM_ORIGINAL")
    return {"status": "IMAGE_DELIVERY_STORAGE_READBACK", "subject_id": "char-eunchae",
            "point_id": ASSET["point_id"], "generation_key": ASSET["generation_key"],
            "source_sha256": SOURCE_SHA, "derivative_sha256": DERIVATIVE_SHA,
            "derivative_match": "BYTE_EXACT" if generated == committed else "PIXEL_EQUIVALENT",
            "storage_uploads": 0, "site_assets_created": 0, "manifests_created": 0,
            "duplicates": 0, "read_only": True, "public_path": ASSET["public_path"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--storage", action="store_true")
    source.add_argument("--local-source", type=Path)
    args = parser.parse_args()
    try:
        original = original_from_storage() if args.storage else args.local_source.read_bytes()
        report = verify(original)
        if not args.storage:
            report["status"] = "IMAGE_DELIVERY_LOCAL_SOURCE"
        print(json.dumps(report))
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and str(error).isupper() else "UNEXPECTED_ERROR"
        print(json.dumps({"status": "IMAGE_DELIVERY_REJECTED", "code": code}))
        raise SystemExit(1)
