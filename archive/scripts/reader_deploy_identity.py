"""Deployment revision checks for the Archive Preview browser audit."""
from __future__ import annotations
import re
import subprocess

_SHA = re.compile(r"^[a-f0-9]{40}$")
_SITE_INPUTS = ("archive/web", "archive/content", "archive/scripts", "knowledge", "worldlines")

def deployed_revision_matches(deployed_ref, expected_ref, *, allow_ancestor_equivalent=False, cwd=None):
    """Accept an exact deploy or a verified ancestor with identical site inputs.

    The ancestor fallback is only for Deploy Preview: Netlify can keep serving a
    successfully tested prior commit when a later commit changes no site inputs
    and its build is canceled as having no content changes. Production does not
    enable this fallback.
    """
    if not _SHA.fullmatch(deployed_ref or "") or not _SHA.fullmatch(expected_ref or ""):
        return False
    if deployed_ref == expected_ref:
        return True
    if not allow_ancestor_equivalent:
        return False
    ancestor = subprocess.run(
        ["git", "merge-base", "--is-ancestor", deployed_ref, expected_ref],
        cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    if ancestor.returncode != 0:
        return False
    same_inputs = subprocess.run(
        ["git", "diff", "--quiet", deployed_ref, expected_ref, "--", *_SITE_INPUTS],
        cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    return same_inputs.returncode == 0