"""Move one accepted illustration from a private GitHub Draft Release to Supabase.

This script is only used by the workflow_dispatch workflow on main. Draft
release assets are authenticated, short-lived staging inputs; the original is
validated before a single create-only upload to the private Storage bucket.
"""
import argparse
import hashlib
import io
import json
import os
import re
import subprocess
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from PIL import Image

import illustration_storage_handoff as handoff


ROOT = Path(__file__).resolve().parents[2]
REPOSITORY = "cetin072/survival-interactive-series"
VISUALS_PATH = "archive/content/visuals/C03-AFTERFALL/VISUALS.json"
LIMIT = 20 * 1024 * 1024
API = "https://api.github.com"
API_VERSION = "2022-11-28"


def demand(ok, code):
    if not ok:
        raise ValueError(code)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def identity_repo_path(value):
    demand(isinstance(value, str) and re.fullmatch(
        r"archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_[A-Z0-9_-]+\.json", value
    ) is not None, "IDENTITY_PATH_INVALID")
    path = (ROOT / value).resolve()
    demand(path.is_relative_to(ROOT) and path.is_file(), "IDENTITY_NOT_FOUND")
    return path


def git_bytes(*args):
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        raise ValueError("SOURCE_COMMIT_NOT_AVAILABLE") from None


def validate_source(identity_path, source_commit, workflow_commit):
    demand(re.fullmatch(r"[a-f0-9]{40}", source_commit or "") is not None,
           "SOURCE_COMMIT_INVALID")
    demand(re.fullmatch(r"[a-f0-9]{40}", workflow_commit or "") is not None,
           "WORKFLOW_COMMIT_INVALID")
    demand(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY
           and os.environ.get("GITHUB_REF") == "refs/heads/main",
           "TRUSTED_MAIN_WORKFLOW_REQUIRED")
    demand(git_bytes("merge-base", "--is-ancestor", source_commit, workflow_commit) is not None,
           "SOURCE_COMMIT_NOT_ON_WORKFLOW_HISTORY")
    relative = identity_path.relative_to(ROOT).as_posix()
    source_record = json.loads(git_bytes("show", f"{source_commit}:{relative}"))
    current_record = json.loads(identity_path.read_text(encoding="utf-8"))
    demand(source_record == current_record, "IDENTITY_SOURCE_COMMIT_MISMATCH")
    source_catalog = json.loads(git_bytes("show", f"{source_commit}:{VISUALS_PATH}"))
    current_catalog = json.loads((ROOT / VISUALS_PATH).read_text(encoding="utf-8"))
    demand(source_catalog.get("content_sha256") == current_catalog.get("content_sha256"),
           "CATALOG_CHANGED_SINCE_SOURCE_COMMIT")
    record, catalog, point, object_path = handoff.identity(identity_path)
    demand(record == source_record, "IDENTITY_SOURCE_COMMIT_MISMATCH")
    demand(isinstance(record.get("subject_id"), str)
           and re.fullmatch(r"(?:char|loc|event)-[a-z0-9]+(?:-[a-z0-9]+)*",
                            record["subject_id"]) is not None,
           "IDENTITY_SUBJECT_ID_INVALID")
    demand(re.fullmatch(r"[a-f0-9]{64}", record.get("source_sha256", "")) is not None,
           "IDENTITY_SOURCE_SHA_INVALID")
    demand(isinstance(record.get("original_bytes"), int)
           and not isinstance(record.get("original_bytes"), bool)
           and 0 < record["original_bytes"] <= LIMIT
           and isinstance(record.get("original_width"), int)
           and not isinstance(record.get("original_width"), bool) and record["original_width"] > 0
           and isinstance(record.get("original_height"), int)
           and not isinstance(record.get("original_height"), bool) and record["original_height"] > 0,
           "IDENTITY_ORIGINAL_METADATA_INVALID")
    return record, catalog, point, object_path


