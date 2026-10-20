"""Read-only Operator QA; synthetic Auth/RPC, mocked or live public provider GETs.

Uses the existing Playwright browser tooling. Never signs in a real user, invokes
a release workflow, or calls a Build Hook. --live records actual CORS/API results
separately; provider failures must render unknown, never synthetic success.
"""
import argparse
import base64
from datetime import datetime, timedelta, timezone
import functools
import http.server
import json
import os
from pathlib import Path
import threading
import tomllib
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
SITES = [
    ('태장', 'cetin072/taejang_homepage', '9caa5a1a-f86d-4a9f-aed4-f560e1c2101f', 'deployment/release-policy.json'),
    ('생존일기', 'cetin072/survival-interactive-series', '4b344369-f418-48ba-81b8-991be8974486', 'archive/automation/release-policy.json'),
    ('업무수첩', 'cetin072/worklog-voice-pwa', '1ab24b2c-a3e7-479f-8c1b-bbd0a567a25d', 'scripts/release-policy.json'),
]
SHA, MAIN = 'a' * 40, 'b' * 40
POLICY = json.loads((ROOT / 'archive/automation/release-policy.json').read_text())
CSP = next(h['values']['Content-Security-Policy'] for h in tomllib.loads((ROOT / 'archive/web/netlify.toml').read_text())['headers'] if h['for'] == '/operator*')

def iso(value):
    return value.isoformat().replace('+00:00', 'Z')

def synthetic_session():
    now = int(datetime.now(timezone.utc).timestamp())
    user = {'id': '00000000-0000-4000-8000-000000000001', 'aud': 'authenticated', 'role': 'authenticated', 'email': 'qa@example.invalid', 'app_metadata': {}, 'user_metadata': {}}
    enc = lambda v: base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
    token = enc({'alg': 'HS256', 'typ': 'JWT'}) + '.' + enc({'sub': user['id'], 'exp': now + 3600}) + '.synthetic-signature'
    return {'access_token': token, 'refresh_token': 'synthetic-refresh', 'token_type': 'bearer', 'expires_in': 3600, 'expires_at': now + 3600, 'user': user}

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlparse(self.path).path.startswith('/operator'):
            self.path = '/index.html'
        super().do_GET()

    def end_headers(self):
        # Test the real Operator-only policy locally as well as on Netlify.
        self.send_header('Content-Security-Policy', CSP)
        super().end_headers()

    def log_message(self, *_):
        pass

