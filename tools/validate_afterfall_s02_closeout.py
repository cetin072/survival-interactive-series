"""Validate repository-only AFTERFALL S02 closeout metadata.

This validator intentionally does not contact Supabase. Live rows are audited
separately; committed source manifests are the CI-safe mirror of that audit.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
AFTERFALL = ROOT / "worldlines" / "AFTERFALL"
S02 = AFTERFALL / "seasons" / "S02"
S03 = AFTERFALL / "seasons" / "S03"
RAW = S02 / "raw_transcript"
UNSET = object()


class Validation:
    def __init__(self) -> None:
        self.failures: list[str] = []

    def check(self, condition: bool, message: str) -> None:
        if condition:
            print(f"OK:   {message}")
        else:
            print(f"FAIL: {message}")
            self.failures.append(message)


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def range_matches(
    validation: Validation,
    label: str,
    value: Any,
    expected_start: Any = UNSET,
    expected_end: Any = UNSET,
    allow_null_end: bool = True,
) -> None:
    is_range = isinstance(value, dict) and set(value) == {"start", "end"}
    validation.check(is_range, f"{label} has start/end fields")
    if not is_range:
        return

    start = value["start"]
    end = value["end"]
    validation.check(isinstance(start, str) and bool(start), f"{label} has a start")
    validation.check(
        isinstance(end, str) or (allow_null_end and end is None),
        f"{label} has a valid end",
    )
    if isinstance(start, str) and isinstance(end, str):
        validation.check(start <= end, f"{label} is chronologically ordered")
    if expected_start is not UNSET:
        validation.check(start == expected_start, f"{label} start matches source metadata")
    if expected_end is not UNSET:
        validation.check(end == expected_end, f"{label} end matches source metadata")


def validate_pairing(
    validation: Validation, session_id: str, source: dict[str, Any]
) -> None:
    counts = source.get("counts")
    order = source.get("message_order")
    hashes = source.get("content_sha256")
    paired = source.get("atomic_pairing_complete")

    if not paired:
        validation.check(
            source.get("capture_quality") == "PARTIAL_CAPTURE_INCOMPLETE_PAIRING",
            f"{session_id} incomplete pairing remains explicit",
        )
        return

    valid_counts = (
        isinstance(counts, dict)
        and isinstance(counts.get("user"), int)
        and counts["user"] > 0
        and counts["user"] == counts.get("gm")
        and counts.get("total") == counts["user"] + counts["gm"]
    )
    validation.check(valid_counts, f"{session_id} paired USER/GM counts are balanced")

    valid_order = (
        isinstance(order, dict)
        and order.get("contiguous") is True
        and order.get("min") == 0
        and isinstance(counts, dict)
        and order.get("max") == counts.get("total", 0) - 1
    )
    validation.check(valid_order, f"{session_id} message order is contiguous from zero")

    valid_hashes = isinstance(hashes, list) and isinstance(counts, dict) and len(hashes) == counts.get("total")
    if valid_hashes:
        valid_hashes = all(
            isinstance(entry, dict)
            and entry.get("message_order") == index
            and entry.get("role") == ("USER" if index % 2 == 0 else "GM")
            and isinstance(entry.get("sha256"), str)
            and re.fullmatch(r"[0-9a-f]{64}", entry["sha256"]) is not None
            for index, entry in enumerate(hashes)
        )
    validation.check(valid_hashes, f"{session_id} stored hashes follow USER→GM pairs")


def validate_transcript_metadata(validation: Validation) -> None:
    manifest = load_json(RAW / "MANIFEST.json")
    sessions = manifest.get("sessions")
    validation.check(isinstance(sessions, list), "S02 raw manifest has a sessions list")
    if not isinstance(sessions, list):
        return

    session_ids = [entry.get("session_id") for entry in sessions if isinstance(entry, dict)]
    validation.check(len(session_ids) == len(set(session_ids)), "S02 raw manifest has no duplicate session_id")

    for entry in sessions:
        if not isinstance(entry, dict) or not re.fullmatch(r"SESSION_00[3-9]", str(entry.get("session_id"))):
            continue

        session_id = entry["session_id"]
        source_path = RAW / str(entry.get("source_manifest", ""))
        validation.check(source_path.is_file(), f"{session_id} source manifest exists")
        if not source_path.is_file():
            continue
        source = load_json(source_path)

        validation.check(source.get("session_id") == session_id, f"{session_id} source manifest identity matches")
        validation.check(
            source.get("source_session_uuid") == entry.get("source_session_uuid"),
            f"{session_id} source session UUID matches",
        )
        validation.check(
            entry.get("coverage_basis") == source.get("coverage_basis") == "captured_message_range",
            f"{session_id} coverage is explicitly based on captured messages",
        )

        range_matches(
            validation,
            f"{session_id} source session range",
            source.get("session_range"),
            source.get("starting_game_time"),
            source.get("closing_game_time"),
        )
        range_matches(
            validation,
            f"{session_id} source captured range",
            source.get("captured_message_range"),
            allow_null_end=False,
        )
        range_matches(validation, f"{session_id} archive session range", entry.get("session_range"))
        range_matches(
            validation,
            f"{session_id} archive captured range",
            entry.get("captured_message_range"),
            allow_null_end=False,
        )
        validation.check(
            entry.get("session_range") == source.get("session_range"),
            f"{session_id} archive and source session ranges agree",
        )
        validation.check(
            entry.get("captured_message_range") == source.get("captured_message_range"),
            f"{session_id} archive and source captured ranges agree",
        )

        session_range = source.get("session_range", {})
        captured_range = source.get("captured_message_range", {})
        if isinstance(session_range, dict) and isinstance(captured_range, dict):
            session_start = session_range.get("start")
            session_end = session_range.get("end")
            captured_start = captured_range.get("start")
            captured_end = captured_range.get("end")
            if isinstance(session_start, str) and isinstance(captured_start, str):
                validation.check(
                    session_start <= captured_start,
                    f"{session_id} capture does not precede its session",
                )
            if isinstance(session_end, str) and isinstance(captured_end, str):
                validation.check(
                    captured_end <= session_end,
                    f"{session_id} capture does not exceed its session",
                )

        validate_pairing(validation, session_id, source)


def validate_closeout_state(validation: Validation) -> None:
    current = load_json(AFTERFALL / "CURRENT_STATE.json")
    end = load_json(S02 / "END_STATE.json")
    start = load_json(S03 / "START_STATE.json")

    validation.check(end.get("status") == "COMPLETE", "S02 END_STATE is COMPLETE")
    validation.check(
        end.get("save_version") == current.get("save_version_anchor"),
        "S02 end save version matches CURRENT_STATE anchor",
    )
    validation.check(
        end.get("game_time") == current.get("game_time_anchor"),
        "S02 end game time matches CURRENT_STATE anchor",
    )
    validation.check(
        current.get("season2_end", {}).get("status") == "COMPLETE"
        and current.get("season2_end", {}).get("season3_started") is False,
        "CURRENT_STATE records S02 COMPLETE and S03 NOT STARTED",
    )
    validation.check(
        start.get("status") == "READY_FOR_SEASON_START",
        "S03 START_STATE uses continuation-ready status",
    )
    validation.check(
        start.get("starts_after", {}).get("season") == end.get("season")
        and start.get("starts_after", {}).get("game_time") == end.get("game_time")
        and start.get("starts_after", {}).get("save_version") == end.get("save_version"),
        "S03 start anchor matches S02 end state",
    )
    validation.check(
        start.get("future_plot") == "UNDEFINED"
        and start.get("convoy_hostility") == "UNDETERMINED"
        and end.get("finale_signal", {}).get("hostility") == "UNDETERMINED",
        "future plot and convoy hostility remain unconfirmed",
    )

    canon = (S02 / "PLAYTHROUGH_CANON.md").read_text(encoding="utf-8")
    match = re.search(r"Season range:\s*\*\*(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})\*\*", canon)
    validation.check(match is not None, "S02 Canon has a machine-checkable season range")
    if match is not None:
        validation.check(match.group(1) == "2026-11-21", "S02 Canon starts at the opening event date")
        validation.check(match.group(1) <= match.group(2), "S02 Canon season range is ordered")


def main() -> None:
    validation = Validation()
    try:
        validate_closeout_state(validation)
        validate_transcript_metadata(validation)
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        validation.check(False, f"closeout metadata could not be parsed: {exc}")

    if validation.failures:
        print(f"AFTERFALL S02 closeout validation failed: {len(validation.failures)} check(s).")
        sys.exit(1)
    print("AFTERFALL S02 closeout metadata checks passed.")


if __name__ == "__main__":
    main()
