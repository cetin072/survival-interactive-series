"""Chromium regression audit of the real built Archive, or its Preview/production URL.

No RAW/Canon writes, external API credentials, or site mutations. Browser storage
is isolated test data. Install playwright==1.55.0 and its Chromium browser first.
"""
from __future__ import annotations
import argparse
import functools
import http.server
import json
import os
from pathlib import Path
import re
import threading
import time
import urllib.request
from urllib.parse import parse_qs, urlencode, urlparse
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / 'archive/web/dist'
BOOKS = {name: json.loads((ROOT / f'archive/content/stories/{name}/BOOK.json').read_text())
         for name in ['C01-HAN-JUNHO', 'C02-STRONGHOLD', 'C03-AFTERFALL']}
RESULTS: list[dict] = []


def report(label: str, **fields):
    row = {'check': label, **fields, 'result': 'PASS'}
    RESULTS.append(row)
    print(json.dumps(row, ensure_ascii=False), flush=True)


def get(url: str) -> str:
    with urllib.request.urlopen(url, timeout=15) as response:
        return response.read().decode('utf-8')


def asset_names(html: str) -> set[str]:
    return set(re.findall(r'(?:src|href)=[\"\']([^\"\']*/assets/[^\"\']+\.(?:js|css))[\"\']', html))


def wait_for_deploy(url: str):
    expected = asset_names((DIST / 'index.html').read_text())
    assert expected, 'No local production JS/CSS asset fingerprints'
    deadline = time.monotonic() + 240
    last = ''
    while time.monotonic() < deadline:
        try:
            actual = asset_names(get(url))
            if actual == expected:
                for asset in actual:
                    with urllib.request.urlopen(url.rstrip('/') + asset, timeout=20) as response:
                        assert response.status == 200
                report('deployed JS/CSS matches tested build', url=url, assets=sorted(actual))
                return
            last = f'assets still differ: {sorted(actual)}'
        except Exception as error:
            last = str(error)
        time.sleep(5)
    raise AssertionError(f'Deployment not ready for tested build: {last}')


def tap(locator, mobile: bool):
    # One gesture only. No second-click workaround or retry of a failed click.
    locator.scroll_into_view_if_needed()
    if mobile:
        locator.tap()
    else:
        locator.click()


def query_url(base: str, **params) -> str:
    return base.rstrip('/') + '/?' + urlencode(params)


def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), 'Horizontal viewport overflow'


def selected_book(page, chapter: dict, chronicle: str):
    expect(page.locator('.book-prose')).to_have_attribute('data-chapter-id', chapter['id'])
    expect(page.locator('.book-prose > header h1')).to_have_text(chapter['title'])
    expect(page.locator('.book-toc [aria-current="page"]')).to_have_count(1)
    expect(page.locator('.book-toc [aria-current="page"]')).to_have_attribute('data-chapter-id', chapter['id'])
    page.wait_for_function('([key,id]) => { try { return localStorage.getItem(key) === id } catch { return true } }', arg=['survival-diary-archive:story-progress:v1:' + chronicle, chapter['id']])
    assert parse_qs(urlparse(page.url).query).get('chapter') == [chapter['id']]
    # Check again after effects/animation frames: transient selection is not success.
    page.wait_for_timeout(180)
    assert page.locator('.book-prose').get_attribute('data-chapter-id') == chapter['id'], 'Chapter bounced after one tap'
    assert len(page.locator('.reader-body').inner_text()) > 30
    no_overflow(page)


def selected_raw(page, part_id: str):
    expect(page.locator('.transcript-reader')).to_have_attribute('data-part-id', part_id)
    expect(page.locator('.reader-part-list [aria-current="page"]')).to_have_count(1)
    expect(page.locator('.reader-part-list [aria-current="page"]')).to_have_attribute('data-part-id', part_id)
    assert parse_qs(urlparse(page.url).query).get('part') == [part_id]
    page.wait_for_timeout(180)
    assert page.locator('.transcript-reader').get_attribute('data-part-id') == part_id, 'PART bounced after one tap'
    no_overflow(page)


