"""30-day private vault for every Automation B render.

The Reviewer first copies the generated PNG into the existing private review
staging. This program moves that exact immutable PNG into a separate private
Storage bucket. PASS images continue through the permanent original pipeline;
REJECT/HUMAN_REVIEW images live only in this vault until retention cleanup.
"""
import argparse
import base64
import hashlib
import io
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, build_opener

from PIL import Image

from original_storage_provider import (
    DEFAULT_SUPABASE_URL,
    build_original_storage_provider,
)

BUCKET = "survival-illustration-vault"
LIMIT = 20 * 1024 * 1024
OPENER = build_opener()


def demand(ok, code):
    if not ok:
        raise ValueError(code)


def credentials():
    url = (os.environ.get("ARCHIVE_SUPABASE_URL", "") or "").rstrip("/")
    key = os.environ.get("ARCHIVE_SUPABASE_SERVICE_ROLE_KEY", "")
    demand(url == DEFAULT_SUPABASE_URL and len(key) >= 20, "VAULT_CREDENTIALS_REQUIRED")
    return url, key


def rpc(name, payload, max_bytes=8_000_000):
    url, key = credentials()
    request = Request(
        f"{url}/rest/v1/rpc/{name}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Content-Profile": "public",
        },
    )
    try:
        with OPENER.open(request, timeout=45) as response:
            body = response.read(max_bytes + 1)
            demand(len(body) <= max_bytes, "VAULT_RPC_RESPONSE_TOO_LARGE")
            return json.loads(body) if body else None
    except HTTPError as error:
        detail = error.read(4001).decode("utf-8", errors="replace")
        raise ValueError(f"VAULT_RPC_HTTP_{error.code}:{detail[:4000]}") from None
    except URLError:
        raise ValueError("VAULT_RPC_NETWORK_ERROR") from None
    except json.JSONDecodeError:
        raise ValueError("VAULT_RPC_JSON_INVALID") from None


def provider():
    env = dict(os.environ)
    env["ARCHIVE_ORIGINAL_STORAGE_PROVIDER"] = "supabase"
    env["ARCHIVE_ORIGINAL_STORAGE_BUCKET"] = BUCKET
    return build_original_storage_provider(OPENER, LIMIT, env=env)


def read_staged_bytes(job):
    staging_id = job["review_staging_id"]
    meta = rpc("archive_illustration_review_staging_meta", {"p_staging_id": staging_id})
    chunks = rpc("archive_illustration_review_staging_chunks", {"p_staging_id": staging_id})

    demand(isinstance(meta, dict) and meta.get("status") == "READY", "VAULT_STAGING_NOT_READY")
    demand(meta.get("job_id") == job["job_id"], "VAULT_STAGING_JOB_MISMATCH")
    demand(meta.get("source_sha256") == job["source_sha256"], "VAULT_STAGING_SHA_MISMATCH")
    demand(meta.get("byte_count") == job["output_bytes"], "VAULT_STAGING_BYTES_MISMATCH")
    demand(meta.get("width") == job["output_width"] and meta.get("height") == job["output_height"],
           "VAULT_STAGING_DIMENSIONS_MISMATCH")
    demand(meta.get("provider_asset_id") == job["provider_asset_id"], "VAULT_STAGING_ASSET_MISMATCH")
    demand(isinstance(chunks, list) and len(chunks) == meta.get("chunk_count"), "VAULT_CHUNKS_INVALID")

    pieces = []
    for index, chunk in enumerate(chunks):
        demand(isinstance(chunk, dict) and chunk.get("chunk_index") == index
               and isinstance(chunk.get("chunk_b64"), str), "VAULT_CHUNKS_INVALID")
        pieces.append(chunk["chunk_b64"])

    try:
        raw = base64.b64decode("".join(pieces), validate=True)
    except Exception:
        raise ValueError("VAULT_BASE64_INVALID") from None

    demand(0 < len(raw) <= LIMIT and len(raw) == job["output_bytes"], "VAULT_BYTES_INVALID")
    demand(hashlib.sha256(raw).hexdigest() == job["source_sha256"], "VAULT_SHA_MISMATCH")
    demand(raw.startswith(b"\x89PNG\r\n\x1a\n"), "VAULT_NOT_PNG")
    try:
        with Image.open(io.BytesIO(raw)) as image:
            demand(image.format == "PNG", "VAULT_NOT_PNG")
            width, height = image.size
            image.verify()
    except ValueError:
        raise
    except Exception:
        raise ValueError("VAULT_PNG_INVALID") from None
    demand(width == job["output_width"] and height == job["output_height"],
           "VAULT_DIMENSIONS_MISMATCH")
    return raw


