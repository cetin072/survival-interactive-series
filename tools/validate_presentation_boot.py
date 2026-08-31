"""Smoke-check the documentation contract for personal-play MUD presentation."""

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_MARKERS = {
    "runtime/GM_KERNEL.md": (
        "Personal Play Runtime Invariant",
        "MUD_TEXT_V1",
        "plain prose only",
        "Scene Header",
        "숫자로 제시",
        "재구성",
    ),
    "START_HERE.md": (
        "PRESENTATION GATE",
        "MUD_TEXT_V1",
        "첫 Scene Header",
        "숫자 선택지",
        "plain prose only",
        "BOOT GATE → WORLD/STATE GATE → PRESENTATION GATE → first scene",
    ),
    "runtime/LOAD_MAP.md": (
        "MUD 사용 여부를 결정하는 문서가 아니다",
        "Invariant로 이미 활성화되어 있다",
        "세부 스타일",
    ),
    "docs/SEASON_COMPLETION_PIPELINE.md": (
        "presentation_profile: MUD_TEXT_V1",
        "START_HANDOFF",
    ),
}


def main() -> None:
    failures = []

    for relative_path, markers in REQUIRED_MARKERS.items():
        path = ROOT / relative_path
        content = path.read_text(encoding="utf-8")
        missing = [marker for marker in markers if marker not in content]
        if missing:
            failures.append(f"{relative_path}: missing {', '.join(missing)}")
        else:
            print(f"OK:   {relative_path}")

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        sys.exit(1)

    print("Presentation boot contract smoke checks passed.")


if __name__ == "__main__":
    main()
