# Archive content release manifest — G07

Each Vite production build writes `archive-release-manifest.json` into the public output directory. The manifest lists the three Reader BOOK JSON assets and the separately fingerprinted graph and character data chunks with byte lengths and SHA-256 hashes. `release_id` is the SHA-256 of the ordered manifest asset records, so it identifies this exact public content set.

The graph and character modules are split into distinct fingerprinted output files. `archive/scripts/check-reader-browser.py --url <site> --wait-assets` compares the deployed manifest with the tested build, downloads each listed asset, and verifies its byte length and SHA-256. The existing JavaScript/CSS filename check remains in place as an additional build fingerprint check.

Story JSON assets use LF line endings in every checkout so Windows local builds and Linux CI/Netlify builds produce identical content bytes. Transcript files remain under their existing byte-preservation rule.

This manifest identifies built content by its bytes. It is not an operational Publication Batch ID and does not prove source approval, Preview availability, branch protection, merge, or Production publication. Those checks remain separate release gates.
