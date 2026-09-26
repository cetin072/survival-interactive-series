"""Read-only appearance parity and real-browser checks; no DB/provider/Canon writes.

The fingerprints below are an observed 2026-09-26 Supabase readback receipt,
not a claim of continuing live DB synchronization. New editorial changes must
have a new approval/readback, rather than automatically inventing source facts.
"""
from __future__ import annotations
import argparse
import functools
import hashlib
import http.server
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import threading
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'archive/content/characters/C03-AFTERFALL/APPEARANCE_BACKFILL_V1.json'
CANON = 'worldlines/AFTERFALL/CHARACTER_APPEARANCE_BACKFILL_V1.json'
READBACK = {
    '김성호': '8b9190f8b0a1f7e92539ae1270086c42',
    '문하진': '52ae1fd7a63b2c8c0e523afefab46dcd',
    '박재민': 'e2b4c234eec7696409f8731638a56439',
    '배철수': '451547b48bd1ea9d9d0e3aae5bfc7e19',
    '정민규': 'c176a1aa4ba52e5b6e35ce5145c7ff72',
    '최경희': 'a02c86119371193d18590b861c5551a6',
    '한지수': '626c0e7f4131c60bde5df85cdcade31f',
}
ROSTER = {
    'char-jinwoo': '서진우', 'char-seojin': '윤서진', 'char-eunchae': '최은채',
    'char-taehoon': '장태훈', 'char-hayoung': '신하영', 'char-yujin': '최유진',
    'char-mira': '한미라', 'char-minho': '박민호', 'char-hyerin': '강혜린',
    'char-jisu': '한지수', 'char-sehoon': '오세훈', 'char-doyoon': '김도윤',
    'char-hajin': '문하진', 'char-mingyu': '정민규', 'char-kyunghee': '최경희',
    'char-seongho': '김성호', 'char-cheolsu': '배철수', 'char-jaemin': '박재민',
}


def parity(ref: str):
    source = subprocess.check_output(['git', 'show', ref + ':' + CANON], cwd=ROOT)
    assert source == DATA.read_bytes(), 'Published approval differs from durable worldline source'
    data = json.loads(source)
    assert data['not_a_game_event'] and data['historical_raw_unchanged']
    assert set(READBACK) == {entry['character_id'] for entry in data['characters']}
    for entry in data['characters']:
        text = '\n'.join(key + '=' + json.dumps(value, ensure_ascii=False)
                         for key, value in sorted(entry['appearance_anchor'].items()))
        # Match the SQL jsonb_each key=C-collation receipt; not a security primitive.
        digest = hashlib.md5(text.encode()).hexdigest()
        assert digest == READBACK[entry['character_id']], entry['character_id'] + ' differs from DB readback'
    print('PASS: worldline/public JSON byte identity and all seven Supabase readback fingerprints', flush=True)


def browser_audit(base: str):
    from playwright.sync_api import expect, sync_playwright
    approved = {c['node_id']: c['public_description'] for c in json.loads(DATA.read_text())['characters']}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for width in [360, 390, 430, 1280]:
            context = browser.new_context(viewport={'width': width, 'height': 844}, has_touch=width < 700, is_mobile=width < 700)
            page = context.new_page()
            errors, failures = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda response: failures.append(str(response.status) + ' ' + response.url) if response.status >= 400 and response.url.startswith(base) else None)
            for node_id, name in ROSTER.items():
                page.goto(base.rstrip('/') + '/?' + urlencode({'view': 'archive', 'node': node_id}))
                expect(page.locator('.archive-detail-header h1')).to_have_text(name)
                row = page.locator('#detail-basics .detail-appearance')
                expect(row).to_have_count(1)
                expect(row.locator('dt')).to_have_text('외형')
                row.scroll_into_view_if_needed()
                expect(row.locator('dd')).to_be_visible()
                text = row.locator('dd').inner_text()
                assert len(text) > 40, name + ': missing appearance'
                assert '미설정' not in text and '백필 필요' not in text
                if node_id in approved:
                    expect(row.locator('dd')).to_have_text(approved[node_id])
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), name + ': horizontal overflow'
                if width == 390 and node_id in ['char-hajin', 'char-jisu']:
                    folder = ROOT / 'archive/appearance-qa'
                    folder.mkdir(exist_ok=True)
                    page.screenshot(path=str(folder / (node_id + '.png')))
            # Actual search selection, not only direct links, also shows appearance on one tap.
            page.goto(base)
            page.locator('.archive-search input').fill('문하진')
            result = page.locator('.result-list button').filter(has_text='문하진').first
            result.scroll_into_view_if_needed()
            result.tap() if width < 700 else result.click()
            expect(page.locator('.archive-detail-header h1')).to_have_text('문하진')
            expect(page.locator('#detail-basics .detail-appearance dd')).to_have_text(approved['char-hajin'])
            assert not errors, errors
            assert not failures, failures
            print(json.dumps({'width': width, 'profiles': 18, 'appearance_rows': 18, 'search_one_tap': True, 'runtime_errors': 0, 'result': 'PASS'}, ensure_ascii=False), flush=True)
            context.close()
        browser.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ref', default='origin/worldline/afterfall-rpg')
    parser.add_argument('--url')
    parser.add_argument('--wait-assets', action='store_true')
    parser.add_argument('--parity-only', action='store_true')
    args = parser.parse_args()
    parity(args.ref)
    if args.parity_only:
        return
    server = None
    base = args.url
    if not base:
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / 'archive/web/dist'))
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
    try:
        if args.wait_assets:
            spec = importlib.util.spec_from_file_location('reader_browser', ROOT / 'archive/scripts/check-reader-browser.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            module.wait_for_deploy(base)
        browser_audit(base)
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as out:
                out.write(f'\n### Character appearance: PASS\n{base}\n\n18 profiles x 4 viewport widths; seven exact approved descriptions; worldline bytes and DB receipt match. No runtime or same-site HTTP failures.\n')
    finally:
        if server:
            server.shutdown()


if __name__ == '__main__':
    main()
