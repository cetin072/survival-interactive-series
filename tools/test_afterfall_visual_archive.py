import copy
import unittest

from afterfall_visual_archive import (
    FailingVisualGenerationProvider,
    FakeVisualGenerationProvider,
    apply_ready_gate,
    build_player_manifest,
    build_public_manifest,
    build_visual_brief,
    compile_visual_candidates,
    run_generation,
    split_map_rendering_contract,
)


def character(character_id="player", tier="PLAYER", anchor=None):
    return {
        "character_id": character_id,
        "display_name": character_id,
        "tier": tier,
        "active": True,
        "known_facts": {"appearance_anchor": anchor or {}},
    }


def scene(scene_id="scene-1", **overrides):
    value = {
        "scene_id": scene_id,
        "canon_status": "CANON",
        "key_image": "A Canon visual moment",
        "outcome_summary": "A lasting Canon result",
        "source_event_ids": [1],
        "participants": ["player"],
        "location": "Public hub",
    }
    value.update(overrides)
    return value


def event(**overrides):
    value = {"id": 1, "canon_status": "CANON", "event_class": "BASE", "tags": ["BASE_RECONFIGURATION"]}
    value.update(overrides)
    return value


def snapshot(**overrides):
    value = {"worldline_id": "AFTERFALL", "characters": [], "bases": [], "scenes": [], "events": []}
    value.update(overrides)
    return value


class AfterfallVisualArchiveTests(unittest.TestCase):
    def test_compiler_is_idempotent_after_candidate_persistence(self):
        source = snapshot(scenes=[scene()], events=[event()])
        first = compile_visual_candidates(source)
        self.assertEqual(len(first), 1)
        self.assertEqual(compile_visual_candidates(source, first), [])

    def test_character_without_anchors_never_auto_promotes(self):
        candidate = compile_visual_candidates(snapshot(characters=[character(anchor={})]))[0]
        promoted = apply_ready_gate(candidate)
        self.assertEqual(promoted["status"], "WAITING_CANON")

    def test_player_and_core_with_anchors_are_character_candidates(self):
        anchor = {"apparent_age": "30s", "build": "lean", "face": "calm", "hair": "black"}
        candidates = compile_visual_candidates(snapshot(characters=[character("player", "PLAYER", anchor), character("core", "CORE", anchor)]))
        self.assertEqual({candidate["asset_type"] for candidate in candidates}, {"CHARACTER"})
        self.assertEqual({apply_ready_gate(candidate)["status"] for candidate in candidates}, {"READY"})

    def test_key_image_alone_is_not_an_event_candidate(self):
        candidates = compile_visual_candidates(snapshot(scenes=[scene(outcome_summary=None)], events=[event()]))
        self.assertEqual(candidates, [])

    def test_draft_and_superseded_sources_are_excluded(self):
        candidates = compile_visual_candidates(
            snapshot(
                scenes=[scene(canon_status="DRAFT"), scene("old", canon_status="CANON", source_event_ids=[2])],
                events=[event(), event(id=2, canon_status="SUPERSEDED")],
            )
        )
        self.assertEqual(candidates, [])

    def test_core_private_and_player_archive_are_never_public(self):
        assets = [
            published_asset("core", "CORE_PRIVATE"),
            published_asset("player", "PLAYER_ARCHIVE"),
            published_asset("public", "PUBLIC_ARCHIVE"),
        ]
        self.assertEqual([item["asset_id"] for item in build_public_manifest(assets)], ["public"])
        self.assertEqual({item["asset_id"] for item in build_player_manifest(assets)}, {"player", "public"})

    def test_public_published_asset_is_included(self):
        item = build_public_manifest([published_asset("public", "PUBLIC_ARCHIVE")])[0]
        self.assertEqual(item["status"], "PUBLISHED")
        self.assertEqual(item["related_scene_id"], "scene-1")

    def test_first_map_stays_waiting_without_all_explicit_gates(self):
        map_asset = published_asset("AF-MAP-001", "PLAYER_ARCHIVE", asset_type="WORLD_MAP", status="WAITING_CANON")
        self.assertEqual(apply_ready_gate(map_asset)["status"], "WAITING_CANON")

    def test_first_map_promotes_when_all_explicit_gates_pass(self):
        map_asset = published_asset("AF-MAP-001", "PLAYER_ARCHIVE", asset_type="WORLD_MAP", status="WAITING_CANON")
        promoted = apply_ready_gate(
            map_asset,
            map_canon={
                "third_hub_expansion_settled": True,
                "front_living_structure_settled": True,
                "northwest_fallback_role_settled": True,
                "public_security_layer_settled": True,
            },
        )
        self.assertEqual(promoted["status"], "READY")

    def test_map_topology_is_separate_from_visual_brief(self):
        contract = split_map_rendering_contract({"nodes": [{"x": 0, "y": 0}], "edges": [{"distance": 7.2}]}, {})
        self.assertIn("nodes", contract["deterministic_topology"])
        self.assertNotIn("nodes", contract["visual_brief"])
        self.assertNotIn("edges", contract["visual_brief"])
        self.assertTrue(contract["visual_brief"]["map_visual_layer_only"])

    def test_public_brief_strips_hidden_and_future_fields(self):
        brief = build_visual_brief(
            "LOCATION",
            subject="Public hub",
            location_facts={
                "name": "Public hub",
                "hidden_route": "never include",
                "exact_coordinates": [1, 2],
                "gm_notes": "never include",
            },
            canon_facts={"outcome_summary": "A safe public result", "future_plan": "never include"},
        )
        rendered = str(brief).lower()
        self.assertNotIn("hidden_route", rendered)
        self.assertNotIn("exact_coordinates", rendered)
        self.assertNotIn("gm_notes", rendered)
        self.assertNotIn("future_plan", rendered)

    def test_provider_failure_does_not_mutate_canon_or_runtime_state(self):
        candidate = compile_visual_candidates(snapshot(scenes=[scene()], events=[event()]))[0]
        ready = apply_ready_gate(candidate)
        game_state = {"saves": {"state": {"bases": ["unchanged"]}}, "characters": [{"id": "unchanged"}], "scenes": ["unchanged"]}
        before = copy.deepcopy(game_state)
        failed = run_generation(ready, FailingVisualGenerationProvider())
        self.assertEqual(failed["status"], "ERROR")
        self.assertEqual(game_state, before)
        generated = run_generation(ready, FakeVisualGenerationProvider())
        self.assertEqual(generated["status"], "GENERATED")


def published_asset(asset_id, visibility, *, asset_type="EVENT", status="PUBLISHED"):
    return {
        "worldline_id": "AFTERFALL",
        "asset_id": asset_id,
        "asset_type": asset_type,
        "status": status,
        "visibility": visibility,
        "title": asset_id,
        "style_version": "AFTERFALL_ARCHIVE_V1",
        "image_url": "https://example.invalid/image.webp",
        "source": {"canon_status": "CANON", "scene_id": "scene-1", "locations": ["Public hub"], "characters": ["player"]},
        "brief": {},
    }


if __name__ == "__main__":
    unittest.main()