def audit_book(page, base: str, chronicle: str, width: int):
    mobile = width < 700
    chapters = BOOKS[chronicle]['chapters']
    key = 'survival-diary-archive:story-progress:v1:' + chronicle
    page.evaluate('([key,id]) => localStorage.setItem(key,id)', [key, chapters[-1]['id']])
    page.goto(query_url(base, view='story', chronicle=chronicle, chapter=chapters[0]['id']))
    selected_book(page, chapters[0], chronicle)  # explicit link beats stored last chapter
    for index in [1, 2]:
        tap(page.locator(f'.book-toc [data-chapter-id="{chapters[index]["id"]}"]'), mobile)
        selected_book(page, chapters[index], chronicle)
        top = page.locator('.book-prose').bounding_box()['y']
        assert -2 <= top < 180, f'New chapter is not in view: {top}'
    page.go_back()
    selected_book(page, chapters[1], chronicle)
    page.go_forward()
    selected_book(page, chapters[2], chronicle)
    tap(page.locator('.book-pager button').last, mobile)
    selected_book(page, chapters[3], chronicle)
    tap(page.locator('.book-pager button').first, mobile)
    selected_book(page, chapters[2], chronicle)
    page.reload()
    selected_book(page, chapters[2], chronicle)
    page.goto(query_url(base, view='story', chronicle=chronicle))
    selected_book(page, chapters[2], chronicle)  # unqualified URL resumes bookmark
    tap(page.locator(f'.book-toc [data-chapter-id="{chapters[-1]["id"]}"]'), mobile)
    selected_book(page, chapters[-1], chronicle)
    expect(page.locator('.book-pager button')).to_have_count(1)
    tap(page.locator('.book-toc .text-button'), mobile)
    expect(page.locator('.book-reader')).to_have_count(0)
    report('book deep link / one-tap TOC / pager / back-forward / reload / resume / final chapter', width=width, chronicle=chronicle)


def audit_raw(page, base: str, chronicle: str, width: int):
    mobile = width < 700
    page.goto(query_url(base, view='raw', chronicle=chronicle))
    expect(page.locator('.reader-part-list button').first).to_be_visible()
    # Select two actual published, fully verified PARTs from the live TOC.
    buttons = page.locator('.reader-part-list button')
    verified = []
    for i in range(buttons.count()):
        button = buttons.nth(i)
        if button.locator('span').first.inner_text() == '원문':
            verified.append(button.get_attribute('data-part-id'))
    assert len(verified) >= 2, f'Not enough verified RAW PARTs for {chronicle}'
    for part_id in verified[:2]:
        tap(page.locator(f'.reader-part-list [data-part-id="{part_id}"]'), mobile)
        selected_raw(page, part_id)
        assert page.locator('.transcript-message').count() > 0, 'Verified RAW renders a blank body'
    page.go_back()
    selected_raw(page, verified[0])
    page.go_forward()
    selected_raw(page, verified[1])
    page.reload()
    selected_raw(page, verified[1])
    page.goto(query_url(base, view='raw', chronicle=chronicle))
    selected_raw(page, verified[1])
    page.goto(query_url(base, view='reader', chronicle=chronicle, part=verified[0]))
    selected_raw(page, verified[0])  # legacy link wins over most recent bookmark
    tap(page.locator(f'.reader-part-list [data-part-id="{verified[1]}"]'), mobile)
    selected_raw(page, verified[1])  # original stale-prop bug after direct link
    report('RAW single tap / nonempty numbered prose / legacy link / back-forward / reload / resume', width=width, chronicle=chronicle)


