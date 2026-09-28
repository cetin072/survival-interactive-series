"""Offline tests for immutable illustration handoff request resolution."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "resolver", ROOT / "archive/scripts/resolve_illustration_handoff_request.py"
)
resolver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resolver)


class IllustrationHandoffRequestTests(unittest.TestCase):
    def test_normalized_dispatch_values(self):
        result = resolver.normalized(
            "398483895",
            "f" * 40,
            "archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_BAEKUN.json",
        )
        self.assertEqual(result["release_id"], "398483895")
        self.assertEqual(result["source_commit"], "f" * 40)

    def test_bad_identity_path_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "HANDOFF_REQUEST_IDENTITY_PATH_INVALID"):
            resolver.normalized("1", "a" * 40, "../../secret.json")

    def test_request_shape_is_strict(self):
        with tempfile.TemporaryDirectory(dir=ROOT / "archive/automation") as directory:
            path = Path(directory) / "request.json"
            path.write_text(json.dumps({
                "version": resolver.REQUEST_VERSION,
                "release_id": 1,
                "source_commit": "a" * 40,
                "identity_path": "archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_BAEKUN.json",
                "unexpected": True,
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "HANDOFF_REQUEST_PATH_INVALID"):
                resolver.from_request(path)

    def test_checked_in_request_resolves(self):
        path = ROOT / "archive/automation/illustration-handoff-requests/test-request.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            path.write_text(json.dumps({
                "version": resolver.REQUEST_VERSION,
                "release_id": 398483895,
                "source_commit": "a" * 40,
                "identity_path": "archive/content/visuals/C03-AFTERFALL/ILLUSTRATION_E2E_BAEKUN.json",
            }), encoding="utf-8")
            result = resolver.from_request(path)
            self.assertEqual(result["release_id"], "398483895")
            self.assertEqual(result["request_path"], path.relative_to(ROOT).as_posix())
        finally:
            path.unlink(missing_ok=True)
            path.parent.rmdir()


if __name__ == "__main__":
    unittest.main()
