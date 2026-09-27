"""Guard the AFTERFALL state-link migration's safety contract at source level."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260926162611_afterfall_atomic_turn_state_link_v1.sql"
CONTINUITY_MIGRATION = ROOT / "supabase/migrations/20260927042720_afterfall_turn_state_continuity_v1.sql"
INTEGRITY_MIGRATION = ROOT / "supabase/migrations/20260927095300_afterfall_turn_link_message_integrity_v1.sql"


class TurnStateLinkMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_scope_is_additive_and_afterfall_only(self) -> None:
        self.assertIn("create table survival_rpg.transcript_turn_state_links", self.sql)
        self.assertIn("create function survival_rpg.append_public_transcript_turn_with_state_link", self.sql)
        self.assertIn("worldline_id = 'afterfall'", self.sql)
        self.assertIn("chronicle_id = 'c03'", self.sql)
        self.assertNotIn("drop ", self.sql)
        self.assertNotRegex(self.sql, r"\b(update|delete)\s+survival_rpg\.(saves|transcript_messages)\b")

    def test_function_is_invoker_with_pinned_search_path(self) -> None:
        self.assertIn("security invoker", self.sql)
        self.assertIn("set search_path = pg_catalog, survival_rpg", self.sql)
        self.assertIn("revoke all on function survival_rpg.append_public_transcript_turn_with_state_link", self.sql)
        self.assertIn("to service_role", self.sql)
        self.assertNotIn("to anon", self.sql)
        self.assertNotIn("to authenticated", self.sql)

    def test_pair_and_link_share_transaction_and_lock_current_save(self) -> None:
        lock = self.sql.index("for update")
        stale_guard = self.sql.index("authoritative save head changed before transcript capture")
        user_append = self.sql.index("v_user := survival_rpg.append_public_transcript_message", stale_guard)
        gm_append = self.sql.index("v_gm := survival_rpg.append_public_transcript_message", user_append)
        link_insert = self.sql.index("insert into survival_rpg.transcript_turn_state_links")
        self.assertLess(lock, stale_guard)
        self.assertLess(stale_guard, user_append)
        self.assertLess(user_append, gm_append)
        self.assertLess(gm_append, link_insert)
        self.assertIn("p_gm_save_version is null", self.sql)
        self.assertIn("p_outcome not in ('applied', 'no_state_change')", self.sql)

    def test_retries_compare_frozen_link_and_never_relink_another_pair(self) -> None:
        self.assertIn("replays are checked against the immutable link", self.sql)
        self.assertIn("v_link.user_message_id", self.sql)
        self.assertIn("v_link.gm_message_id", self.sql)
        self.assertIn("turn state-link retry differs from original payload", self.sql)

    def test_link_is_not_public_approval_or_save_mutation(self) -> None:
        self.assertIn("grants no publication visibility", self.sql)
        self.assertIn("does not mutate save state", self.sql)
        self.assertNotRegex(self.sql, r"\bupdate\s+survival_rpg\.saves\b")

    def test_additive_continuity_trigger_checks_both_adjacent_turns(self) -> None:
        sql = CONTINUITY_MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("create function survival_rpg.enforce_afterfall_turn_state_continuity()", sql)
        self.assertIn("set search_path = pg_catalog, survival_rpg", sql)
        self.assertIn("security invoker", sql)
        self.assertIn("l.turn_no = new.turn_no - 1", sql)
        self.assertIn("new.user_save_version is distinct from v_previous_gm_save_version", sql)
        self.assertIn("l.turn_no = new.turn_no + 1", sql)
        self.assertIn("v_next_user_save_version is distinct from new.gm_save_version", sql)
        self.assertIn("before insert on survival_rpg.transcript_turn_state_links", sql)
        self.assertNotIn("drop ", sql)
        self.assertNotRegex(sql, r"\b(update|delete)\s+survival_rpg\.(saves|transcript_messages|transcript_turn_state_links)\b")
        self.assertNotIn("grant execute", sql)

    def test_new_additive_migration_hardens_installed_trigger_without_rewriting_it(self) -> None:
        sql = INTEGRITY_MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("create or replace function survival_rpg.enforce_afterfall_turn_state_continuity()", sql)
        self.assertIn("set search_path = pg_catalog, survival_rpg", sql)
        self.assertIn("security invoker", sql)
        self.assertIn("from survival_rpg.saves as s", sql)
        self.assertIn("for update", sql)
        self.assertIn("new.linked_save_version is distinct from v_current_save_version", sql)
        self.assertIn("v_user_role is distinct from 'user'", sql)
        self.assertIn("v_gm_role is distinct from 'gm'", sql)
        self.assertIn("v_user_turn_no is distinct from new.turn_no", sql)
        self.assertIn("v_gm_turn_no is distinct from new.turn_no", sql)
        self.assertIn("v_gm_message_order is distinct from v_user_message_order + 1", sql)
        self.assertIn("for share", sql)
        self.assertIn("new.turn_no - 1", sql)
        self.assertIn("new.turn_no + 1", sql)
        self.assertNotIn("create trigger", sql)
        self.assertNotIn("drop ", sql)
        self.assertNotRegex(sql, r"\b(update|delete)\s+survival_rpg\.(saves|transcript_messages|transcript_turn_state_links)\b")
        self.assertNotIn("grant execute", sql)


if __name__ == "__main__":
    unittest.main()

