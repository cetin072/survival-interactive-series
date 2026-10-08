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
from reader_deploy_identity import deployed_revision_matches
from urllib.parse import parse_qs, urlencode, urlparse
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / 'archive/web/dist'
BOOKS = {name: json.loads((ROOT / f'archive/content/stories/{name}/BOOK.json').read_text(encoding='utf-8'))
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


def wait_for_deploy(url: str, *, allow_ancestor_equivalent: bool = False):
    if allow_ancestor_equivalent and not (urlparse(url).hostname or "").startswith("deploy-preview-"):
        raise ValueError("ANCESTOR_EQUIVALENCE_PREVIEW_ONLY")
    local_html = (DIST / 'index.html').read_text(encoding='utf-8')
    expected = asset_names(local_html)
    assert expected, 'No local production JS/CSS asset fingerprints'
    expected_ref = re.search(r'<meta name="archive-build-ref" content="([a-f0-9]{40})"', local_html)
    assert expected_ref, 'Local build has no exact commit ref marker'
    deadline = time.monotonic() + 240
    last = ''
    while time.monotonic() < deadline:
        try:
            deployed_html = get(url)
            actual = asset_names(deployed_html)
            deployed_ref = re.search(r'<meta name="archive-build-ref" content="([a-f0-9]{40})"', deployed_html)
            if deployed_ref and actual and deployed_revision_matches(deployed_ref.group(1), expected_ref.group(1), allow_ancestor_equivalent=allow_ancestor_equivalent, cwd=str(ROOT)):
                for asset in actual:
                    with urllib.request.urlopen(url.rstrip('/') + asset, timeout=20) as response:
                        assert response.status == 200
                report('deployed revision is exact or source-equivalent and JS/CSS load', url=url, deployed_commit=deployed_ref.group(1), tested_commit=expected_ref.group(1), ancestor_equivalent=deployed_ref.group(1) != expected_ref.group(1), assets=sorted(actual))
                return
            last = f'deployed commit ref differs: {deployed_ref.group(1) if deployed_ref else "missing"}; assets={sorted(actual)}'
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



def tap_toc(page, chapter_id: str, mobile: bool):
    outer = page.locator('.book-toc-disclosure')
    if not outer.evaluate('(item) => item.open'):
        tap(outer.locator(':scope > summary'), mobile)
    button = page.locator(f'.book-toc [data-chapter-id="{chapter_id}"]')
    group = button.locator('xpath=ancestor::details[contains(@class,"book-toc-group")]')
    if not group.evaluate('(item) => item.open'):
        tap(group.locator(':scope > summary'), mobile)
    tap(button, mobile)


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
    all_chapters = BOOKS[chronicle]['chapters']
    key = 'survival-diary-archive:story-progress:v1:' + chronicle
    page.goto(query_url(base, view='story', chronicle=chronicle))
    published_ids = set(page.locator('.book-toc [data-chapter-id]').evaluate_all(
        '(items) => items.map((item) => item.getAttribute("data-chapter-id"))'))
    chapters = [chapter for chapter in all_chapters if chapter['id'] in published_ids]
    assert len(chapters) >= 4, f'Not enough publicly available Reader chapters for {chronicle}'
    page.evaluate('([key,id]) => localStorage.setItem(key,id)', [key, chapters[-1]['id']])
    page.goto(query_url(base, view='story', chronicle=chronicle, chapter=chapters[0]['id']))
    selected_book(page, chapters[0], chronicle)  # explicit link beats stored last chapter
    if chronicle == 'C03-AFTERFALL':
        assert chapters[0]['id'] == 'c03-afterfall-opening-01'
        expect(page.locator('.reader-body')).to_contain_text('서림대학교병원 응급의료센터')
        assert chapters[1]['id'] == 'c03-afterfall-prelude-01'
        assert chapters[9]['id'] == 'c03-afterfall-chapter-01'
        page.goto(query_url(base, view='story', chronicle=chronicle, chapter='c03-afterfall-chapter-01'))
        selected_book(page, chapters[9], chronicle)  # existing deep link stays valid
        page.goto(query_url(base, view='story', chronicle=chronicle, chapter=chapters[0]['id']))
        selected_book(page, chapters[0], chronicle)
    for index in [1, 2]:
        tap_toc(page, chapters[index]["id"], mobile)
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
    tap_toc(page, chapters[-1]["id"], mobile)
    selected_book(page, chapters[-1], chronicle)
    expect(page.locator('.book-pager button')).to_have_count(1)
    tap(page.get_by_role('link', name='이야기 목록', exact=True), mobile)
    expect(page.get_by_role('heading', name='전체 생존기 목록', exact=True)).to_be_visible()
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
    selected_raw(page, 'c03-s01-opening-001')
    expect(page.locator('.transcript-flow')).to_contain_text('서림대학교병원 응급의료센터')
    page.goto(query_url(base, view='raw', chronicle='C03-AFTERFALL', part='c03-s01-missing-before'))
    expect(page.locator('.transcript-gm').first).to_be_visible()
    page.goto(query_url(base, view='raw', chronicle='C03-AFTERFALL', part='c03-s01-008'))
    expect(page.locator('.transcript-gm').first).to_be_visible()
    report('S02 finale / season switch / missing and fragment preserved', width=width)

    # The Chronicle Hub is the home route. Open C03's character index before using Explorer search.
    page.goto(query_url(base, view='chronicle', chronicle='C03-AFTERFALL', section='explorer'))
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



def audit_story_shell(page, base: str, width: int, screenshots: str | None):
    mobile = width < 700
    page.goto(query_url(base, view='story'))
    expect(page.locator('.wiki-topbar')).to_have_count(1)
    tap(page.locator('.wiki-current-chronicle').get_by_role('link', name='이야기 읽기', exact=True), mobile)
    expect(page.locator('.book-prose')).to_be_visible()
    expect(page.locator('.wiki-topbar')).to_have_count(1)
    expect(page.locator('.archive-header')).to_have_count(0)
    page.goto(query_url(base, view='story', chronicle='C03-AFTERFALL', chapter='c03-afterfall-chapter-06'))
    chapter = next(item for item in BOOKS['C03-AFTERFALL']['chapters'] if item['id'] == 'c03-afterfall-chapter-06')
    selected_book(page, chapter, 'C03-AFTERFALL')
    expect(page.locator('.wiki-breadcrumb')).to_contain_text('시즌 1')
    expect(page.locator('.book-prose > header')).to_contain_text('시즌 1 · 제15장')
    expect(page.locator('.book-pager')).to_contain_text('제14장 산림교육원')
    expect(page.locator('.book-pager')).to_contain_text('제16장 교환지의 사람들')
    current_group = page.locator('.book-toc [aria-current="page"]').locator('xpath=ancestor::details[contains(@class,"book-toc-group")]')
    expect(current_group).to_have_attribute('open', '')
    assert len(page.locator('.book-toc [data-chapter-id]').all()) == len(BOOKS['C03-AFTERFALL']['chapters'])
    counters = {}
    for item in BOOKS['C03-AFTERFALL']['chapters']:
        group = item.get('seasonId') or item.get('partId') or 'record'
        counters[group] = counters.get(group, 0) + 1
        expect(page.locator(f'.book-toc [data-chapter-id="{item["id"]}"] span')).to_have_text(f'제{counters[group]}장')
    if mobile:
        outer = page.locator('.book-toc-disclosure')
        expect(outer).not_to_have_attribute('open', '')
        summary = outer.locator(':scope > summary')
        summary.focus()
        page.keyboard.press('Space')
        expect(outer).to_have_attribute('open', '')
        expect(page.locator('.book-toc [aria-current="page"]')).to_be_in_viewport()
        assert summary.evaluate('(item) => getComputedStyle(item).outlineStyle') != 'none'
        tap_toc(page, 'c03-afterfall-chapter-07', True)
        expect(outer).not_to_have_attribute('open', '')
        page.go_back()
        selected_book(page, chapter, 'C03-AFTERFALL')
    else:
        expect(page.locator('.book-toc-disclosure')).to_have_attribute('open', '')
        toc = page.locator('.book-toc').bounding_box()
        prose = page.locator('.book-prose').bounding_box()
        assert toc['x'] + toc['width'] < prose['x'], 'Desktop TOC must be left of prose'
        assert 580 <= prose['width'] <= 760, 'Comfortable desktop prose width'
        summary = current_group.locator(':scope > summary')
        summary.focus()
        page.keyboard.press('Space')
        expect(current_group).not_to_have_attribute('open', '')
        page.keyboard.press('Space')
        expect(current_group).to_have_attribute('open', '')
    assert abs(page.locator('.wiki-topbar').bounding_box()['y']) <= 1, 'Shared header stays visible after Reader scroll'
    if screenshots and width in [390, 1440]:
        folder = Path(screenshots)
        folder.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(folder / f'reader-{width}.png'), full_page=False)
        if mobile:
            tap(page.locator('.book-toc-disclosure > summary'), True)
            page.screenshot(path=str(folder / f'reader-{width}-toc.png'), full_page=False)
            tap(page.locator('.book-toc-disclosure > summary'), True)
    tap(page.get_by_role('link', name='생존기 소개', exact=True), mobile)
    expect(page.locator('.wiki-chronicle-header h1')).to_have_text('서진우의 생존기')
    page.go_back()
    selected_book(page, chapter, 'C03-AFTERFALL')
    tap(page.locator('.book-related').get_by_role('button').first, mobile)
    expect(page.locator('.wiki-document')).to_be_visible()
    expect(page.locator('.archive-header')).to_have_count(0)
    page.go_back()
    selected_book(page, chapter, 'C03-AFTERFALL')
    no_overflow(page)
    report('shared shell / chapter-06 / season numbering / collapsible TOC / keyboard focus / introduction / related Wiki', width=width)


