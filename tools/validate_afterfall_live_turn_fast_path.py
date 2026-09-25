"""Smoke-check the authoritative AFTERFALL live-turn fast-path contract."""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_MARKERS = {
    "worldlines/AFTERFALL/LIVE_TURN_FAST_PATH_V1.md": (
        "get_scene_context()",
        "append_public_transcript_turn(...)",
        "`get_gm_context()`",
        "GitHub, Archive publication, Reader build,\nNetlify deploy는 normal turn path에 넣지 않는다.",
        "save-before-emit",
    ),
    "worldlines/AFTERFALL/PLAY_SESSION_PROTOCOL_V3.md": (
        "exact USER text",
        "USER = p_user_message_order",
        "stable USER idempotency UUID",
    ),
    "worldlines/AFTERFALL/BOOT.md": (
        "LIVE_TURN_FAST_PATH_V1.md",
        "check_runtime_consistency",
        "append_public_transcript_turn(...)",
    ),
    "worldlines/AFTERFALL/GM_CONTEXT_V1.md": (
        "## Same-scene reuse",
        "full Save, 모든 Character, 전체 Event 또는 `get_gm_context()`를 다시 조립하지",
    ),
    "worldlines/AFTERFALL/CHARACTER_VISUAL_RULE_V1.md": (
        "## 10. Existing character visual backfill",
        "전 인물 목록을 매 turn 감사하지 않는다.",
    ),
}


def main() -> None:
    failures = []
    for relative_path, markers in REQUIRED_MARKERS.items():
        content = (ROOT / relative_path).read_text(encoding="utf-8")
        missing = [marker for marker in markers if marker not in content]
        if missing:
            failures.append(f"{relative_path}: missing {', '.join(missing)}")
        else:
            print(f"OK:   {relative_path}")

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        sys.exit(1)

    print("AFTERFALL live-turn fast-path contract smoke checks passed.")


if __name__ == "__main__":
    main()
