# Editorial V2 offline QA preview

K-015 and K-018 in `knowledge/editorial-review/` are **unapproved editorial proposals**. Their existing Operator review items still refer to the earlier semantic results and PR heads. Do not use an approval of either existing Operator payload as approval of the V2 text.

Generate static review screens outside the repository:

```powershell
node archive/scripts/build-knowledge-editorial-qa-preview.mjs
```

The command prints the new local output directory. Open `K-015.editorial-v2.qa.html` or `K-018.editorial-v2.qa.html` from that directory in a local browser. For mobile review, set the browser viewport to 390px. No server, database write, Operator login, or public deploy is required.

Each screen uses the same Knowledge article renderer and CSS as the public site. A persistent label identifies the Brief and the first twelve characters of the proposal SHA-256. The full proposal file SHA-256, original Job ID, original PR number and head, and original semantic result SHA-256 appear above the article. The page says that it is unpublished and unapproved. It has no approval controls or executable JavaScript; its content security policy blocks network-loaded assets. `manifest.json` records the complete bindings.

The generator rejects output inside the repository and refuses to overwrite a nonempty output directory. These local HTML files are QA artifacts, not review-item revisions. A separately audited handoff is required before the Operator review target may point to revised text.