def audit_extra(page, base: str, width: int):
    mobile = width < 700
    page.goto(query_url(base, view='raw', chronicle='C03-AFTERFALL', part='c03-s02-session-009-001'))
    selected_raw(page, 'c03-s02-session-009-001')
    assert page.locator('.transcript-gm').count() > 0
    tap(page.locator('.reader-pager button').last, mobile)
    selected_raw(page, 'c03-s02-session-009-002')
    assert len(page.locator('.transcript-flow').inner_text()) > 100
    tap(page.get_by_role('tab', name='S01', exact=True), mobile)
    expect(page.locator('.missing-transcript')).to_be_visible()
    page.goto(query_url(base, view='raw', chronicle='C03-AFTERFALL', part='c03-s01-008'))
    expect(page.locator('.transcript-fragment pre')).to_be_visible()
    report('S02 finale / season switch / missing and fragment preserved', width=width)

    page.goto(base)
    search = page.locator('.archive-search input')
    search.fill('체육')
    expect(page.locator('.result-list button').first).to_be_visible()
    label = page.locator('.result-list button strong').first.inner_text()
    tap(page.locator('.result-list button').first, mobile)
    expect(page.locator('.archive-detail-header h1')).to_have_text(label)
    search.fill('__no_matching_record__')
    expect(page.locator('.result-list button')).to_have_count(0)
    search.fill('')
    tap(page.get_by_role('button', name='지역', exact=True).first, mobile)
    assert page.locator('.result-list button').count() > 0
    no_overflow(page)
    # A Wiki link to an explicit C03 chapter must beat its saved last chapter.
    page.goto(query_url(base, view='archive', node='char-jinwoo'))
    story_button = page.locator('#detail-stories .archive-entry-list button').first
    expected_title = story_button.locator('strong').inner_text()
    tap(story_button, mobile)
    expect(page.locator('.book-prose > header h1')).to_have_text(expected_title)
    page.go_back()
    expect(page.locator('.archive-detail-header h1')).to_have_text('서진우')
    report('Explorer search / empty result recovery / filter / Story-to-Wiki route', width=width)


def probe_original(browser, url: str):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.goto(query_url(url, view='story', chronicle='C01-HAN-JUNHO'))
    expect(page.locator('.book-prose h1')).to_be_visible()
    original = page.locator('.book-prose h1').inner_text()
    target = page.locator('.book-toc section button').nth(1)
    tap(target, True)
    page.wait_for_timeout(500)
    after_first = page.locator('.book-prose h1').inner_text()
    assert after_first == original, 'Original first-tap regression not reproduced'
    tap(target, True)
    page.wait_for_timeout(300)
    assert page.locator('.book-prose h1').inner_text() != original, 'Original second-tap behavior differs'
    report('original production regression reproduced: first tap reverts, second tap works', url=url)
    context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', help='Audit this deployed site instead of local dist')
    parser.add_argument('--wait-assets', action='store_true', help='Wait for the URL to match local dist asset hashes')
    parser.add_argument('--probe-original', help='Only reproduce the original bug at an immutable old deploy URL')
    args = parser.parse_args()
    server = None
    if args.url or args.probe_original:
        base = (args.url or args.probe_original).rstrip('/')
    else:
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
    try:
        if args.wait_assets:
            wait_for_deploy(base)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            if args.probe_original:
                probe_original(browser, base)
                return
            for width in [360, 390, 430, 1280]:
                context = browser.new_context(viewport={'width': width, 'height': 844}, is_mobile=width < 700, has_touch=width < 700)
                page = context.new_page()
                errors, failures = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('response', lambda response: failures.append(f'{response.status} {response.url}') if response.status >= 400 and response.url.startswith(base) else None)
                page.goto(base)
                for chronicle in BOOKS:
                    audit_book(page, base, chronicle, width)
                    audit_raw(page, base, chronicle, width)
                audit_extra(page, base, width)
                assert not errors, f'Browser runtime errors: {errors}'
                assert not failures, f'HTTP failures: {failures}'
                report('no runtime exceptions or same-site HTTP errors', width=width)
                context.close()
            blocked = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
            blocked.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });")
            page = blocked.new_page()
            page.goto(query_url(base, view='story', chronicle='C01-HAN-JUNHO', chapter='invalid'))
            expect(page.locator('.book-prose h1')).to_have_text(BOOKS['C01-HAN-JUNHO']['chapters'][0]['title'])
            tap(page.locator('.book-toc section button').nth(1), True)
            expect(page.locator('.book-prose h1')).to_have_text(BOOKS['C01-HAN-JUNHO']['chapters'][1]['title'])
            page.goto(query_url(base, view='raw', chronicle='C03-AFTERFALL', part='invalid'))
            expect(page.locator('.reader-page')).to_be_visible()
            report('blocked localStorage and invalid links remain navigable')
            blocked.close()
            browser.close()
    finally:
        if server:
            server.shutdown()
        summary = json.dumps({'url': base, 'passed_groups': len(RESULTS), 'results': RESULTS}, ensure_ascii=False, indent=2)
        print(summary, flush=True)
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as out:
                out.write('\n### Archive browser audit\n```json\n' + summary + '\n```\n')


if __name__ == '__main__':
    main()
