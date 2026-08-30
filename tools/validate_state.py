from pathlib import Path
import json
import sys

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def validate_file(data_path: Path, schema_path: Path):
    data = load_json(data_path)
    schema = load_json(schema_path)
    validator = Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
    return data, errors


def normalized_phase(gm_state):
    phase = gm_state.get("final_world_phase")
    if phase:
        return phase
    phase = gm_state.get("world_phase")
    if isinstance(phase, str):
        return phase
    if isinstance(phase, dict):
        return phase.get("current")
    return None


def main():
    failed = False

    base_checks = [
        (ROOT / "core/CHARACTERS.json", ROOT / "schemas/character.schema.json"),
        (ROOT / "players/main/SAVE_STATE.json", ROOT / "schemas/save.schema.json"),
    ]

    loaded = {}

    for data_path, schema_path in base_checks:
        try:
            data, errors = validate_file(data_path, schema_path)
            loaded[data_path.name] = data
            if errors:
                failed = True
                print(f"FAIL: {data_path.relative_to(ROOT)}")
                for error in errors:
                    location = ".".join(str(x) for x in error.path) or "<root>"
                    print(f"  - {location}: {error.message}")
            else:
                print(f"OK:   {data_path.relative_to(ROOT)}")
        except Exception as exc:
            failed = True
            print(f"ERROR: {data_path.relative_to(ROOT)}: {exc}")

    save = loaded.get("SAVE_STATE.json")
    if save:
        season_id = save.get("season_id")
        if season_id:
            gm_path = ROOT / "seasons" / season_id / "GM_STATE.json"
            if gm_path.exists():
                try:
                    gm, errors = validate_file(gm_path, ROOT / "schemas/gm_state.schema.json")
                    if errors:
                        failed = True
                        print(f"FAIL: {gm_path.relative_to(ROOT)}")
                        for error in errors:
                            location = ".".join(str(x) for x in error.path) or "<root>"
                            print(f"  - {location}: {error.message}")
                    else:
                        print(f"OK:   {gm_path.relative_to(ROOT)}")

                    if gm.get("season_id") != season_id:
                        failed = True
                        print("FAIL: cross-file season_id mismatch")

                    save_phase = save.get("world_phase")
                    gm_phase = normalized_phase(gm)
                    if save_phase and gm_phase and save_phase != gm_phase:
                        failed = True
                        print(
                            "FAIL: cross-file world phase mismatch: "
                            f"SAVE={save_phase} GM={gm_phase}"
                        )
                    elif save_phase and gm_phase:
                        print(f"OK:   cross-file world phase = {save_phase}")

                    save_completed = "completed" in str(save.get("season_status", "")).lower()
                    gm_completed = "completed" in str(gm.get("status", "")).lower()
                    if save_completed != gm_completed:
                        failed = True
                        print(
                            "FAIL: cross-file completion status mismatch: "
                            f"SAVE={save.get('season_status')} GM={gm.get('status')}"
                        )
                    else:
                        print("OK:   cross-file completion status")
                except Exception as exc:
                    failed = True
                    print(f"ERROR: {gm_path.relative_to(ROOT)}: {exc}")
            else:
                print(f"INFO: no GM_STATE for current season {season_id}")

    if failed:
        sys.exit(1)

    print("All current survival-series runtime state checks passed.")


if __name__ == "__main__":
    main()
