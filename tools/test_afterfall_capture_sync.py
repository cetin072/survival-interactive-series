"""Synthetic metadata-only tests for the AFTERFALL capture synchronization audit."""

from __future__ import annotations

import unittest
from uuid import uuid4

from tools.afterfall_capture_sync import audit

SESSION_ID = "00000000-0000-4000-8000-000000000001"


def message(order: int, save_version: int | None, game_time: str, turn_no: int = 1) -> dict:
    return {
        "message_id": str(uuid4()),
        "worldline_id": "AFTERFALL",
        "chronicle_id": "C03",
        "season_id": "S03",
        "session_id": SESSION_ID,
        "turn_no": turn_no,
        "message_order": order,
        "role": "USER" if order % 2 == 0 else "GM",
        "idempotency_key": str(uuid4()),
        "content_sha256": "a" * 64,
        "save_version": save_version,
        "public_safe": True,
        "source_type": "LIVE",
        "game_time": game_time,
    }


def snapshot() -> dict:
    user = message(0, 253, "2027-03-24 16:30")
    gm = message(1, 253, "2027-03-24 17:10")
    return {
        "version": "afterfall-capture-sync-audit-v1",
        "repository": {
            "branch": "worldline/afterfall-rpg", "worldline_id": "AFTERFALL",
            "season": 3, "save_version_anchor": 253, "game_time_anchor": "2027-03-24 17:10",
        },
        "database": {"worldline_id": "AFTERFALL", "season": 3, "save_version": 253,
                     "game_time": "2027-03-24 17:10"},
        "session": {
            "session_id": SESSION_ID, "chronicle_id": "C03", "worldline_id": "AFTERFALL", "season_id": "S03",
            "status": "OPEN", "last_message_order": 1,
            "turns": [{"turn_no": 1, "outcome": "NO_STATE_CHANGE", "user": user, "gm": gm,
                       "state_link": {"session_id": SESSION_ID, "worldline_id": "AFTERFALL",
                                      "chronicle_id": "C03", "season_id": "S03",
                                      "user_message_id": user["message_id"], "gm_message_id": gm["message_id"],
                                      "outcome": "NO_STATE_CHANGE", "user_save_version": 253,
                                      "gm_save_version": 253, "linked_save_version": 253}}],
        },
    }


class CaptureSyncAuditTests(unittest.TestCase):
    def test_synchronized_capture_never_claims_publication(self) -> None:
        result = audit(snapshot())
        self.assertEqual(result["status"], "CAPTURE_METADATA_CONSISTENT")
        self.assertFalse(result["publication_allowed"])

    def test_missing_save_link_quarantines_turn(self) -> None:
        data = snapshot()
        data["session"]["turns"][0]["gm"]["save_version"] = None
        result = audit(data)
        self.assertEqual((result["status"], result["reason"]),
                         ("NEEDS_GM_REVIEW", "TURN_STATE_LINK_CONFLICT"))
        self.assertFalse(result["publication_allowed"])

    def test_missing_turn_link_record_quarantines_complete_raw_pair(self) -> None:
        data = snapshot()
        data["session"]["turns"][0]["state_link"] = None
        data["session"]["turns"][0]["outcome"] = None
        result = audit(data)
        self.assertEqual((result["status"], result["reason"]),
                         ("NEEDS_GM_REVIEW", "TURN_STATE_LINK_MISSING"))

    def test_link_for_a_different_message_pair_is_rejected_for_review(self) -> None:
        data = snapshot()
        data["session"]["turns"][0]["state_link"]["user_message_id"] = str(uuid4())
        result = audit(data)
        self.assertEqual((result["status"], result["reason"]),
                         ("NEEDS_GM_REVIEW", "TURN_STATE_LINK_CONFLICT"))

    def test_skipped_turn_number_and_reversed_roles_are_rejected(self) -> None:
        data = snapshot()
        user = message(2, 253, "2027-03-24 17:10", 3)
        gm = message(3, 253, "2027-03-24 17:10", 3)
        data["session"]["last_message_order"] = 3
        data["session"]["turns"].append({
            "turn_no": 3, "outcome": "NO_STATE_CHANGE", "user": user, "gm": gm,
            "state_link": {"session_id": SESSION_ID, "worldline_id": "AFTERFALL",
                           "chronicle_id": "C03", "season_id": "S03",
                           "user_message_id": user["message_id"], "gm_message_id": gm["message_id"],
                           "outcome": "NO_STATE_CHANGE", "user_save_version": 253,
                           "gm_save_version": 253, "linked_save_version": 253},
        })
        with self.assertRaisesRegex(ValueError, "DUPLICATE_OR_SKIPPED_TURN"):
            audit(data)
        data = snapshot()
        data["session"]["turns"][0]["gm"]["role"] = "USER"
        with self.assertRaisesRegex(ValueError, "TURN_PAIR_ROLE_MISMATCH"):
            audit(data)

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