class GitHubApi:
    def __init__(self, token=None):
        self.token = token or os.environ.get("GITHUB_TOKEN", "")
        demand(len(self.token) >= 20, "GITHUB_TOKEN_REQUIRED")
        self.opener = build_opener()

    def request(self, path, method="GET", accept="application/vnd.github+json", body=None,
                max_bytes=2_000_000):
        url = f"{API}/repos/{REPOSITORY}/{path.lstrip('/')}"
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"Authorization": f"Bearer {self.token}", "Accept": accept,
                   "X-GitHub-Api-Version": API_VERSION, "User-Agent": "afterfall-private-image-handoff"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = Request(url, data=data, method=method, headers=headers)
        try:
            with self.opener.open(request, timeout=45) as response:
                content = response.read(max_bytes + 1)
                demand(len(content) <= max_bytes, "GITHUB_RESPONSE_TOO_LARGE")
                return response.status, response.geturl(), content
        except HTTPError as error:
            raise ValueError(f"GITHUB_API_HTTP_{error.code}") from None
        except URLError:
            raise ValueError("GITHUB_API_NETWORK_ERROR") from None

    def json(self, path, method="GET", body=None):
        status, _, content = self.request(path, method=method, body=body)
        if status == 204 or not content:
            return None
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            raise ValueError("GITHUB_API_JSON_INVALID") from None

    def release(self, release_id):
        demand(re.fullmatch(r"[0-9]{1,20}", str(release_id or "")) is not None,
               "DRAFT_RELEASE_ID_INVALID")
        value = self.json(f"releases/{release_id}")
        demand(isinstance(value, dict) and value.get("id") == int(release_id),
               "DRAFT_RELEASE_ID_MISMATCH")
        return value

    def tag_commit(self, tag_name):
        path = f"git/ref/tags/{quote(tag_name, safe='-._')}"
        value = self.json(path)
        demand(isinstance(value, dict) and value.get("ref") == f"refs/tags/{tag_name}",
               "DRAFT_RELEASE_TAG_NOT_FOUND")
        obj = value.get("object", {})
        for _ in range(4):
            if obj.get("type") == "commit":
                return obj.get("sha")
            demand(obj.get("type") == "tag" and re.fullmatch(r"[a-f0-9]{40}", obj.get("sha", ""))
                   is not None, "DRAFT_RELEASE_TAG_TARGET_INVALID")
            value = self.json(f"git/tags/{obj['sha']}")
            obj = value.get("object", {})
        raise ValueError("DRAFT_RELEASE_TAG_CHAIN_TOO_DEEP")

    def asset_bytes(self, asset_id):
        demand(isinstance(asset_id, int) and asset_id > 0, "DRAFT_RELEASE_ASSET_ID_INVALID")
        status, final_url, content = self.request(
            f"releases/assets/{asset_id}", accept="application/octet-stream", max_bytes=LIMIT
        )
        host = urlparse(final_url).hostname or ""
        demand(status in (200, 206) and (host == "api.github.com"
               or host.endswith(".githubusercontent.com") or host == "github.com"),
               "DRAFT_RELEASE_ASSET_DOWNLOAD_INVALID")
        return content

    def assert_asset_private(self, browser_download_url):
        parsed = urlparse(browser_download_url)
        demand(parsed.scheme == "https" and parsed.hostname == "github.com",
               "DRAFT_RELEASE_ASSET_URL_INVALID")
        # Follow GitHub's redirect anonymously. A successful byte response would
        # mean this supposedly private draft asset is publicly downloadable.
        request = Request(browser_download_url, headers={"Range": "bytes=0-0",
                                                          "User-Agent": "afterfall-private-image-handoff"})
        try:
            with build_opener().open(request, timeout=30) as response:
                raise ValueError("DRAFT_RELEASE_ASSET_PUBLIC")
        except HTTPError as error:
            if error.code in (401, 403, 404):
                return {"status": "ANONYMOUS_DOWNLOAD_DENIED", "http_status": error.code}
            raise ValueError("DRAFT_RELEASE_ASSET_PRIVACY_UNVERIFIED") from None
        except URLError:
            raise ValueError("DRAFT_RELEASE_ASSET_PRIVACY_UNVERIFIED") from None


def expected_release_tag(record, source_commit):
    demand(isinstance(record.get("subject_id"), str)
           and re.fullmatch(r"(?:char|loc|event)-[a-z0-9]+(?:-[a-z0-9]+)*",
                            record["subject_id"]) is not None,
           "IDENTITY_SUBJECT_ID_INVALID")
    demand(re.fullmatch(r"[a-f0-9]{40}", source_commit or "") is not None,
           "SOURCE_COMMIT_INVALID")
    demand(re.fullmatch(r"[a-f0-9]{64}", record.get("source_sha256", "")) is not None,
           "IDENTITY_SOURCE_SHA_INVALID")
    return (f"codex-private-image-{record['subject_id']}-"
            f"{source_commit[:12]}-{record['source_sha256'][:12]}")


def expected_asset_name(record):
    return f"afterfall-original-{record['subject_id']}-{record['source_sha256']}.png"


def validate_release(api, release_id, record, source_commit, set_cleanup_output=False):
    release = api.release(release_id)
    tag = expected_release_tag(record, source_commit)
    demand(release.get("draft") is True and release.get("prerelease") is False,
           "DRAFT_RELEASE_REQUIRED")
    demand(release.get("tag_name") == tag, "DRAFT_RELEASE_TAG_MISMATCH")
    demand(api.tag_commit(tag) == source_commit, "DRAFT_RELEASE_SOURCE_COMMIT_MISMATCH")
    if set_cleanup_output:
        output = os.environ.get("GITHUB_OUTPUT")
        if output:
            with open(output, "a", encoding="utf-8") as handle:
                handle.write(f"cleanup_ready=true\nrelease_id={int(release_id)}\ntag_name={tag}\n")
    return release, tag