def audit_world_wiki(page, base: str, width: int, screenshots: str | None):
    """Actual shared-world routes, source navigation, isolation and review captures."""
    mobile = width < 700
    folder = Path(screenshots) if screenshots else None
    if folder:
        folder.mkdir(parents=True, exist_ok=True)

    def capture(name):
        if folder and width in [1280, 390, 360]:
            page.screenshot(path=str(folder / f'wiki-{name}-{width}.png'), full_page=not name.endswith('-document'))

    def world_menu():
        return page.locator('.wiki-topbar nav').get_by_role('link', name='세계관 위키', exact=True)

    page.goto(base)
    expect(page.get_by_role('heading', name='일상과 비상상황에 필요한 생존 지식', exact=True)).to_be_visible()
    expect(page.locator('#site-search input')).to_be_visible()
    tap(world_menu(), mobile)
    expect(page.locator('.world-wiki-card')).to_have_count(len(BOOKS))
    no_overflow(page)
    for item in page.locator('.wiki-topbar nav a').all():
        box = item.bounding_box()
        assert box and box['x'] >= -1 and box['x'] + box['width'] <= width + 1, 'Menu clipped'
    capture('lobby')
    # Static Knowledge must use its real HTML navigation, not a React search decoration.
    page.goto(base.rstrip('/') + '/knowledge/emergency-supplies-inventory/')
    tap(page.locator('.knowledge-nav').get_by_role('link', name='세계관 위키', exact=True), mobile)
    expect(page.locator('.world-wiki-card')).to_have_count(len(BOOKS))
    tap(page.locator('.wiki-topbar nav').get_by_role('link', name='생존 지식', exact=True), mobile)
    expect(page.locator('.knowledge-nav')).to_be_visible()
    tap(page.locator('.knowledge-nav').get_by_role('link', name='세계관 위키', exact=True), mobile)

    for chronicle in BOOKS:
        wiki_link = page.locator(f'.world-wiki-card a[href*="page=world&chronicle={chronicle}"]')
        expect(wiki_link).to_have_count(1)
        tap(wiki_link, mobile)
        expect(page.locator('.wiki-world-index-page')).to_be_visible()
        assert parse_qs(urlparse(page.url).query)['chronicle'] == [chronicle]
        expect(page.locator('#world-recent-title')).to_be_visible()
        for group in ['characters', 'locations', 'events']:
            section = page.locator('#' + group)
            shown = section.locator(':scope > .wiki-world-index-list > a')
            assert 0 < shown.count() <= 6
            disclosure = section.locator(':scope > details')
            if disclosure.count():
                expect(shown).to_have_count(6)
                expect(disclosure).not_to_have_attribute('open', '')
                summary = disclosure.locator(':scope > summary')
                summary.focus()
                page.keyboard.press('Space')
                expect(disclosure).to_have_attribute('open', '')
                assert summary.evaluate('(item) => getComputedStyle(item).outlineStyle') != 'none'
                assert disclosure.locator('.wiki-world-index-list > a').count() > 0
                tap(summary, mobile)
                expect(disclosure).not_to_have_attribute('open', '')
        no_overflow(page)
        capture(chronicle + '-world')
        for group in ['characters', 'locations', 'events']:
            # Legacy C03 profiles need not have a directly bound RAW source.
            # Use its existing, source-bound current+history profile for this
            # source navigation check; verify bare char-jinwoo separately below.
            if chronicle == 'C03-AFTERFALL' and group == 'characters':
                link = page.locator('#characters a[href*="node=char-seojin"]')
                expect(link).to_have_count(1)
                if not link.is_visible():
                    tap(page.locator('#characters > details > summary'), mobile)
            else:
                link = page.locator('#' + group + ' > .wiki-world-index-list > a').first
            title = link.locator('strong').inner_text()
            tap(link, mobile)
            expect(page.locator('.wiki-document-header h1')).to_have_text(title)
            expect(page.locator('.wiki-document-header')).to_contain_text(BOOKS[chronicle]['title'])
            assert parse_qs(urlparse(page.url).query)['chronicle'] == [chronicle]
            if chronicle != 'C03-AFTERFALL':
                expect(page.locator('#wiki-visuals')).to_have_count(0)
                expect(page.locator('.wiki-state-history blockquote').first).to_be_visible()
            no_overflow(page)
            if group == 'characters':
                capture(chronicle + '-document')
                relations = page.locator('#wiki-relations .wiki-relation-list > a')
                assert relations.count() > 0
                expected_title = relations.first.locator('strong').inner_text()
                tap(relations.first, mobile)
                expect(page.locator('.wiki-document-header h1')).to_have_text(expected_title)
                assert parse_qs(urlparse(page.url).query)['chronicle'] == [chronicle]
                page.go_back()
                expect(page.locator('.wiki-document-header h1')).to_have_text(title)
                source = page.locator('#wiki-sources a[href*="view=story"]').first
                chapter_id = parse_qs(urlparse(source.get_attribute('href')).query)['chapter'][0]
                chapter = next(ch for ch in BOOKS[chronicle]['chapters'] if ch['id'] == chapter_id)
                tap(source, mobile)
                selected_book(page, chapter, chronicle)
                page.go_back()
                expect(page.locator('.wiki-document-header h1')).to_have_text(title)
                raw = page.locator('#wiki-sources a[href*="view=raw"]').first
                part_id = parse_qs(urlparse(raw.get_attribute('href')).query)['part'][0]
                tap(raw, mobile)
                selected_raw(page, part_id)
                page.go_back()
                expect(page.locator('.wiki-document-header h1')).to_have_text(title)
                page.reload()
                expect(page.locator('.wiki-document-header h1')).to_have_text(title)
            page.go_back()
            expect(page.locator('.wiki-world-index-page')).to_be_visible()
        tap(world_menu(), mobile)
        expect(page.locator('.world-wiki-card')).to_have_count(len(BOOKS))
        report('world card / six-first keyboard-touch disclosure / three document types / scoped relation / Reader-RAW sources / back-reload', width=width, chronicle=chronicle)

    search = page.locator('#site-search input')
    search.fill('민석')
    for chronicle, title in [('C01-HAN-JUNHO', '민석'), ('C02-STRONGHOLD', '강민석')]:
        result = page.locator(f'.wiki-search-group a[href*="chronicle={chronicle}"][href*="node=char-minseok"]')
        expect(result).to_have_count(1)
        expect(result.locator('strong')).to_have_text(title)
        expect(result.locator('small')).to_contain_text(BOOKS[chronicle]['title'])
    capture('scoped-search')
    tap(page.locator('.wiki-search-group a[href*="chronicle=C02-STRONGHOLD"][href*="node=char-minseok"]'), mobile)
    expect(page.locator('.wiki-document-header h1')).to_have_text('강민석')
    for params in [dict(view='wiki-preview', page='world', chronicle='NOT-A-WORK'),
                   dict(view='wiki-preview', chronicle='C01-HAN-JUNHO', node='char-jinwoo'),
                   dict(view='wiki-preview', chronicle='C02-STRONGHOLD', node='missing-node')]:
        page.goto(query_url(base, **params))
        expect(page.get_by_role('heading', name='세계관 문서를 찾을 수 없습니다', exact=True)).to_be_visible()
    page.goto(query_url(base, view='wiki-preview', node='char-jinwoo'))
    expect(page.locator('.wiki-document-header h1')).to_have_text('서진우')
    expect(page.locator('.wiki-main-visual img')).to_be_visible()
    capture('c03-legacy-image')
    no_overflow(page)
    report('work-labeled colliding-node search / invalid scope fail-closed / legacy C03 portrait', width=width)


