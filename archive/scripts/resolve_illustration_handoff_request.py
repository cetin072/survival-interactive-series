"""Resolve one trusted illustration handoff request.

Supports either a checked-in immutable request JSON (for push-triggered automation)
or explicit workflow_dispatch values. It performs strict validation only; secrets
and external calls stay in the trusted handoff workflow.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REQUEST_VERSION = "illustration-handoff-request-v1"
IDENTITY_RE = re.compile(
    r"archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_[A-Z0-9_-]+\.json"
)
SHA_RE = re.compile(r"[a-f0-9]{40}")


def demand(ok, code):
    if not ok:
        raise ValueError(code)


def normalized(release_id, source_commit, identity_path):
    release_text = str(release_id or "")
    demand(re.fullmatch(r"[0-9]{1,20}", release_text) is not None,
           "HANDOFF_REQUEST_RELEASE_ID_INVALID")
    demand(SHA_RE.fullmatch(source_commit or "") is not None,
           "HANDOFF_REQUEST_SOURCE_COMMIT_INVALID")
    demand(IDENTITY_RE.fullmatch(identity_path or "") is not None,
           "HANDOFF_REQUEST_IDENTITY_PATH_INVALID")
    path = (ROOT / identity_path).resolve()
    demand(path.is_relative_to(ROOT) and path.is_file(),
           "HANDOFF_REQUEST_IDENTITY_NOT_FOUND")
    return {
        "release_id": release_text,
        "source_commit": source_commit,
        "identity_path": identity_path,
    }


def from_request(path):
    request_path = Path(path).resolve()
    demand(request_path.is_relative_to(ROOT), "HANDOFF_REQUEST_PATH_INVALID")
    relative = request_path.relative_to(ROOT).as_posix()
    demand(re.fullmatch(
        r"archive/automation/illustration-handoff-requests/[a-z0-9][a-z0-9._-]*\.json",
        relative,
    ) is not None, "HANDOFF_REQUEST_PATH_INVALID")
    demand(request_path.is_file(), "HANDOFF_REQUEST_NOT_FOUND")
    value = json.loads(request_path.read_text(encoding="utf-8"))
    demand(isinstance(value, dict) and set(value) == {
        "version", "release_id", "source_commit", "identity_path"
    }, "HANDOFF_REQUEST_SHAPE_INVALID")
    demand(value.get("version") == REQUEST_VERSION, "HANDOFF_REQUEST_VERSION_INVALID")
    result = normalized(
        value.get("release_id"),
        value.get("source_commit"),
        value.get("identity_path"),
    )
    result["request_path"] = relative
    result["request_version"] = REQUEST_VERSION
    return result


def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--request")
    source.add_argument("--dispatch", action="store_true")
    parser.add_argument("--release-id")
    parser.add_argument("--source-commit")
    parser.add_argument("--identity")
    args = parser.parse_args()
    if args.request:
        return from_request(args.request)
    demand(args.release_id and args.source_commit and args.identity,
           "HANDOFF_DISPATCH_INPUTS_REQUIRED")
    result = normalized(args.release_id, args.source_commit, args.identity)
    result["request_path"] = None
    result["request_version"] = "workflow-dispatch"
    return result


if __name__ == "__main__":
    try:
        print(json.dumps(main(), separators=(",", ":")))
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and str(error).isupper() \
            and str(error).replace("_", "").isalnum() else "HANDOFF_REQUEST_UNEXPECTED_ERROR"
        print(json.dumps({"status": "HANDOFF_REQUEST_REJECTED", "code": code}))
        raise SystemExit(1)
