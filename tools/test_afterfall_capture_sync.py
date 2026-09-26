"""Synthetic metadata-only tests for the AFTERFALL capture synchronization audit."""

from __future__ import annotations

import unittest
from uuid import uuid4

from tools.afterfall_capture_sync import audit


def message(order: int, save_version: int | None, game_time: str) -> dict:
    return {
        "message_order": order,
        "idempotency_key": str(uuid4()),
        "content_sha256": "a" * 64,
        "save_version": save_version,
        "public_safe": True,
        "game_time": game_time,
    }


def snapshot() -> dict:
    return {
        "version": "afterfall-capture-sync-audit-v1",
        "repository": {
            "branch": "worldline/afterfall-rpg", "worldline_id": "AFTERFALL",
            "season": 3, "save_version_anchor": 253, "game_time_anchor": "2027-03-24 17:10",
        },
        "database": {"worldline_id": "AFTERFALL", "season": 3, "save_version": 253,
                     "game_time": "2027-03-24 17:10"},
        "session": {
            "chronicle_id": "C03", "worldline_id": "AFTERFALL", "season_id": "S03",
            "status": "OPEN", "last_message_order": 1,
            "turns": [{"turn_no": 1, "outcome": "NO_STATE_CHANGE",
                       "user": message(0, 253, "2027-03-24 16:30"),
                       "gm": message(1, 253, "2027-03-24 17:10")}],
        },
    }


class CaptureSyncAuditTests(unittest.TestCase):
    def test_synchronized_capture_never_claims_publication(self) -> None:
        result = audit(snapshot())
        self.assertEqual(result["status"], "CAPTURE_SYNCED")
        self.assertFalse(result["publication_allowed"])

    def test_missing_save_link_quarantines_turn(self) -> None:
        data = snapshot()
        data["session"]["turns"][0]["gm"]["save_version"] = None
        result = audit(data)
        self.assertEqual((result["status"], result["reason"]),
                         ("NEEDS_GM_REVIEW", "TURN_STATE_LINK_MISSING"))
        self.assertFalse(result["publication_allowed"])

    def test_branch_and_database_season_drift_needs_review(self) -> None:
        data = snapshot()
        data["repository"]["season"] = 2
        result = audit(data)
        self.assertEqual((result["status"], result["reason"]),
                         ("NEEDS_GM_REVIEW", "CANON_DATABASE_CAPTURE_DRIFT"))

    def test_order_gap_and_corrupt_hash_reject_snapshot(self) -> None:
        data = snapshot()
        data["session"]["last_message_order"] = 3
        with self.assertRaisesRegex(ValueError, "SESSION_ORDER_GAP_OR_TAIL_MISMATCH"):
            audit(data)
        data = snapshot()
        data["session"]["turns"][0]["gm"]["content_sha256"] = "bad"
        with self.assertRaisesRegex(ValueError, "INVALID_CONTENT_HASH"):
            audit(data)

    def test_raw_text_or_hidden_payload_is_rejected_without_echo(self) -> None:
        data = snapshot()
        data["session"]["turns"][0]["user"]["content"] = "must not enter audit input"
        with self.assertRaisesRegex(ValueError, "INVALID_MESSAGE_METADATA"):
            audit(data)

    def test_new_state_version_cannot_be_rewritten_as_no_change(self) -> None:
        data = snapshot()
        data["session"]["turns"][0]["gm"]["save_version"] = 254
        result = audit(data)
        self.assertEqual((result["status"], result["reason"]),
                         ("NEEDS_GM_REVIEW", "TURN_STATE_LINK_CONFLICT"))

    def test_applied_turn_requires_a_newer_gm_save_version(self) -> None:
        data = snapshot()
        data["session"]["turns"][0]["outcome"] = "APPLIED"
        result = audit(data)
        self.assertEqual((result["status"], result["reason"]),
                         ("NEEDS_GM_REVIEW", "TURN_STATE_LINK_CONFLICT"))

    def test_database_head_must_match_latest_capture_link(self) -> None:
        data = snapshot()
        data["database"]["save_version"] = 254
        result = audit(data)
        self.assertEqual((result["status"], result["reason"]),
                         ("NEEDS_GM_REVIEW", "SAVE_TRANSCRIPT_HEAD_MISMATCH"))

    def test_database_time_ahead_of_capture_is_explicit(self) -> None:
        data = snapshot()
        data["database"]["game_time"] = "2027-03-25 17:10"
        result = audit(data)
        self.assertEqual((result["status"], result["reason"]),
                         ("NEEDS_GM_REVIEW", "SAVE_AHEAD_OF_CAPTURE"))

    def test_raw_time_ahead_of_save_is_explicit(self) -> None:
        data = snapshot()
        data["database"]["game_time"] = "2027-03-23 17:50"
        result = audit(data)
        self.assertEqual((result["status"], result["reason"]),
                         ("NEEDS_GM_REVIEW", "RAW_AHEAD_OF_SAVE"))


if __name__ == "__main__":
    unittest.main()