def archive(job_id):
    job = rpc("archive_illustration_vault_job", {"p_job_id": job_id})
    demand(isinstance(job, dict), "VAULT_JOB_NOT_FOUND")
    if job.get("vault_status") == "STORED":
        return {"status": "NOOP_ALREADY_STORED", "job_id": job_id, "object_path": job["object_path"]}

    raw = read_staged_bytes(job)
    store = provider()
    bucket = store.assert_private_bucket()
    upload = store.upload_original(job["object_path"], raw, job["source_sha256"])
    readback = store.readback(job["object_path"])
    demand(readback is not None and hashlib.sha256(readback).hexdigest() == job["source_sha256"],
           "VAULT_READBACK_MISMATCH")

    stored = rpc("archive_illustration_vault_mark_stored", {
        "p_job_id": job_id,
        "p_object_path": job["object_path"],
        "p_source_sha256": job["source_sha256"],
    })
    demand(isinstance(stored, dict) and stored.get("status") == "STORED", "VAULT_MARK_STORED_FAILED")

    # Safe for every decision. REJECT/HUMAN_REVIEW clean immediately after the
    # vault store. PASS cleans only when the permanent Finalizer has reached
    # SUCCEEDED; otherwise it intentionally returns deleted=0 and Finalizer
    # repeats the same cleanup after permanent publication.
    staging_cleanup = rpc("archive_illustration_vault_cleanup_review_staging", {
        "p_job_id": job_id,
        "p_source_sha256": job["source_sha256"],
    })

    return {
        "status": "ILLUSTRATION_VAULT_STORED",
        "job_id": job_id,
        "review_decision": job.get("review_decision"),
        "storage_bucket": bucket["bucket"],
        "object_path": job["object_path"],
        "source_sha256": job["source_sha256"],
        "bytes": len(raw),
        "upload": upload,
        "expires_at": stored.get("expires_at"),
        "review_staging_cleanup": staging_cleanup,
    }


def delete_storage_object(path):
    url, key = credentials()
    request = Request(
        f"{url}/storage/v1/object/{quote(BUCKET, safe='')}",
        data=json.dumps({"prefixes": [path]}).encode("utf-8"),
        method="DELETE",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with OPENER.open(request, timeout=45) as response:
            demand(response.status in (200, 204), "VAULT_DELETE_FAILED")
    except HTTPError as error:
        detail = error.read(2001).decode("utf-8", errors="replace")
        raise ValueError(f"VAULT_DELETE_HTTP_{error.code}:{detail[:2000]}") from None
    except URLError:
        raise ValueError("VAULT_DELETE_NETWORK_ERROR") from None


def cleanup(limit=50):
    rows = rpc("archive_illustration_vault_expired", {"p_limit": limit})
    demand(isinstance(rows, list), "VAULT_EXPIRED_LIST_INVALID")
    deleted = []
    for item in rows:
        try:
            delete_storage_object(item["object_path"])
            marked = rpc("archive_illustration_vault_mark_deleted", {
                "p_job_id": item["job_id"],
                "p_source_sha256": item["source_sha256"],
            })
            demand(isinstance(marked, dict) and marked.get("deleted") == 1,
                   "VAULT_MARK_DELETED_FAILED")
            deleted.append(item["job_id"])
        except Exception as error:
            rpc("archive_illustration_vault_mark_error", {
                "p_job_id": item["job_id"],
                "p_error_code": str(error).split(":", 1)[0][:180],
            })
    return {"status": "ILLUSTRATION_VAULT_CLEANUP", "expired": len(rows), "deleted": deleted}


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    archive_parser = sub.add_parser("archive")
    archive_parser.add_argument("--job-id", required=True)
    cleanup_parser = sub.add_parser("cleanup")
    cleanup_parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()

    if args.command == "archive":
        try:
            return archive(args.job_id)
        except Exception as error:
            try:
                rpc("archive_illustration_vault_mark_error", {
                    "p_job_id": args.job_id,
                    "p_error_code": str(error).split(":", 1)[0][:180],
                })
            except Exception:
                pass
            raise
    return cleanup(args.limit)


if __name__ == "__main__":
    try:
        print(json.dumps(main(), ensure_ascii=False, separators=(",", ":")))
    except Exception as error:
        code = str(error).split(":", 1)[0] if isinstance(error, ValueError) else "VAULT_UNEXPECTED_ERROR"
        print(json.dumps({"status": "ILLUSTRATION_VAULT_FAILED", "code": code}))
        raise SystemExit(1)
