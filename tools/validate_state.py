from pathlib import Path
import json
import sys

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]

CHECKS = [
    (ROOT / "core/CHARACTERS.json", ROOT / "schemas/character.schema.json"),
    (ROOT / "players/main/SAVE_STATE.json", ROOT / "schemas/save.schema.json"),
    (ROOT / "seasons/S01/GM_STATE.json", ROOT / "schemas/gm_state.schema.json"),
]


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main():
    failed = False

    for data_path, schema_path in CHECKS:
        try:
            data = load_json(data_path)
            schema = load_json(schema_path)
            validator = Draft202012Validator(schema)
            errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))

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

    if failed:
        sys.exit(1)

    print("All survival-series state files are valid.")


if __name__ == "__main__":
    main()