def probe_original(browser, url: str):
    context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.goto(query_url(url, view='story', chronicle='C01-HAN-JUNHO'))
    expect(page.locator('.book-prose > header h1')).to_be_visible()
    original = page.locator('.book-prose > header h1').inner_text()
    target = page.locator('.book-toc section button').nth(1)
    tap(target, True)
    page.wait_for_timeout(500)
    after_first = page.locator('.book-prose > header h1').inner_text()
    assert after_first == original, 'Original first-tap regression not reproduced'
    tap(target, True)
    page.wait_for_timeout(300)
    assert page.locator('.book-prose > header h1').inner_text() != original, 'Original second-tap behavior differs'
    report('original production regression reproduced: first tap reverts, second tap works', url=url)
    context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--screenshots', help='Save Reader/Wiki screenshots and JSON audit for review')
    parser.add_argument('--world-wiki', action='store_true', help='Audit source-bound world Wiki candidates in local/Preview builds')
    parser.add_argument('--url', help='Audit this deployed site instead of local dist')
    parser.add_argument('--wait-assets', action='store_true', help='Wait for deployment identity and assets to match this build')
    parser.add_argument('--allow-ancestor-equivalent', action='store_true', help='For Deploy Preview only, allow a verified ancestor deploy when all site inputs match exactly')
    parser.add_argument('--probe-original', help='Only reproduce the original bug at an immutable old deploy URL')
    args = parser.parse_args()
    server = None
    audit_completed = False
    if args.url or args.probe_original:
        base = (args.url or args.probe_original).rstrip('/')
    else:
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
    try:
        if args.wait_assets:
            wait_for_deploy(base, allow_ancestor_equivalent=args.allow_ancestor_equivalent)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            if args.probe_original:
                probe_original(browser, base)
                return
            for width in [360, 390, 430, 1280, 1440]:
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
                audit_story_shell(page, base, width, args.screenshots)
                if args.world_wiki:
                    audit_world_wiki(page, base, width, args.screenshots)
                assert not errors, f'Browser runtime errors: {errors}'
                assert not failures, f'HTTP failures: {failures}'
                report('no runtime exceptions or same-site HTTP errors', width=width)
                context.close()
            blocked = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
            blocked.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });")
            page = blocked.new_page()
            page.goto(query_url(base, view='story', chronicle='C01-HAN-JUNHO', chapter='invalid'))
            expect(page.locator('.book-prose > header h1')).to_have_text(BOOKS['C01-HAN-JUNHO']['chapters'][0]['title'])
            tap_toc(page, BOOKS['C01-HAN-JUNHO']['chapters'][1]['id'], True)
            expect(page.locator('.book-prose > header h1')).to_have_text(BOOKS['C01-HAN-JUNHO']['chapters'][1]['title'])
            page.goto(query_url(base, view='story', chronicle='C03-AFTERFALL'))
            selected_book(page, BOOKS['C03-AFTERFALL']['chapters'][0], 'C03-AFTERFALL')
            page.goto(query_url(base, view='raw', chronicle='C03-AFTERFALL', part='invalid'))
            expect(page.locator('.reader-page')).to_be_visible()
            report('blocked localStorage and invalid links remain navigable')
            blocked.close()
            browser.close()
            audit_completed = True
    finally:
        if server:
            server.shutdown()
        summary = json.dumps({'url': base, 'completed': audit_completed, 'passed_groups': len(RESULTS), 'results': RESULTS}, ensure_ascii=False, indent=2)
        print(summary, flush=True)
        if args.screenshots:
            folder = Path(args.screenshots)
            folder.mkdir(parents=True, exist_ok=True)
            (folder / 'audit-summary.json').write_text(summary + '\n', encoding='utf-8')
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as out:
                out.write('\n### Archive browser audit\n```json\n' + summary + '\n```\n')


if __name__ == '__main__':
    main()
