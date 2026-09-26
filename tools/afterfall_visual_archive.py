"""Deterministic, provider-neutral AFTERFALL visual-archive helpers.

This module is deliberately outside the web-game runtime.  Trusted tooling may load
Canon-safe projections from Supabase and persist its returned assets, but this module
does not open a database connection, call a network service, or mutate game state.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Mapping, Protocol, Sequence


WORLDLINE_ID = "AFTERFALL"
STYLE_VERSION = "AFTERFALL_ARCHIVE_V1"
ASSET_TYPES = frozenset({"WORLD_MAP", "LOCATION", "CHARACTER", "EVENT"})
ASSET_STATUSES = frozenset(
    {
        "CANDIDATE",
        "WAITING_CANON",
        "READY",
        "GENERATING",
        "GENERATED",
        "PUBLISHED",
        "REJECTED",
        "SUPERSEDED",
        "ERROR",
    }
)
VISIBILITIES = frozenset({"PUBLIC_ARCHIVE", "PLAYER_ARCHIVE", "CORE_PRIVATE"})
CANON_STATUSES = frozenset({"CANON"})
ACTIVE_ASSET_STATUSES = frozenset(
    {"CANDIDATE", "WAITING_CANON", "READY", "GENERATING", "GENERATED", "PUBLISHED", "ERROR"}
)
PORTRAIT_FIELDS = frozenset(
    {"apparent_age", "height", "build", "face", "hair", "voice", "style", "distinctive"}
)
FORBIDDEN_PUBLIC_KEYS = (
    "hidden",
    "gm",
    "future",
    "secret",
    "coordinate",
    "withdrawal",
    "rear_base",
    "rear-route",
    "rear_route",
    "exact_location",
)

STYLE_PROFILES = {
    STYLE_VERSION: {
        "rendering": [
            "non-photorealistic",
            "illustrated painterly treatment",
            "realistic proportions",
            "believable Korean environments",
            "low-to-medium saturation",
            "lived-in survival environment",
        ],
        "avoid": [
            "embedded typography",
            "default zombie imagery",
            "cyberpunk",
            "glossy tactical-poster aesthetic",
        ],
    }
}


class VisualGenerationProvider(Protocol):
    """Future provider boundary. Implementations must not alter game/Canon input."""

    name: str
    model: str

    def generate(self, brief: Mapping[str, Any]) -> "GenerationResult": ...


@dataclass(frozen=True)
class GenerationResult:
    provider: str
    provider_model: str
    provider_asset_id: str | None
    image_url: str | None
    object_path: str | None
    metadata: Mapping[str, Any]


class FakeVisualGenerationProvider:
    """Deterministic test double; it intentionally performs no HTTP/API work."""

    name = "fake"
    model = "fake-visual-v1"

    def generate(self, brief: Mapping[str, Any]) -> GenerationResult:
        digest = _stable_token(str(brief), 16)
        return GenerationResult(
            provider=self.name,
            provider_model=self.model,
            provider_asset_id=f"fake-{digest}",
            image_url=f"https://example.invalid/visual-assets/{digest}.webp",
            object_path=f"fake/{digest}.webp",
            metadata={"stub": True},
        )


class FailingVisualGenerationProvider:
    """Test double for failure paths; it proves pipeline failures stay isolated."""

    name = "failing"
    model = "failing-visual-v1"

    def generate(self, brief: Mapping[str, Any]) -> GenerationResult:
        raise RuntimeError("intentional provider stub failure")


def _stable_token(value: str, length: int = 12) -> str:
    return sha256(value.encode("utf-8")).hexdigest()[:length].upper()


def _asset_id(kind: str, source_id: str) -> str:
    return f"AF-{kind}-{_stable_token(source_id)}"


def _text(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _safe_value(value: Any) -> Any:
    """Strip values that could carry hidden/future map or GM information."""

    if isinstance(value, Mapping):
        safe: dict[str, Any] = {}
        for key, nested in value.items():
            normalised = str(key).lower()
            if any(forbidden in normalised for forbidden in FORBIDDEN_PUBLIC_KEYS):
                continue
            safe[str(key)] = _safe_value(nested)
        return safe
    if isinstance(value, list):
        return [_safe_value(item) for item in value]
    if isinstance(value, tuple):
        return [_safe_value(item) for item in value]
    return value


def appearance_anchor_is_sufficient(anchor: Any) -> bool:
    if not isinstance(anchor, Mapping):
        return False
    filled = 0
    for field in PORTRAIT_FIELDS:
        value = anchor.get(field)
        if isinstance(value, str) and value.strip():
            filled += 1
        elif isinstance(value, (list, tuple)) and any(_text(item) for item in value):
            filled += 1
    return filled >= 4


def _has_active_master_portrait(character_id: str, assets: Sequence[Mapping[str, Any]]) -> bool:
    for asset in assets:
        source = asset.get("source", {})
        if (
            asset.get("asset_type") == "CHARACTER"
            and asset.get("status") in ACTIVE_ASSET_STATUSES
            and isinstance(source, Mapping)
            and source.get("character_id") == character_id
            and source.get("portrait_kind", "MASTER") == "MASTER"
        ):
            return True
    return False


def _candidate_asset(
    *, asset_id: str, asset_type: str, title: str, visibility: str, source: Mapping[str, Any], brief: Mapping[str, Any]
) -> dict[str, Any]:
    asset = {
        "worldline_id": WORLDLINE_ID,
        "asset_id": asset_id,
        "asset_type": asset_type,
        "status": "CANDIDATE",
        "visibility": visibility,
        "title": title,
        "style_version": STYLE_VERSION,
        "source": _safe_value(source),
        "brief": _safe_value(brief),
    }
    validate_visual_asset(asset)
    return asset


def compile_visual_candidates(
    snapshot: Mapping[str, Any], existing_assets: Sequence[Mapping[str, Any]] = ()
) -> list[dict[str, Any]]:
    """Propose, but never persist, candidates from Canon-safe source projections.

    The caller passes only `saves.state.bases`, `characters.known_facts`, Canon scenes,
    and Canon events. `saves.gm_state`, `characters.hidden_state`, and raw map topology
    are intentionally not accepted by this contract.
    """

    if snapshot.get("worldline_id") != WORLDLINE_ID:
        raise ValueError("AFTERFALL compiler accepts only AFTERFALL projections")

    known_ids = {str(asset.get("asset_id")) for asset in existing_assets}
    candidates: list[dict[str, Any]] = []

    # WORLD_MAP is a singleton controlled by AF-MAP-001. Never create a duplicate map.
    for character in snapshot.get("characters", []):
        character_id = _text(character.get("character_id"))
        tier = _text(character.get("tier"))
        if not character_id or not character.get("active", False) or tier not in {"PLAYER", "CORE", "MAJOR", "MAJOR_RECURRING"}:
            continue
        asset_id = _asset_id("CHAR", character_id)
        if asset_id in known_ids or _has_active_master_portrait(character_id, existing_assets):
            continue
        facts = character.get("known_facts", {})
        facts = facts if isinstance(facts, Mapping) else {}
        anchor = facts.get("appearance_anchor", {})
        title = f"{_text(character.get('display_name')) or character_id} — Master Portrait"
        candidates.append(
            _candidate_asset(
                asset_id=asset_id,
                asset_type="CHARACTER",
                title=title,
                visibility="PLAYER_ARCHIVE",
                source={
                    "kind": "CHARACTER",
                    "character_id": character_id,
                    "canon_status": "CANON",
                    "portrait_kind": "MASTER",
                    "appearance_anchor_sufficient": appearance_anchor_is_sufficient(anchor),
                },
                brief=build_visual_brief(
                    "CHARACTER",
                    subject=_text(character.get("display_name")) or character_id,
                    character_facts=facts,
                ),
            )
        )

    for base in snapshot.get("bases", []):
        base_id = _text(base.get("id"))
        name = _text(base.get("name"))
        visibility = _text(base.get("visibility"))
        if not base_id or not name or base.get("status") not in {"ACTIVE", "ACTIVE_LEAN_STAFF"}:
            continue
        # An explicit player/public visibility is required; unknown visibility is fail-closed.
        if visibility not in {"PUBLIC", "PUBLIC_WORK_HUB", "LIMITED_SEMI_PRIVATE"}:
            continue
        asset_id = _asset_id("LOC", base_id)
        if asset_id in known_ids:
            continue
        archive_visibility = "PUBLIC_ARCHIVE" if visibility in {"PUBLIC", "PUBLIC_WORK_HUB"} else "PLAYER_ARCHIVE"
        candidates.append(
            _candidate_asset(
                asset_id=asset_id,
                asset_type="LOCATION",
                title=name,
                visibility=archive_visibility,
                source={
                    "kind": "BASE",
                    "base_id": base_id,
                    "canon_status": _text(base.get("canon_status")) or "UNCONFIRMED",
                    "visual_stable": base.get("visual_stable") is True,
                    "locations": [name],
                },
                brief=build_visual_brief("LOCATION", subject=name, location_facts=base),
            )
        )

    events_by_id = {
        str(event.get("id")): event
        for event in snapshot.get("events", [])
        if event.get("canon_status") in CANON_STATUSES
    }
    for scene in snapshot.get("scenes", []):
        scene_id = _text(scene.get("scene_id"))
        if not scene_id or scene.get("canon_status") not in CANON_STATUSES:
            continue
        if not _text(scene.get("key_image")) or not _text(scene.get("outcome_summary")):
            continue
        event_ids = [str(event_id) for event_id in scene.get("source_event_ids", [])]
        linked_events = [events_by_id[event_id] for event_id in event_ids if event_id in events_by_id]
        if not _scene_is_important(scene, linked_events):
            continue
        asset_id = _asset_id("EVT", scene_id)
        if asset_id in known_ids:
            continue
        candidates.append(
            _candidate_asset(
                asset_id=asset_id,
                asset_type="EVENT",
                title=_text(scene.get("title")) or scene_id.replace("_", " ").title(),
                visibility="PLAYER_ARCHIVE",
                source={
                    "kind": "SCENE",
                    "scene_id": scene_id,
                    "canon_status": "CANON",
                    "source_event_ids": event_ids,
                    "game_time": _text(scene.get("game_time")),
                    "locations": [_text(scene.get("location"))] if _text(scene.get("location")) else [],
                    "characters": [item for item in scene.get("participants", []) if _text(item)],
                    "summary": _text(scene.get("outcome_summary")),
                },
                brief=build_visual_brief(
                    "EVENT",
                    subject=_text(scene.get("key_image")) or scene_id,
                    location_facts={"location": _text(scene.get("location"))},
                    canon_facts={"outcome_summary": _text(scene.get("outcome_summary"))},
                ),
            )
        )
    return candidates


def _scene_is_important(scene: Mapping[str, Any], linked_events: Sequence[Mapping[str, Any]]) -> bool:
    """A key image alone is intentionally insufficient to create an EVENT candidate."""

    if not linked_events:
        return False
    high_signal_tags = {"BASE_RECONFIGURATION", "SEASON", "CHARACTER", "WORLD_MAP", "FACTION", "QUEST"}
    for event in linked_events:
        if event.get("event_class") in {"SEASON", "WORLD", "FACTION", "CHARACTER", "BASE", "QUEST"}:
            return True
        if high_signal_tags.intersection({str(tag) for tag in event.get("tags", [])}):
            return True
    return False


def ready_gate(asset: Mapping[str, Any], *, map_canon: Mapping[str, bool] | None = None) -> tuple[str, str]:
    """Return a safe lifecycle decision without mutating the asset or its sources."""

    asset_type = asset.get("asset_type")
    source = asset.get("source", {})
    source = source if isinstance(source, Mapping) else {}
    if asset_type == "WORLD_MAP":
        required = (
            "third_hub_expansion_settled",
            "front_living_structure_settled",
            "northwest_fallback_role_settled",
            "public_security_layer_settled",
        )
        if map_canon and all(map_canon.get(item) is True for item in required):
            return "READY", "all explicit map Canon and public security gates passed"
        return "WAITING_CANON", "world map requires all explicit Canon and public-security gates"
    if asset_type == "CHARACTER":
        if source.get("canon_status") in CANON_STATUSES and source.get("appearance_anchor_sufficient") is True:
            return "READY", "active eligible character has sufficient Canon appearance anchors"
        return "WAITING_CANON", "character needs at least four Canon appearance anchors"
    if asset_type == "LOCATION":
        if source.get("canon_status") in CANON_STATUSES and source.get("visual_stable") is True:
            return "READY", "active location has explicitly stable Canon role and presentation"
        return "WAITING_CANON", "location role or visual presentation is not explicitly stable Canon"
    if asset_type == "EVENT":
        if source.get("canon_status") in CANON_STATUSES:
            return "READY", "important event is already Canon"
        return "WAITING_CANON", "event is not Canon"
    raise ValueError(f"unsupported asset type: {asset_type}")


def apply_ready_gate(asset: Mapping[str, Any], *, map_canon: Mapping[str, bool] | None = None) -> dict[str, Any]:
    if asset.get("status") not in {"CANDIDATE", "WAITING_CANON"}:
        raise ValueError("only CANDIDATE or WAITING_CANON assets may pass the READY gate")
    status, reason = ready_gate(asset, map_canon=map_canon)
    next_asset = deepcopy(dict(asset))
    next_asset["status"] = status
    next_asset["generation_meta"] = {**dict(next_asset.get("generation_meta", {})), "ready_gate_reason": reason}
    validate_visual_asset(next_asset)
    return next_asset


def build_visual_brief(
    asset_type: str,
    *,
    subject: str,
    character_facts: Mapping[str, Any] | None = None,
    location_facts: Mapping[str, Any] | None = None,
    canon_facts: Mapping[str, Any] | None = None,
    season: str | None = None,
    weather: str | None = None,
    mood: str | None = None,
    composition_intent: str | None = None,
) -> dict[str, Any]:
    if asset_type not in ASSET_TYPES:
        raise ValueError(f"unsupported asset type: {asset_type}")
    character_facts = character_facts or {}
    location_facts = location_facts or {}
    canon_facts = canon_facts or {}
    appearance = character_facts.get("appearance_anchor", {}) if isinstance(character_facts, Mapping) else {}
    brief = {
        "asset_type": asset_type,
        "subject": subject,
        "canon_safe_visual_facts": {
            "appearance_anchor": _safe_value(appearance) if isinstance(appearance, Mapping) else {},
            "presence": _safe_value(character_facts.get("presence", [])),
            "location": _safe_value(
                {key: location_facts.get(key) for key in ("name", "location", "type", "role", "status", "heating") if key in location_facts}
            ),
            "event": _safe_value({"outcome_summary": canon_facts.get("outcome_summary")}),
        },
        "season": season,
        "weather": weather,
        "mood": mood or "quiet, lived-in survival atmosphere",
        "composition_intent": composition_intent or "environment storytelling; no embedded text",
        "style_version": STYLE_VERSION,
        "avoid_rules": STYLE_PROFILES[STYLE_VERSION]["avoid"],
    }
    # WORLD_MAP topology is a separate deterministic renderer input, never a visual brief field.
    if asset_type == "WORLD_MAP":
        brief["map_visual_layer_only"] = True
    return _safe_value(brief)


def split_map_rendering_contract(topology: Mapping[str, Any], visual_context: Mapping[str, Any]) -> dict[str, Any]:
    """Keep deterministic nodes/edges/distances out of the generation brief."""

    return {
        "deterministic_topology": deepcopy(dict(topology)),
        "visual_brief": build_visual_brief("WORLD_MAP", subject="AFTERFALL map", canon_facts=visual_context),
    }


def run_generation(asset: Mapping[str, Any], provider: VisualGenerationProvider) -> dict[str, Any]:
    """Return a new registry record; never mutate the input or any Canon projection."""

    if asset.get("status") != "READY":
        raise ValueError("only READY visual assets may be sent to a provider")
    result_asset = deepcopy(dict(asset))
    try:
        result = provider.generate(result_asset.get("brief", {}))
    except Exception as error:  # Provider errors are visual-pipeline errors, not game errors.
        result_asset.update({"status": "ERROR", "error_text": str(error)})
        validate_visual_asset(result_asset)
        return result_asset
    result_asset.update(
        {
            "status": "GENERATED",
            "provider": result.provider,
            "provider_model": result.provider_model,
            "provider_asset_id": result.provider_asset_id,
            "image_url": result.image_url,
            "object_path": result.object_path,
            "generation_meta": _safe_value(dict(result.metadata)),
            "error_text": None,
        }
    )
    validate_visual_asset(result_asset)
    return result_asset


def build_public_manifest(assets: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    return _build_manifest(assets, allowed_visibilities={"PUBLIC_ARCHIVE"})


def build_player_manifest(assets: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    return _build_manifest(assets, allowed_visibilities={"PUBLIC_ARCHIVE", "PLAYER_ARCHIVE"})


def _build_manifest(assets: Sequence[Mapping[str, Any]], *, allowed_visibilities: set[str]) -> list[dict[str, Any]]:
    manifest: list[dict[str, Any]] = []
    for asset in assets:
        source = asset.get("source", {})
        source = source if isinstance(source, Mapping) else {}
        if asset.get("status") != "PUBLISHED" or asset.get("visibility") not in allowed_visibilities:
            continue
        if source.get("canon_status", "CANON") not in CANON_STATUSES:
            continue
        manifest.append(
            {
                "asset_id": asset.get("asset_id"),
                "type": asset.get("asset_type"),
                "status": asset.get("status"),
                "visibility": asset.get("visibility"),
                "title": asset.get("title"),
                "image_url": asset.get("image_url"),
                "game_time": source.get("game_time"),
                "summary": source.get("summary"),
                "locations": list(source.get("locations", [])),
                "characters": list(source.get("characters", [])),
                "related_scene_id": source.get("scene_id"),
                "style_version": asset.get("style_version"),
            }
        )
    return manifest


def validate_visual_asset(asset: Mapping[str, Any]) -> None:
    """Small dependency-free validator matching schemas/visual_asset.schema.json."""

    required = {"worldline_id", "asset_id", "asset_type", "status", "visibility", "title", "style_version", "source", "brief"}
    missing = required.difference(asset)
    if missing:
        raise ValueError(f"asset misses required fields: {sorted(missing)}")
    if asset["asset_type"] not in ASSET_TYPES or asset["status"] not in ASSET_STATUSES or asset["visibility"] not in VISIBILITIES:
        raise ValueError("asset has an invalid type, status, or visibility")
    if not _text(asset["worldline_id"]) or not _text(asset["asset_id"]) or not _text(asset["title"]) or not _text(asset["style_version"]):
        raise ValueError("asset identity and title fields must be non-empty strings")
    if not isinstance(asset["source"], Mapping) or not isinstance(asset["brief"], Mapping):
        raise ValueError("source and brief must be objects")
