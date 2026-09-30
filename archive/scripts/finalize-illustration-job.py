"""Programmatic post-review finalizer for AFTERFALL Automation B."""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from contextlib import suppress
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
REPO = "cetin072/survival-interactive-series"
REQUEST_ROOT = ROOT / "archive/automation/illustration-handoff-requests"
DERIVATIVE_REQUEST_ROOT = ROOT / "archive/automation/site-derivative-requests"
SITE_ASSETS = ROOT / "archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json"
SAFE_JOB = re.compile(r"^[a-z0-9][a-z0-9-]{7,119}$")


def fail(code):
    raise ValueError(code)


def run(*args, check=True, capture=True):
    proc = subprocess.run(
        args,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        env=os.environ,
    )
    if check and proc.returncode != 0:
        detail = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()[-4000:]
        raise ValueError(f"COMMAND_FAILED:{args[0]}:{detail}")
    return (proc.stdout or "").strip()


def gh_json(*args):
    out = run("gh", *args)
    return json.loads(out) if out else None


def rpc(name, payload):
    base = os.environ.get("ARCHIVE_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("ARCHIVE_SUPABASE_SERVICE_ROLE_KEY", "")
    if base != "https://jgsxpdflgkqroecfjzxq.supabase.co" or len(key) < 20:
        fail("FINALIZER_SUPABASE_CREDENTIALS_REQUIRED")
    request = Request(
        f"{base}/rest/v1/rpc/{name}",
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
        with urlopen(request, timeout=45) as response:
            body = response.read(2_000_001)
    except HTTPError as error:
        detail = error.read(4001).decode("utf-8", errors="replace")
        raise ValueError(f"FINALIZER_RPC_HTTP_{error.code}:{detail[:4000]}") from None
    except URLError:
        fail("FINALIZER_RPC_NETWORK_ERROR")
    return json.loads(body) if body else None


HEARTBEAT_INTERVAL_SECONDS = 30


def heartbeat():
    global LEASE_LOST, LAST_HEARTBEAT
    if not CURRENT_JOB or not LEASE_TOKEN:
        LEASE_LOST = True
        fail("FINALIZER_LEASE_LOST")
    try:
        result = rpc("archive_illustration_render_job_lease_heartbeat", {
            "p_job_id": CURRENT_JOB["job_id"],
            "p_lease_token": LEASE_TOKEN,
            "p_lease_seconds": 7200,
        })
    except Exception:
        LEASE_LOST = True
        fail("FINALIZER_LEASE_LOST")
    if not isinstance(result, dict) or result.get("status") != "LEASE_RENEWED":
        LEASE_LOST = True
        fail("FINALIZER_LEASE_LOST")
    LAST_HEARTBEAT = time.monotonic()


def heartbeat_if_due():
    if time.monotonic() - LAST_HEARTBEAT >= HEARTBEAT_INTERVAL_SECONDS:
        heartbeat()


def run_with_heartbeat(args, *, capture=True, check=True):
    """Poll a long-running command while renewing the lease; terminate on lease loss."""
    output_file = tempfile.TemporaryFile(mode="w+t") if capture else None
    proc = subprocess.Popen(
        args, cwd=ROOT, text=True,
        stdout=output_file,
        stderr=subprocess.STDOUT if capture else None,
        env=os.environ,
    )
    heartbeat()
    last_heartbeat = time.monotonic()
    try:
        while proc.poll() is None:
            if time.monotonic() - last_heartbeat >= HEARTBEAT_INTERVAL_SECONDS:
                try:
                    heartbeat()
                except Exception:
                    proc.kill()
                    proc.wait()
                    fail("FINALIZER_LEASE_LOST")
                last_heartbeat = time.monotonic()
                globals()["LAST_HEARTBEAT"] = last_heartbeat
            time.sleep(1)
        if output_file:
            output_file.seek(0)
        output = (output_file.read() if output_file else "") or ""
        if check and proc.returncode != 0:
            fail(f"COMMAND_FAILED:{args[0]}:{output.strip()[-4000:]}")
        return proc.returncode, output.strip()
    finally:
        if proc.poll() is None:
            proc.kill()
            with suppress(Exception):
                proc.wait()
        if output_file:
            output_file.close()


def checkout_main():
    run("git", "fetch", "origin", "main")
    run("git", "checkout", "-B", "main", "origin/main")


def main_has(path):
    proc = subprocess.run(
        ["git", "cat-file", "-e", f"origin/main:{path}"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return proc.returncode == 0


def commit_for_path(path):
    sha = run("git", "log", "-1", "--format=%H", "origin/main", "--", path)
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        fail("FINALIZER_PATH_COMMIT_NOT_FOUND")
    return sha


def find_open_pr(branch):
    prs = gh_json(
        "pr", "list", "--repo", REPO, "--head", branch, "--state", "open",
        "--json", "number,headRefOid",
    ) or []
    return prs[0] if prs else None


def wait_pr_and_merge(number):
    run_with_heartbeat(["gh", "pr", "checks", str(number), "--repo", REPO, "--watch",
        "--fail-fast", "--interval", "10"], capture=False)
    for _ in range(20):
        heartbeat()
        view = gh_json(
            "pr", "view", str(number), "--repo", REPO,
            "--json", "state,mergeable,headRefOid,mergeCommit",
        )
        if view["state"] == "MERGED":
            return view["mergeCommit"]["oid"]
        if view["state"] != "OPEN":
            fail("FINALIZER_PR_NOT_OPEN")
        if view["mergeable"] == "MERGEABLE":
            heartbeat()
            result = gh_json(
                "api", "--method", "PUT", f"repos/{REPO}/pulls/{number}/merge",
                "-f", "merge_method=squash", "-f", f"sha={view['headRefOid']}",
            )
            if result.get("merged") is not True or not re.fullmatch(r"[a-f0-9]{40}", result.get("sha", "")):
                fail("FINALIZER_PR_MERGE_FAILED")
            return result["sha"]
        if view["mergeable"] == "CONFLICTING":
            fail("FINALIZER_PR_CONFLICT")
        time.sleep(3)
    fail("FINALIZER_PR_MERGEABILITY_TIMEOUT")


def ensure_json_request(path, payload, branch, title, body):
    heartbeat()
    checkout_main()
    if main_has(path):
        return commit_for_path(path)

    existing = find_open_pr(branch)
    if existing:
        return wait_pr_and_merge(existing["number"])

    run("git", "checkout", "-B", branch, "origin/main")
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    run("git", "add", path)
    changed = run("git", "diff", "--cached", "--name-only").splitlines()
    if changed != [path]:
        fail("FINALIZER_REQUEST_DIFF_INVALID")
    run("git", "config", "user.name", "archive-illustration-bot")
    run("git", "config", "user.email", "archive-illustration-bot@users.noreply.github.com")
    run("git", "commit", "-m", title)
    heartbeat()
    run("git", "push", "--force-with-lease", "origin", f"HEAD:{branch}")
    heartbeat()
    created = run(
        "gh", "pr", "create", "--repo", REPO, "--base", "main", "--head", branch,
        "--title", title, "--body", body,
    )
    match = re.search(r"/pull/(\d+)", created)
    if not match:
        fail("FINALIZER_PR_CREATE_FAILED")
    return wait_pr_and_merge(int(match.group(1)))


def identity_path_for_subject(subject_id):
    suffix = re.sub(r"^(char|loc|event)-", "", subject_id)
    suffix = re.sub(r"[^a-z0-9]+", "_", suffix).strip("_").upper()
    if not suffix:
        fail("FINALIZER_IDENTITY_SUBJECT_INVALID")
    return f"archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_{suffix}.json"


def identity_payload(job):
    required = (
        "subject_id", "point_id", "generation_key", "main_sha", "output_sha256",
        "output_bytes", "output_width", "output_height", "attempt_no",
        "provider_asset_id", "prompt_sha256", "review_provider",
    )
    for key in required:
        if job.get(key) in (None, ""):
            fail("FINALIZER_IDENTITY_JOB_INCOMPLETE")
    return {
        "version": "illustration-e2e-identity-v1",
        "subject_id": job["subject_id"],
        "point_id": job["point_id"],
        "generation_key": job["generation_key"],
        "catalog_ref": job["main_sha"],
        "provider": "image_gen.imagegen",
        "provider_model": None,
        "tool": "image_gen.imagegen",
        "surface": "CHATGPT_SCHEDULED_IMAGEGEN_QUEUE",
        "tool_result_id": job["provider_asset_id"],
        "source_sha256": job["output_sha256"],
        "original_bytes": job["output_bytes"],
        "original_width": job["output_width"],
        "original_height": job["output_height"],
        "content_review": "MATCHES_INTENDED_BRIEF",
        "review_summary": job.get("review_summary"),
        "generation_attempts": job["attempt_no"],
        "accepted_image_count": 1,
        "paid_api_calls": 0,
        "unattended_generation_proven": True,
        "prompt_sha256": job["prompt_sha256"],
        "review_provider": job["review_provider"],
        "render_queue_job_id": job["job_id"],
    }


def ensure_identity(job):
    path = identity_path_for_subject(job["subject_id"])
    payload = identity_payload(job)
    checkout_main()

    if main_has(path):
        observed = json.loads(run("git", "show", f"origin/main:{path}"))
        if observed != payload:
            fail("FINALIZER_IDENTITY_EXISTING_CONFLICT")
        return path, commit_for_path(path)

    branch = f"automation/finalize-identity-{job['job_id']}"
    merge_sha = ensure_json_request(
        path,
        payload,
        branch,
        f"archive: accept {job['subject_id']} illustration",
        "Accepted illustration identity generated by Automation B after the independent visual review gate.",
    )
    return path, merge_sha


def wait_workflow(workflow, commit_sha, retry_storage_network=False):
    run_id = None
    for _ in range(60):
        heartbeat_if_due()
        runs = gh_json(
            "run", "list", "--repo", REPO, "--workflow", workflow,
            "--commit", commit_sha, "--limit", "10",
            "--json", "databaseId,status,conclusion,headSha",
        ) or []
        match = next((item for item in runs if item.get("headSha") == commit_sha), None)
        if match:
            run_id = match["databaseId"]
            break
        time.sleep(3)
    if run_id is None:
        fail("FINALIZER_WORKFLOW_NOT_TRIGGERED")

    watched_code, watched_output = run_with_heartbeat(
        ["gh", "run", "watch", str(run_id), "--repo", REPO, "--exit-status"],
        capture=True, check=False,
    )
    if watched_code == 0:
        return run_id

    if retry_storage_network:
        logs = run("gh", "run", "view", str(run_id), "--repo", REPO, "--log-failed", check=False)
        if "STORAGE_NETWORK_ERROR" in logs or "STORAGE_UPLOAD_OUTCOME_UNKNOWN" in logs:
            heartbeat()
            run("gh", "run", "rerun", str(run_id), "--repo", REPO, "--failed")
            retry_code, _ = run_with_heartbeat(
                ["gh", "run", "watch", str(run_id), "--repo", REPO, "--exit-status"],
                capture=True, check=False,
            )
            if retry_code == 0:
                return run_id
    raise ValueError(f"FINALIZER_WORKFLOW_FAILED:{workflow}:{watched_output[-3000:]}")


def verify_storage_registry(identity_path, expected_sha):
    sys.path.insert(0, str(ROOT / "archive/scripts"))
    import illustration_storage_handoff as handoff

    identity = ROOT / identity_path
    record, _, _, object_path = handoff.identity(identity, allow_published=True)
    if record["source_sha256"] != expected_sha:
        fail("FINALIZER_IDENTITY_SHA_MISMATCH")
    source = handoff.storage_provider().readback(object_path)
    if source is None or hashlib.sha256(source).hexdigest() != expected_sha:
        fail("FINALIZER_STORAGE_READBACK_MISMATCH")
    diagnostic = handoff.diagnose_registry(identity)
    if diagnostic.get("status") != "REGISTRY_READBACK_DIAGNOSTIC_PASS":
        fail("FINALIZER_REGISTRY_READBACK_FAILED")
    return diagnostic


def site_asset(job):
    manifest = json.loads(SITE_ASSETS.read_text(encoding="utf-8"))
    matches = [
        asset for asset in manifest.get("assets", [])
        if asset.get("point_id") == job["point_id"]
        or asset.get("generation_key") == job["generation_key"]
        or asset.get("subject_id") == job["subject_id"]
    ]
    if not matches:
        return None
    if len(matches) != 1:
        fail("FINALIZER_SITE_ASSET_DUPLICATE")
    asset = matches[0]
    if (asset.get("point_id") != job["point_id"]
        or asset.get("generation_key") != job["generation_key"]
        or asset.get("source_sha256") != job["output_sha256"]):
        fail("FINALIZER_SITE_ASSET_CONFLICT")
    return asset


def wait_derivative_pr(branch):
    for _ in range(80):
        heartbeat_if_due()
        prs = gh_json(
            "pr", "list", "--repo", REPO, "--head", branch, "--state", "open",
            "--json", "number,headRefOid",
        ) or []
        if prs:
            return wait_pr_and_merge(prs[0]["number"])
        checkout_main()
        if site_asset(CURRENT_JOB):
            return commit_for_path("archive/content/visuals/C03-AFTERFALL/SITE_ASSETS.json")
        time.sleep(3)
    fail("FINALIZER_DERIVATIVE_PR_NOT_CREATED")


CURRENT_JOB = None
LEASE_TOKEN = None
LEASE_LOST = False
LAST_HEARTBEAT = 0


def finalize(job_id):
    global CURRENT_JOB, LEASE_TOKEN, LEASE_LOST, LAST_HEARTBEAT
    LEASE_TOKEN = None
    LEASE_LOST = False
    LAST_HEARTBEAT = time.monotonic()
    if not SAFE_JOB.fullmatch(job_id):
        fail("FINALIZER_JOB_ID_INVALID")

    checkout_main()
    job = rpc("archive_illustration_render_job_readback", {"p_job_id": job_id})
    if not isinstance(job, dict):
        fail("FINALIZER_JOB_NOT_FOUND")
    CURRENT_JOB = job
    if job.get("status") == "SUCCEEDED":
        return {"status": "NOOP_ALREADY_SUCCEEDED", "job_id": job_id}
    if job.get("status") not in ("FINALIZE_QUEUED", "FINALIZING"):
        fail("FINALIZER_JOB_NOT_QUEUED")
    for key in ("review_staging_id", "output_sha256", "provider_asset_id"):
        if not job.get(key):
            fail("FINALIZER_JOB_BINDING_INCOMPLETE")

    lease = rpc("archive_illustration_render_job_lease_acquire", {
        "p_job_id": job_id,
        "p_owner": f"gha-{os.environ.get('GITHUB_RUN_ID', job_id)}-{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}",
        "p_lease_seconds": 7200,
    })
    if not isinstance(lease, dict) or lease.get("status") != "LEASE_ACQUIRED":
        fail("FINALIZER_LEASE_NOT_ACQUIRED")
    LEASE_TOKEN = lease.get("lease_token")
    if not isinstance(LEASE_TOKEN, str) or not re.fullmatch(r"[0-9a-f-]{36}", LEASE_TOKEN):
        fail("FINALIZER_LEASE_TOKEN_INVALID")

    rpc("archive_illustration_render_job_finish", {
        "p_job_id": job_id, "p_status": "FINALIZING", "p_summary": {"lease_token": LEASE_TOKEN},
    })

    identity_path, source_commit = ensure_identity(job)
    checkout_main()
    if not main_has(identity_path):
        fail("FINALIZER_IDENTITY_NOT_ON_MAIN")

    handoff_staging_id = f"{job_id}-{job['output_sha256'][:12]}"
    promoted = rpc("archive_illustration_review_promote", {
        "p_job_id": job_id,
        "p_review_staging_id": job["review_staging_id"],
        "p_handoff_staging_id": handoff_staging_id,
        "p_source_commit": source_commit,
        "p_identity_path": identity_path,
        "p_lease_token": LEASE_TOKEN,
    })
    if not isinstance(promoted, dict) or promoted.get("status") != "HANDOFF_STAGING_READY":
        fail("FINALIZER_REVIEW_STAGING_PROMOTE_FAILED")

    handoff_path = f"archive/automation/illustration-handoff-requests/{job_id}-staged.json"
    handoff_payload = {
        "version": "illustration-staged-handoff-request-v1",
        "staging_id": handoff_staging_id,
        "source_commit": source_commit,
        "identity_path": identity_path,
    }
    handoff_merge = ensure_json_request(
        handoff_path, handoff_payload,
        f"automation/finalize-handoff-{job_id}",
        f"archive: hand off {job['subject_id']} accepted original",
        "Immutable trusted handoff request generated by Automation B program finalizer.",
    )
    wait_workflow("archive-trusted-image-handoff.yml", handoff_merge, retry_storage_network=True)
    checkout_main()
    registry = verify_storage_registry(identity_path, job["output_sha256"])

    asset = site_asset(job)
    derivative_merge = None
    if asset is None:
        derivative_path = f"archive/automation/site-derivative-requests/{job_id}.json"
        derivative_payload = {
            "version": "site-derivative-request-v1",
            "identity_path": identity_path,
            "point_id": job["point_id"],
            "generation_key": job["generation_key"],
            "subject_id": job["subject_id"],
            "source_sha256": job["output_sha256"],
        }
        derivative_merge = ensure_json_request(
            derivative_path, derivative_payload,
            f"automation/finalize-derivative-{job_id}",
            f"archive: request site derivative for {job['subject_id']}",
            "One deterministic site derivative request generated after trusted Storage and Registry verification.",
        )
        wait_workflow("archive-site-derivative.yml", derivative_merge)
        derivative_branch = f"automation/site-derivative-{job_id}"
        wait_derivative_pr(derivative_branch)
        checkout_main()
        asset = site_asset(job)

    if not asset:
        fail("FINALIZER_SITE_ASSET_NOT_PUBLISHED")

    cleanup = rpc("archive_illustration_review_staging_cleanup", {
        "p_job_id": job_id,
        "p_lease_token": LEASE_TOKEN,
        "p_staging_id": job["review_staging_id"],
        "p_source_sha256": job["output_sha256"],
    })
    if not isinstance(cleanup, dict) or cleanup.get("deleted") != 1:
        fail("FINALIZER_REVIEW_STAGING_CLEANUP_FAILED")

    rpc("archive_illustration_render_job_finish", {
        "p_job_id": job_id,
        "p_status": "SUCCEEDED",
        "p_summary": {"lease_token": LEASE_TOKEN},
    })
    return {
        "status": "AUTOMATION_B_FINALIZED",
        "job_id": job_id,
        "subject_id": job["subject_id"],
        "source_sha256": job["output_sha256"],
        "registry_asset_id": registry.get("object_path"),
        "public_path": asset["public_path"],
        "identity_path": identity_path,
        "identity_source_commit": source_commit,
        "handoff_staging_id": handoff_staging_id,
        "handoff_merge_sha": handoff_merge,
        "derivative_request_merge_sha": derivative_merge,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", required=True)
    args = parser.parse_args()
    return finalize(args.job_id)


if __name__ == "__main__":
    job_id = None
    try:
        parser = argparse.ArgumentParser(add_help=False)
        parser.add_argument("--job-id")
        known, _ = parser.parse_known_args()
        job_id = known.job_id
        print(json.dumps(main(), ensure_ascii=False, separators=(",", ":")))
    except Exception as error:
        code = str(error).split(":", 1)[0] if isinstance(error, ValueError) else "FINALIZER_UNEXPECTED_ERROR"
        if job_id and SAFE_JOB.fullmatch(job_id):
            try:
                if LEASE_TOKEN and not LEASE_LOST:
                    rpc("archive_illustration_render_job_finish", {
                        "p_job_id": job_id,
                        "p_status": "BLOCKED",
                        "p_summary": {"blocker_code": code, "blocker_stage": "PROGRAM_FINALIZER", "lease_token": LEASE_TOKEN},
                    })
            except Exception:
                pass
        print(json.dumps({"status": "AUTOMATION_B_FINALIZER_BLOCKED", "code": code}))
        raise SystemExit(1)
