"""Audit sanitized AFTERFALL capture metadata without reading or writing game data.

Input deliberately excludes message bodies, save payloads, hidden state and credentials.
The tool reports capture/state drift; it never repairs Canon or authorizes publication.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
HASH = re.compile(r"^[0-9a-f]{64}$")
UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
TOP_KEYS = {"version", "repository", "database", "session"}
REPOSITORY_KEYS = {
    "branch", "worldline_id", "season", "save_version_anchor", "game_time_anchor"
}
DATABASE_KEYS = {"worldline_id", "season", "save_version", "game_time"}
SESSION_KEYS = {
    "chronicle_id", "worldline_id", "season_id", "status", "last_message_order", "turns"
}
TURN_KEYS = {"turn_no", "outcome", "user", "gm"}
MESSAGE_KEYS = {"message_order", "idempotency_key", "content_sha256", "save_version", "public_safe", "game_time"}
GAME_TIME = re.compile(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$")


def require(condition: bool, code: str) -> None:
    if not condition:
        raise ValueError(code)


def exact_keys(value: Any, expected: set[str], code: str) -> None:
    require(isinstance(value, dict) and set(value) == expected, code)


def positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def valid_game_time(value: Any) -> bool:
    if not isinstance(value, str) or not GAME_TIME.fullmatch(value):
        return False
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M").strftime("%Y-%m-%d %H:%M") == value
    except ValueError:
        return False


def validate_message(message: Any) -> None:
    exact_keys(message, MESSAGE_KEYS, "INVALID_MESSAGE_METADATA")
    require(isinstance(message["message_order"], int) and not isinstance(message["message_order"], bool)
            and message["message_order"] >= 0,
            "INVALID_MESSAGE_ORDER")
    require(isinstance(message["idempotency_key"], str) and UUID.fullmatch(message["idempotency_key"]),
            "INVALID_IDEMPOTENCY_KEY")
    require(isinstance(message["content_sha256"], str) and HASH.fullmatch(message["content_sha256"]),
            "INVALID_CONTENT_HASH")
    require(message["save_version"] is None or positive_int(message["save_version"]),
            "INVALID_MESSAGE_SAVE_VERSION")
    require(message["public_safe"] is True, "NON_PUBLIC_SAFE_CAPTURE")
    require(valid_game_time(message["game_time"]), "INVALID_MESSAGE_GAME_TIME")


def audit(snapshot: Any) -> dict[str, Any]:
    """Return only a bounded status; never echo input identifiers or values."""
    exact_keys(snapshot, TOP_KEYS, "INVALID_AUDIT_SNAPSHOT")
    require(snapshot["version"] == "afterfall-capture-sync-audit-v1", "UNSUPPORTED_AUDIT_VERSION")
    repository, database, session = snapshot["repository"], snapshot["database"], snapshot["session"]
    exact_keys(repository, REPOSITORY_KEYS, "INVALID_REPOSITORY_METADATA")
    exact_keys(database, DATABASE_KEYS, "INVALID_DATABASE_METADATA")
    exact_keys(session, SESSION_KEYS, "INVALID_SESSION_METADATA")

    require(repository["branch"] == "worldline/afterfall-rpg", "WRONG_REPOSITORY_BRANCH")
    require(repository["worldline_id"] == "AFTERFALL" and database["worldline_id"] == "AFTERFALL",
            "WORLDLINE_IDENTITY_MISMATCH")
    require(session["chronicle_id"] == "C03" and session["worldline_id"] == "AFTERFALL",
            "SESSION_NAMESPACE_MISMATCH")
    require(isinstance(repository["season"], int) and repository["season"] > 0,
            "INVALID_REPOSITORY_SEASON")
    require(isinstance(database["season"], int) and database["season"] > 0,
            "INVALID_DATABASE_SEASON")
    require(positive_int(repository["save_version_anchor"]), "INVALID_REPOSITORY_SAVE_ANCHOR")
    require(positive_int(database["save_version"]), "INVALID_DATABASE_SAVE_VERSION")
    require(valid_game_time(repository["game_time_anchor"]), "INVALID_REPOSITORY_GAME_TIME")
    require(valid_game_time(database["game_time"]), "INVALID_DATABASE_GAME_TIME")
    require(session["status"] in {"OPEN", "CLOSED"}, "INVALID_SESSION_STATUS")
    require(isinstance(session["last_message_order"], int) and session["last_message_order"] >= -1,
            "INVALID_LAST_MESSAGE_ORDER")
    require(isinstance(session["turns"], list), "INVALID_TURN_INVENTORY")

    orders: list[int] = []
    seen_idempotency: set[str] = set()
    unlinked_state = False
    state_link_errors = False
    previous_turn: int | None = None
    for turn in session["turns"]:
        exact_keys(turn, TURN_KEYS, "INVALID_TURN_METADATA")
        require(isinstance(turn["turn_no"], int) and not isinstance(turn["turn_no"], bool)
                and turn["turn_no"] >= 0, "INVALID_TURN_NUMBER")
        require(previous_turn is None or turn["turn_no"] > previous_turn, "DUPLICATE_OR_REVERSED_TURN")
        previous_turn = turn["turn_no"]
        require(turn["outcome"] in {"APPLIED", "NO_STATE_CHANGE"}, "MISSING_STATE_OUTCOME")
        validate_message(turn["user"])
        validate_message(turn["gm"])
        user, gm = turn["user"], turn["gm"]
        orders.extend([user["message_order"], gm["message_order"]])
        for key in (user["idempotency_key"], gm["idempotency_key"]):
            require(key not in seen_idempotency, "DUPLICATE_IDEMPOTENCY_KEY")
            seen_idempotency.add(key)
        require(gm["message_order"] == user["message_order"] + 1, "TURN_PAIR_ORDER_GAP")
        if user["save_version"] is None or gm["save_version"] is None:
            unlinked_state = True
        elif turn["outcome"] == "NO_STATE_CHANGE" and user["save_version"] != gm["save_version"]:
            state_link_errors = True
        elif turn["outcome"] == "APPLIED" and gm["save_version"] <= user["save_version"]:
            state_link_errors = True

    orders.sort()
    require(orders == list(range(session["last_message_order"] + 1)), "SESSION_ORDER_GAP_OR_TAIL_MISMATCH")
    require(len(orders) % 2 == 0, "UNPAIRED_SESSION_TAIL")

    if session["turns"]:
        latest_capture_time = session["turns"][-1]["gm"]["game_time"]
        if latest_capture_time > database["game_time"]:
            return {"status": "NEEDS_GM_REVIEW", "reason": "RAW_AHEAD_OF_SAVE", "publication_allowed": False}
        if database["game_time"] > latest_capture_time:
            return {"status": "NEEDS_GM_REVIEW", "reason": "SAVE_AHEAD_OF_CAPTURE", "publication_allowed": False}
    elif database["game_time"] > repository["game_time_anchor"]:
        return {"status": "NEEDS_GM_REVIEW", "reason": "SAVE_AHEAD_OF_REPOSITORY", "publication_allowed": False}
    if database["game_time"] != repository["game_time_anchor"]:
        return {"status": "NEEDS_GM_REVIEW", "reason": "DATABASE_REPOSITORY_TIME_MISMATCH", "publication_allowed": False}
    if unlinked_state:
        return {"status": "NEEDS_GM_REVIEW", "reason": "TURN_STATE_LINK_MISSING", "publication_allowed": False}
    if state_link_errors:
        return {"status": "NEEDS_GM_REVIEW", "reason": "TURN_STATE_LINK_CONFLICT", "publication_allowed": False}
    if session["turns"] and session["turns"][-1]["gm"]["save_version"] != database["save_version"]:
        return {"status": "NEEDS_GM_REVIEW", "reason": "SAVE_TRANSCRIPT_HEAD_MISMATCH", "publication_allowed": False}
    if (repository["season"] != database["season"]
            or session["season_id"] != f"S{database['season']:02d}"
            or repository["save_version_anchor"] != database["save_version"]):
        return {"status": "NEEDS_GM_REVIEW", "reason": "CANON_DATABASE_CAPTURE_DRIFT", "publication_allowed": False}

    # A synchronized capture is still not a public approval or an Archive publication.
    return {"status": "CAPTURE_SYNCED", "reason": "METADATA_CONSISTENT", "publication_allowed": False}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", nargs="?", help="sanitized JSON metadata file; defaults to stdin")
    args = parser.parse_args()
    try:
        if args.snapshot:
            snapshot = json.loads(Path(args.snapshot).read_text(encoding="utf-8"))
        else:
            snapshot = json.load(sys.stdin)
        print(json.dumps(audit(snapshot), sort_keys=True))
        return 0
    except (OSError, json.JSONDecodeError, ValueError):
        print(json.dumps({"status": "AUDIT_REJECTED", "reason": "INVALID_OR_UNSAFE_AUDIT_INPUT",
                          "publication_allowed": False}, sort_keys=True))
        return 2


if __name__ == "__main__":
    sys.exit(main())
