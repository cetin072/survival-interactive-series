# Archive content loading audit (G09)

## Runtime contract

- The application shell eagerly loads the Chronicle registry and `BOOK.index.json` metadata only. Index chapters preserve IDs, titles, order, seasons/parts, and graph links without carrying Reader prose.
- Opening a Reader fetches only that Chronicle's generated `BOOK.json` asset. Vite fingerprints the JSON asset, so the loaded book stays tied to the application build that referenced it.
- RAW catalog entries contain metadata and a fingerprinted URL. The selected `.md` is fetched on demand; missing-transcript placeholders have no content request. Successful reads are cached by stable PART ID; failed fetches are evicted so Retry starts a new request.
- RAW assets use `?url&no-inline`, preventing short records from being embedded in the startup JavaScript.
- Loading, empty/missing, and error/retry states remain distinct. Explicit chapter/PART route selection remains ahead of optional local-storage bookmarks.

## Same-condition initial transfer comparison

Built the `main` base SHA `1da3cd03f27b1c072a98a108311223b62055b8a3` and this worktree with the same locked package versions, Node runtime, and Vite production build. Vite's gzip report for the initial JavaScript changed as follows:

| Build | Initial JS (gzip) | Initial JS + CSS (gzip) |
| --- | ---: | ---: |
| Base `main` | 1,036.23 KiB | 1,042.60 KiB |
| Lazy loading | 103.04 KiB | 109.43 KiB |
| Change | -933.19 KiB (-90.1%) | -933.17 KiB (-89.5%) |

The prior eager inputs contained 1,406,424 bytes across three BOOK files and 1,712,321 bytes across 83 RAW Markdown files. They are no longer in the initial application chunk. Reader prose remains available in separately fingerprinted per-Chronicle assets; RAW stays in separately fingerprinted per-PART assets.

These are production-build gzip sizes, not measurements from a physical mobile device or a compressed Netlify response. The browser audit separately checks that startup requests contain no BOOK body asset or RAW file, a book route requests one Chronicle JSON asset, and RAW navigation requests one selected PART at a time. It injects one failed request for each content type and verifies Retry succeeds.

## Keyboard graph access

Graph nodes retain their button role and tab stop. Enter and Space now activate the focused node; Space prevents page scrolling. Focus-visible styling is applied to the node ring. The browser audit exercises both keys.
