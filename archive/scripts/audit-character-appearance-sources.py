"""Read-only, source-first appearance audit. Never creates Canon or rewrites RAW.

Run with an optional fetched AFTERFALL ref. Results are review candidates, not
automatic attribution: nearby descriptions may belong to somebody else.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
NAMES = ['문하진', '정민규', '최경희', '김성호', '배철수', '박재민', '한지수']
VISUAL = re.compile(r'외모|외형|체형|눈매|머리|턱|안경|어깨|이마|코선|키[가는 ]|cm|[23456]0대|남자|여자|남성|여성|얼굴|손등|점퍼|조끼|수염|흉터')

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).decode('utf-8')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ref')
    args = parser.parse_args()
    sources = []
    for path in sorted((ROOT / 'archive/content/transcripts/C03-AFTERFALL').rglob('PART*.md')):
        sources.append((str(path.relative_to(ROOT)), path.read_text()))
    if args.ref:
        for path in git('ls-tree', '-r', '--name-only', args.ref, 'worldlines/AFTERFALL').splitlines():
            if ('/raw_transcript/' in path and Path(path).name.startswith('PART') and path.endswith('.md')) or Path(path).name in ['CHARACTER_BIBLE.md', 'PERSISTENT_CANON.md']:
                sources.append((args.ref + ':' + path, git('show', args.ref + ':' + path)))
    unique = {}
    for path, body in sources:
        digest = hashlib.sha256(body.encode()).hexdigest()
        unique.setdefault(digest, (path, body))
    print(json.dumps({'source_files': len(sources), 'unique_bodies': len(unique), 'names': NAMES}, ensure_ascii=False))
    for name in NAMES:
        hits, seen = [], set()
        for path, body in unique.values():
            lines = body.splitlines()
            previous_end = -1
            for index, line in enumerate(lines):
                if name not in line or index <= previous_end:
                    continue
                start, end = max(0, index - 22), min(len(lines), index + 32)
                text = '\n'.join(lines[start:end])
                if not VISUAL.search(text):
                    continue
                digest = hashlib.sha256(text.encode()).hexdigest()
                if digest in seen:
                    continue
                seen.add(digest)
                previous_end = end - 1
                # Appearance-forward sections outrank generic people in a meeting.
                score = len(VISUAL.findall(text)) + 12 * len(re.findall(r'cm|외모|외형|눈매|체형|[23456]0대', text))
                hits.append((score, path, start + 1, end, text))
        print('\n=== ' + name + ' | candidate windows: ' + str(len(hits)) + ' ===')
        for score, path, start, end, text in sorted(hits, key=lambda h: -h[0])[:18]:
            print(f'\nSOURCE {path} L{start}-L{end} SCORE {score}\n{text}')

if __name__ == '__main__':
    main()