def validate_asset(api, release, record):
    assets = release.get("assets")
    demand(isinstance(assets, list) and len(assets) == 1, "DRAFT_RELEASE_ASSET_COUNT_INVALID")
    asset = assets[0]
    demand(asset.get("name") == expected_asset_name(record)
           and asset.get("state") == "uploaded"
           and asset.get("content_type") == "image/png"
           and asset.get("size") == record["original_bytes"],
           "DRAFT_RELEASE_ASSET_METADATA_MISMATCH")
    privacy = api.assert_asset_private(asset.get("browser_download_url", ""))
    original = api.asset_bytes(asset.get("id"))
    demand(len(original) == record["original_bytes"], "ORIGINAL_BYTES_MISMATCH")
    demand(sha256(original) == record["source_sha256"], "ORIGINAL_SHA256_MISMATCH")
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
    return original, {"bytes": len(original), "width": width, "height": height,
                      "sha256": sha256(original), "private_visibility": privacy["status"]}


def prepare(args):
    identity_path = identity_repo_path(args.identity)
    source_commit = args.source_commit
    workflow_commit = os.environ.get("GITHUB_SHA", "")
    record, _, _, _ = validate_source(identity_path, source_commit, workflow_commit)
    api = GitHubApi()
    release, tag = validate_release(api, args.release_id, record, source_commit,
                                    set_cleanup_output=True)
    return {"status": "DRAFT_RELEASE_SOURCE_VERIFIED", "release_id": release["id"],
            "release_tag": tag, "source_commit": source_commit,
            "identity_path": identity_path.relative_to(ROOT).as_posix(),
            "point_id": record["point_id"], "generation_key": record["generation_key"],
            "source_sha256": record["source_sha256"]}


def process(args):
    identity_path = identity_repo_path(args.identity)
    record, _, _, object_path = validate_source(
        identity_path, args.source_commit, os.environ.get("GITHUB_SHA", ""))
    api = GitHubApi()
    release, tag = validate_release(api, args.release_id, record, args.source_commit)
    provider = handoff.storage_provider()
    bucket_status = provider.assert_private_bucket()
    original, original_meta = validate_asset(api, release, record)
    upload = provider.upload_original(object_path, original, record["source_sha256"])
    result = handoff.verify_register(identity_path)
    return {"status": "PRIVATE_DRAFT_RELEASE_HANDOFF_PASS",
            "release_id": release["id"], "release_tag": tag,
            "source_commit": args.source_commit,
            "workflow_commit": os.environ.get("GITHUB_SHA"),
            "identity_path": identity_path.relative_to(ROOT).as_posix(),
            "point_id": record["point_id"], "generation_key": record["generation_key"],
            "source_sha256": record["source_sha256"], "original": original_meta,
            "storage_provider": provider.provider_id, "storage_bucket": bucket_status["bucket"],
            "storage_object_path": provider.registry_object_path(object_path),
            "storage_upload": upload, "storage_readback_sha256": result["storage_readback_sha256"],
            "registry_status": result["status"], "registry_asset_id": result["asset_id"],
            "registry_writes": result["registry_writes"]}


def cleanup(args):
    identity_path = identity_repo_path(args.identity)
    source_record = json.loads(git_bytes("show", f"{args.source_commit}:{identity_path.relative_to(ROOT).as_posix()}"))
    tag = expected_release_tag(source_record, args.source_commit)
    demand(args.tag_name == tag, "CLEANUP_TAG_MISMATCH")
    api = GitHubApi()
    release = api.release(args.release_id)
    demand(release.get("tag_name") == tag, "CLEANUP_RELEASE_MISMATCH")
    demand(release.get("draft") is True, "CLEANUP_DRAFT_RELEASE_REQUIRED")
    demand(release.get("id") == int(args.release_id), "CLEANUP_RELEASE_ID_MISMATCH")
    demand(api.tag_commit(tag) == args.source_commit, "CLEANUP_SOURCE_COMMIT_MISMATCH")
    status, _, _ = api.request(f"releases/{args.release_id}", method="DELETE")
    demand(status in (200, 202, 204), "DRAFT_RELEASE_CLEANUP_FAILED")
    try:
        status, _, _ = api.request(f"git/refs/tags/{quote(tag, safe='-._')}", method="DELETE")
        demand(status in (200, 202, 204), "DRAFT_RELEASE_TAG_CLEANUP_FAILED")
    except ValueError as error:
        if str(error) != "GITHUB_API_HTTP_404":
            raise
    return {"status": "DRAFT_RELEASE_CLEANUP_PASS", "release_id": int(args.release_id),
            "tag_name": tag}


def main():
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--prepare", action="store_true")
    modes.add_argument("--process", action="store_true")
    modes.add_argument("--cleanup", action="store_true")
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--identity", required=True)
    parser.add_argument("--tag-name")
    args = parser.parse_args()
    if args.prepare:
        return prepare(args)
    if args.process:
        return process(args)
    demand(args.tag_name, "CLEANUP_TAG_REQUIRED")
    return cleanup(args)


if __name__ == "__main__":
    try:
        print(json.dumps(main(), separators=(",", ":")))
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and str(error).isupper() \
            and str(error).replace("_", "").isalnum() else "DRAFT_RELEASE_HANDOFF_UNEXPECTED_ERROR"
        print(json.dumps({"status": "DRAFT_RELEASE_HANDOFF_REJECTED", "code": code}))
        raise SystemExit(1)