def run(args):
    output = Path(args.screenshots)
    output.mkdir(parents=True, exist_ok=True)
    server = None
    if args.url:
        base = args.url.rstrip('/')
    else:
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT / 'archive/web/dist')))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f'http://127.0.0.1:{server.server_port}'
    reports = []
    with sync_playwright() as pw:
        executable = os.environ.get('CHROMIUM_EXECUTABLE')
        browser = pw.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}))
        for width in ([1440] if args.live else [1440, 390, 320]):
            context = browser.new_context(viewport={'width': width, 'height': 1100}, is_mobile=width < 700, has_touch=width < 700)
            page = context.new_page()
            external_requests = []
            errors = []
            mode = {'state': 'pending', 'deny': False}
            page.on('pageerror', lambda e: errors.append(str(e)))

            def supabase(route):
                path = urlparse(route.request.url).path
                body = {}
                if path.endswith('archive_operator_system_status'):
                    if mode['deny']:
                        route.fulfill(status=403, json={'message': 'SURVIVAL_ARCHIVE_FORBIDDEN'})
                        return
                    body = {'archive': {'dispatch_count': 0, 'latest_dispatch': None, 'cron': None},
                            'visual': {'job_count': 0, 'today_job_count': 0, 'today_success_count': 0, 'active_count': 0, 'latest_job': None, 'prep_cron': None, 'retry_cron': None},
                            'review': {'pending_count': 0, 'automation_error_count': 0},
                            'a_wiki': {'job_count': 0, 'active_count': 0, 'published_count': 0, 'latest_job': None},
                            'knowledge_semantic': {'active_count': 0, 'latest_job': None, 'prep': None}}
                elif path.endswith('archive_operator_review_inbox'):
                    body = {'pending_count': 0, 'automation_error_count': 0, 'items': []}
                elif path.endswith('archive_operator_bunker_os_logs'):
                    body = {'logs': []}
                else:
                    route.fulfill(status=403, json={'message': 'QA_BLOCKS_UNEXPECTED_AUTH_OR_DB_OPERATION'})
                    return
                route.fulfill(json=body)

            context.route('https://*.supabase.co/**', supabase)

            def provider(route):
                request = route.request
                assert request.method == 'GET', 'Provider request must never mutate'
                assert 'authorization' not in request.headers, 'No provider token in browser'
                assert '/build_hooks/' not in request.url, 'No Build Hook request'
                external_requests.append(request.url)
                if args.live:
                    route.continue_()
                    return
                url = request.url
                row = next(s for s in SITES if s[1] in url or s[2] in url)
                state = mode['state']
                if state == 'partial' and row[0] == '태장' or state == 'unknown':
                    route.fulfill(status=503, json={}, headers={'Access-Control-Allow-Origin': '*'})
                    return
                now = datetime.now(timezone.utc)
                pub = {'id': 'a' * 24, 'site_id': row[2], 'context': 'production', 'state': 'ready', 'branch': 'main', 'commit_ref': SHA,
                       'created_at': iso(now - timedelta(hours=50)), 'published_at': iso(now - timedelta(hours=49))}
                if '/git/ref/' in url:
                    body = {'object': {'sha': SHA if state == 'complete' else MAIN}}
                elif '/contents/' in url:
                    policy = {**POLICY, 'repository': row[1], 'site_id': row[2]}
                    if row[0] != '생존일기':
                        policy['deploy_inputs'] = ['^app/' if row[0] == '태장' else '^public/']
                        policy['deploy_excludes'] = []
                    body = {'encoding': 'base64', 'content': base64.b64encode(json.dumps(policy).encode()).decode()}
                elif '/actions/' in url:
                    body = {'workflow_runs': []}
                elif '/compare/' in url:
                    body = {'status': 'ahead', 'base_commit': {'sha': SHA}, 'merge_base_commit': {'sha': SHA},
                            'files': [{'filename': 'docs/note.md' if state == 'unchanged' else 'archive/web/src/app.tsx'}]}
                    # Apply each repository's real deployment scope for mock changes.
                    if state != 'unchanged':
                        body['files'] = [{'filename': 'archive/web/src/app.tsx' if row[0] == '생존일기' else 'public/app.js' if row[0] == '업무수첩' else 'app/app.js'}]
                elif '/deploys?' in url:
                    attempt = {**pub, 'id': 'c' * 24, 'created_at': iso(now - timedelta(minutes=1)), 'published_at': None,
                               'state': 'building' if state == 'building' else 'error'}
                    body = [attempt, pub] if state in ['building', 'failed'] else [pub]
                else:
                    body = {'id': row[2], 'published_deploy': pub}
                route.fulfill(json=body, headers={'Access-Control-Allow-Origin': '*'})

            context.route('https://api.github.com/**', provider)
            context.route('https://api.netlify.com/**', provider)
            page.goto(base + '/operator/')
            expect(page.get_by_role('heading', name='운영자 로그인', exact=True)).to_be_visible()
            assert not external_requests, 'No provider query before login'
            assert page.locator('.operator-sites').count() == 0
            # Synthetic browser session only: real server-side capability is mocked
            # above. This does not claim real login/role integration success.
            page.evaluate('(session) => localStorage.setItem("sb-jgsxpdflgkqroecfjzxq-auth-token", JSON.stringify(session))', synthetic_session())
            expected = {'pending': '배포 대기', 'building': '배포 진행 중', 'complete': '배포 완료', 'unchanged': '배포할 변경 없음', 'failed': '배포 실패·확인 필요', 'unknown': '상태 조회 불가'}
            states = ['live'] if args.live else list(expected) + ['partial']
            for state in states:
                mode['state'] = state
                page.reload()
                expect(page.locator('.operator-site-card')).to_have_count(3)
                expect(page.locator('.operator-system-card')).to_have_count(4)
                expect(page.locator('.operator-sites')).to_have_attribute('aria-busy', 'false', timeout=45000)
                badges = page.locator('.operator-site-card .operator-status-badge').all_text_contents()
                if args.live:
                    reports.append({'mode': 'LIVE_PUBLIC_GETS_AUTH_RPC_MOCKED', 'width': width, 'badges': badges,
                                    'cards': page.locator('.operator-site-card').all_text_contents()})
                elif state == 'partial':
                    assert badges == ['상태 조회 불가', '배포 대기', '배포 대기'], badges
                else:
                    assert badges == [expected[state]] * 3, (state, badges, page.locator('.operator-sites').text_content())
                assert page.locator('.operator-site-card details[open]').count() == 0
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (width, state, 'overflow')
                cards = page.locator('.operator-site-card').all()
                boxes = [c.bounding_box() for c in cards]
                if width == 1440:
                    assert len({round(b['y']) for b in boxes}) == 1, 'Three desktop columns required'
                else:
                    assert boxes[0]['y'] < boxes[1]['y'] < boxes[2]['y'], 'Mobile vertical cards required'
                cards[0].get_by_text('기술 상세', exact=True).click()
                expect(cards[0].locator('details')).to_have_attribute('open', '')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Open details overflow'
                cards[0].get_by_text('기술 상세', exact=True).click()
                if state in ['pending', 'partial', 'live']:
                    page.locator('.operator-sites').screenshot(path=str(output / f'{state}-{width}.png'))
                reports.append({'mode': 'mock' if not args.live else 'live-layout', 'width': width, 'state': state, 'result': 'PASS'})
            if not args.live:
                mode['deny'] = True
                count = len(external_requests)
                page.reload()
                expect(page.locator('.operator-sites')).to_have_attribute('aria-busy', 'false', timeout=15000)
                assert len(external_requests) == count, 'Denied capability must not fetch providers'
                assert page.locator('.operator-site-card .operator-status-badge').all_text_contents() == ['상태 조회 불가'] * 3
            assert not errors, errors
            context.close()
        browser.close()
    if server:
        server.shutdown()
    (output / 'audit.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2))
    print(json.dumps(reports, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url')
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--screenshots', required=True)
    run(parser.parse_args())
