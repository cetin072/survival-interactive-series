# C03 서진우 / AFTERFALL — Historical Transcript Manifest

Chronicle: **C03 서진우 / AFTERFALL**
Primary source root: `worldlines/AFTERFALL/**`
Audited source ref: `origin/worldline/afterfall-rpg` at `f78c76b`
Public safety: only directly verified public USER/GM text was copied. No Canon,
checkpoint, event, state, or summary material is presented as dialogue.

| Season / range | Verification | Source | Notes |
| --- | --- | --- | --- |
| S01, directly visible span | `PARTIAL` | `worldlines/AFTERFALL/seasons/S01/raw_transcript/PART_C03_001.md` … `010.md` | 39 USER and 86 pushed GM messages. The pre-capture span and one later GM reply remain explicit gaps; PART 008 is a verified fragment. |
| S02, SESSION_001 | `PARTIAL` | `worldlines/AFTERFALL/seasons/S02/raw_transcript/SESSION_001/` | 31 USER / 89 GM public blocks, from the industrial-fire response to the source cutoff. |
| S02, SESSION_002 | `PARTIAL` | `worldlines/AFTERFALL/seasons/S02/raw_transcript/SESSION_002/` | 13 USER / 16 GM public blocks, from the first-winter discussion to the source cutoff. |
| S02, SESSION_003–004 | `PARTIAL_CAPTURE_INCOMPLETE_PAIRING` | `survival_rpg.transcript_messages` → durable S02 archive | One GM-only and one USER-only capture are retained as incomplete fragments; no counterpart is reconstructed. |
| S02, SESSION_005–009 | `PARTIAL / VERIFIED DB SPANS` | `survival_rpg.transcript_messages` → durable S02 archive | Exact public USER→GM captures through the 2027-03-23 17:50 / save 253 finale. The season remains PARTIAL because earlier source-room gaps remain. |

S02 session namespaces are retained separately. Their small exact USER overlap
does not justify deduplication, and no GM public block overlaps. The Reader may
show a separately marked Canon summary, but never reconstructed USER/GM dialogue.

The published S02 `INDEX.md` and `MANIFEST.json` retain per-session provenance,
message hashes, capture status, and deterministic reading order. RAW Vault keeps
incomplete captures distinct from verified transcript spans; Reader Edition only
uses the atomically paired, verified GM prose.
