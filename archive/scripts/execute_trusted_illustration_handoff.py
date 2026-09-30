"""Execute one trusted illustration handoff from a validated request file."""
import argparse
import json
from pathlib import Path
from types import SimpleNamespace

import draft_release_illustration_handoff as draft
import staged_illustration_handoff as staged
import resolve_illustration_handoff_request as resolver


def execute(request_path):
    request = resolver.from_request(Path(request_path))

    if request["request_version"] == resolver.STAGED_REQUEST_VERSION:
        args = SimpleNamespace(
            staging_id=request["staging_id"],
            source_commit=request["source_commit"],
            identity=request["identity_path"],
        )
        processed = staged.process(args)
        return {
            "status": "TRUSTED_ILLUSTRATION_HANDOFF_COMPLETE",
            "transport": "SUPABASE_PRIVATE_STAGING",
            "request": request,
            "processed": processed,
            "cleanup": processed.get("staging_cleanup"),
        }

    args = SimpleNamespace(
        release_id=request["release_id"],
        source_commit=request["source_commit"],
        identity=request["identity_path"],
        tag_name=None,
    )
    prepared = draft.prepare(args)
    processed = draft.process(args)
    cleanup_args = SimpleNamespace(
        release_id=request["release_id"],
        source_commit=request["source_commit"],
        identity=request["identity_path"],
        tag_name=prepared["release_tag"],
    )
    cleaned = draft.cleanup(cleanup_args)
    return {
        "status": "TRUSTED_ILLUSTRATION_HANDOFF_COMPLETE",
        "transport": "GITHUB_DRAFT_RELEASE",
        "request": request,
        "prepared": prepared,
        "processed": processed,
        "cleanup": cleaned,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    args = parser.parse_args()
    return execute(args.request)


if __name__ == "__main__":
    try:
        print(json.dumps(main(), separators=(",", ":")))
    except Exception as error:
        code = (
            str(error)
            if isinstance(error, ValueError)
            and str(error).isupper()
            and str(error).replace("_", "").isalnum()
            else "TRUSTED_ILLUSTRATION_HANDOFF_UNEXPECTED_ERROR"
        )
        print(json.dumps({"status": "TRUSTED_ILLUSTRATION_HANDOFF_REJECTED", "code": code}))
        raise SystemExit(1)
