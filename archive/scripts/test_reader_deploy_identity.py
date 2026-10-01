from __future__ import annotations
import subprocess
import tempfile
import unittest
from pathlib import Path
from reader_deploy_identity import deployed_revision_matches

def git(root, *args):
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()

class DeployRevisionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        git(self.root, "init", "-q")
        git(self.root, "config", "user.name", "test")
        git(self.root, "config", "user.email", "test@example.invalid")
        for directory in ("archive/web", "archive/content", "archive/scripts", "knowledge", "worldlines"):
            (self.root / directory).mkdir(parents=True, exist_ok=True)
        (self.root / "archive/web/app.txt").write_text("app-v1")
        (self.root / "archive/content/book.json").write_text("book-v1")
        (self.root / "archive/scripts/build.mjs").write_text("build-v1")
        (self.root / "knowledge/brief.json").write_text("brief-v1")
        (self.root / "worldlines/state.json").write_text("state-v1")
        (self.root / "docs.txt").write_text("first")
        git(self.root, "add", ".")
        git(self.root, "commit", "-qm", "site source")
        self.deployed = git(self.root, "rev-parse", "HEAD")

    def tearDown(self):
        self.temp.cleanup()

    def commit(self, path, content, message):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        git(self.root, "add", path)
        git(self.root, "commit", "-qm", message)
        return git(self.root, "rev-parse", "HEAD")

    def test_exact_deploy_revision_passes_without_fallback(self):
        self.assertTrue(deployed_revision_matches(self.deployed, self.deployed, cwd=str(self.root)))

    def test_ancestor_with_identical_site_inputs_passes_preview_fallback(self):
        head = self.commit("docs.txt", "second", "docs only")
        self.assertTrue(deployed_revision_matches(
            self.deployed, head, allow_ancestor_equivalent=True, cwd=str(self.root)))

    def test_ancestor_with_changed_site_input_fails_preview_fallback(self):
        head = self.commit("archive/web/app.txt", "app-v2", "site change")
        self.assertFalse(deployed_revision_matches(
            self.deployed, head, allow_ancestor_equivalent=True, cwd=str(self.root)))

    def test_mismatched_revision_fails_without_preview_fallback(self):
        head = self.commit("docs.txt", "second", "docs only")
        self.assertFalse(deployed_revision_matches(self.deployed, head, cwd=str(self.root)))

    def test_unrelated_revision_fails_preview_fallback(self):
        git(self.root, "checkout", "--orphan", "other")
        (self.root / "other.txt").write_text("other")
        git(self.root, "add", ".")
        git(self.root, "commit", "-qm", "unrelated")
        unrelated = git(self.root, "rev-parse", "HEAD")
        git(self.root, "checkout", "-q", self.deployed)
        self.assertFalse(deployed_revision_matches(
            unrelated, self.deployed, allow_ancestor_equivalent=True, cwd=str(self.root)))

if __name__ == "__main__":
    unittest.main()