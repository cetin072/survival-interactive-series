"""Trusted handoff from private Supabase chunk staging to original Storage."""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request

from PIL import Image

import draft_release_illustration_handoff as draft
import illustration_storage_handoff as handoff


ROOT = Path(__file__).resolve().parents[2]
RPC_LIMIT = 8_000_000


def demand(ok, code):
    if not ok:
        raise ValueError(code)


def rpc(name, payload, max_bytes=RPC_LIMIT):
    url, headers = handoff.registry_credentials()
    request = Request(
        f"{url}/rest/v1/rpc/{name}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers=handoff.registry_rpc_headers(headers),
    )
    try:
        with handoff.OPENER.open(request, timeout=45) as response:
            body = response.read(max_bytes + 1)
            demand(len(body) <= max_bytes, "STAGED_HANDOFF_RPC_RESPONSE_TOO_LARGE")
            return json.loads(body) if body else None
    except HTTPError as error:
        raise ValueError(f"STAGED_HANDOFF_RPC_HTTP_{error.code}") from None
    except URLError:
        raise ValueError("STAGED_HANDOFF_RPC_NETWORK_ERROR") from None
    except json.JSONDecodeError:
        raise ValueError("STAGED_HANDOFF_RPC_JSON_INVALID") from None


def decode_staged_original(meta, chunks, record, staging_id, source_commit, identity_path):
    demand(isinstance(meta, dict) and meta.get("status") == "READY",
           "ILLUSTRATION_STAGING_NOT_READY")
    expected = {
        "staging_id": staging_id,
        "point_id": record["point_id"],
        "generation_key": record["generation_key"],
        "subject_id": record["subject_id"],
        "source_commit": source_commit,
        "identity_path": identity_path,
        "source_sha256": record["source_sha256"],
        "byte_count": record["original_bytes"],
        "width": record["original_width"],
        "height": record["original_height"],
        "mime_type": "image/png",
    }
    demand(all(meta.get(key) == value for key, value in expected.items()),
           "ILLUSTRATION_STAGING_IDENTITY_MISMATCH")
    demand(isinstance(meta.get("chunk_count"), int) and 1 <= meta["chunk_count"] <= 128,
           "ILLUSTRATION_STAGING_CHUNK_COUNT_INVALID")
    demand(isinstance(chunks, list) and len(chunks) == meta["chunk_count"],
           "ILLUSTRATION_STAGING_CHUNK_SET_INVALID")

    pieces = []
    for index, chunk in enumerate(chunks):
        demand(isinstance(chunk, dict)
               and chunk.get("chunk_index") == index
               and isinstance(chunk.get("chunk_b64"), str)
               and chunk["chunk_b64"],
               "ILLUSTRATION_STAGING_CHUNK_SET_INVALID")
        pieces.append(chunk["chunk_b64"])

    try:
        original = base64.b64decode("".join(pieces), validate=True)
    except Exception:
        raise ValueError("ILLUSTRATION_STAGING_BASE64_INVALID") from None

    demand(len(original) == record["original_bytes"], "ORIGINAL_BYTES_MISMATCH")
    demand(hashlib.sha256(original).hexdigest() == record["source_sha256"],
           "ORIGINAL_SHA256_MISMATCH")
    demand(original.startswith(b"\x89PNG\r\n\x1a\n"), "ORIGINAL_NOT_PNG")
    try:
        with Image.open(io.BytesIO(original)) as image:
            demand(image.format == "PNG", "ORIGINAL_NOT_PNG")
            width, height = image.size
            image.verify()
    except ValueError:
        raise
    except Exception:
        raise ValueError("ORIGINAL_PNG_INVALID") from None
    demand(width == record["original_width"] and height == record["original_height"],
           "ORIGINAL_DIMENSIONS_MISMATCH")
    return original, {
        "bytes": len(original),
        "width": width,
        "height": height,
        "sha256": hashlib.sha256(original).hexdigest(),
        "private_visibility": "SUPABASE_PRIVATE_STAGING",
    }


def process(args):
    identity_path = draft.identity_repo_path(args.identity)
    identity_relative = identity_path.relative_to(ROOT).as_posix()
    record, _, _, object_path = draft.validate_source(
        identity_path, args.source_commit, os.environ.get("GITHUB_SHA", "")
    )

    meta = rpc("archive_illustration_staging_meta", {"p_staging_id": args.staging_id})
    chunks = rpc("archive_illustration_staging_chunks", {"p_staging_id": args.staging_id})
    original, original_meta = decode_staged_original(
        meta, chunks, record, args.staging_id, args.source_commit, identity_relative
    )

    provider = handoff.storage_provider()
    bucket_status = provider.assert_private_bucket()
    upload = provider.upload_original(object_path, original, record["source_sha256"])
    registry = handoff.verify_register(identity_path)
    cleanup = rpc(
        "archive_illustration_staging_cleanup",
        {"p_staging_id": args.staging_id, "p_source_sha256": record["source_sha256"]},
    )
    demand(isinstance(cleanup, dict) and cleanup.get("deleted") == 1,
           "ILLUSTRATION_STAGING_CLEANUP_FAILED")

    return {
        "status": "PRIVATE_SUPABASE_STAGED_HANDOFF_PASS",
        "staging_id": args.staging_id,
        "source_commit": args.source_commit,
        "workflow_commit": os.environ.get("GITHUB_SHA"),
        "identity_path": identity_relative,
        "point_id": record["point_id"],
        "generation_key": record["generation_key"],
        "source_sha256": record["source_sha256"],
        "original": original_meta,
        "storage_provider": provider.provider_id,
        "storage_bucket": bucket_status["bucket"],
        "storage_object_path": provider.registry_object_path(object_path),
        "storage_upload": upload,
        "storage_readback_sha256": registry["storage_readback_sha256"],
        "registry_status": registry["status"],
        "registry_asset_id": registry["asset_id"],
        "registry_writes": registry["registry_writes"],
        "staging_cleanup": cleanup,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--staging-id", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--identity", required=True)
    args = parser.parse_args()
    return process(args)


if __name__ == "__main__":
    try:
        print(json.dumps(main(), separators=(",", ":")))
    except Exception as error:
        code = (
            str(error)
            if isinstance(error, ValueError)
            and str(error).isupper()
            and str(error).replace("_", "").isalnum()
            else "STAGED_ILLUSTRATION_HANDOFF_UNEXPECTED_ERROR"
        )
        print(json.dumps({"status": "STAGED_ILLUSTRATION_HANDOFF_REJECTED", "code": code}))
        raise SystemExit(1)
