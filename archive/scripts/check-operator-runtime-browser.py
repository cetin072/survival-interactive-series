"""Isolated UI regression: synthetic Auth/RPC and GETs, all remote writes blocked."""
import argparse
import functools
import http.server
import importlib.util
import json
import os
from pathlib import Path
import threading
from datetime import datetime, timezone
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('qa', ROOT / 'archive/scripts/check-operator-deploy-browser.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)

def run(output):
    output.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(qa.Handler, directory=str(ROOT / 'archive/web/dist')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    reports = []
    with sync_playwright() as pw:
        executable = os.environ.get('CHROMIUM_EXECUTABLE')
        browser = pw.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}))
        for width in [1440, 390, 320]:
            context = browser.new_context(viewport={'width': width, 'height': 1000})
            page = context.new_page()
            page.clock.install()
            errors, providers, calls = [], [], []
            mode = {'deny': False, 'hold': False}
            pending_decisions = []
            review = {'id': '00000000-0000-4000-8000-000000000123', 'source_worker': 'A_TEST', 'item_type': 'TEST', 'chronicle_id': None, 'priority': 'LOW', 'title': 'Synthetic review', 'summary': 'Only local fixture', 'risk_level': 'LOW', 'source_ref': 'https://example.invalid', 'status': 'PENDING', 'created_at': '2026-10-01T00:00:00Z', 'payload': {}, 'updated_at': None, 'decided_at': None, 'decision_note': None, 'decision_history': []}
            page.on('pageerror', lambda e: errors.append(str(e)))
            now = datetime.now(timezone.utc).isoformat()
            cron = {'active': True, 'last_status': 'succeeded'}
            status = {
                'archive': {'cron': cron, 'dispatch_count': 1, 'latest_dispatch': None},
                'visual': {'job_count': 1, 'today_job_count': 0, 'today_success_count': 0, 'active_count': 0,
                    'latest_job': {'status': 'SUCCEEDED'}, 'prep_cron': cron, 'retry_cron': cron},
                'review': {'pending_count': 0, 'automation_error_count': 0},
                'a_wiki': {'job_count': 1, 'active_count': 0, 'published_count': 1, 'latest_job': {'status': 'PUBLISHED'},
                    'continuous_review': {'worker_connected': False, 'current_status': 'EXTRACTOR_READY', 'last_scan_at': now,
                        'error_count': 1, 'human_approval_required_count': 9, 'human_review_count': 2, 'candidate_count': 3, 'no_change_count': 0}},
                'knowledge_semantic': {'active_count': 0, 'machine_active_count': 0, 'human_review_count': 0,
                    'unresolved_blocked_count': 0, 'machine_stalled_count': 0, 'latest_job': {'status': 'PUBLISHED', 'brief_id': 'K-TEST'}, 'prep': None},
            }
            def route(r):
                u = urlparse(r.request.url)
                if u.hostname == '127.0.0.1':
                    r.continue_(); return
                name = u.path.split('/')[-1]
                if u.hostname == 'api.github.com' or u.hostname == 'api.netlify.com':
                    assert r.request.method == 'GET'
                    assert 'authorization' not in r.request.headers
                    providers.append(r.request.url)
                    if '/actions/workflows/archive-' in u.path and name == 'runs':
                        workflow = u.path.split('/')[-2]
                        r.fulfill(json={'workflow_runs': [{'id': 123, 'head_branch': 'main', 'event': 'workflow_dispatch',
                            'path': '.github/workflows/' + workflow, 'repository': {'full_name': 'cetin072/survival-interactive-series'},
                            'status': 'completed', 'conclusion': 'failure' if 'illustration' in workflow and not mode['hold'] else 'success', 'created_at': now}]})
                    elif '/actions/runs/123/jobs' in u.path:
                        r.fulfill(json={'total_count':3,'jobs':[
                            {'run_id':123,'name':'policy','status':'completed','conclusion':'success'},
                            {'run_id':123,'name':'ILLUSTRATION_OPERATOR_HOLD / RETIRED_IDENTITY_NO_SUCCESSOR_AUTHORIZED / next_generation_allowed:false','status':'completed','conclusion':'success'},
                            {'run_id':123,'name':'prepare','status':'completed','conclusion':'skipped'}]})
                    else:
                        r.fulfill(status=503, json={})
                    return
                calls.append(name)
                if name == 'archive_operator_decide_review_item' and not mode['deny']:
                    pending_decisions.append(r)
                    return
                bodies = {'archive_operator_system_status': status,
                    'archive_operator_review_inbox': {'pending_count': 1, 'automation_error_count': 0, 'items': [review]},
                    'archive_operator_review_item_detail': review,
                    'archive_operator_knowledge_inbox': {'total_count': 0, 'working_count': 0, 'review_count': 0, 'held_count': 0, 'published_count': 0, 'items': []},
                    'archive_operator_bunker_os_logs': {'logs': []}}
                if u.hostname == 'jgsxpdflgkqroecfjzxq.supabase.co' and name in bodies and not mode['deny']:
                    r.fulfill(json=bodies[name])
                else:
                    r.fulfill(status=403, json={'message': 'SYNTHETIC_DENIED'})
            context.route('**/*', route)
            base = f'http://127.0.0.1:{server.server_port}'
            page.goto(base + '/operator/')
            expect(page.get_by_role('heading', name='운영자 로그인', exact=True)).to_be_visible()
            assert not providers and not calls
            page.evaluate('(s) => localStorage.setItem("sb-jgsxpdflgkqroecfjzxq-auth-token", JSON.stringify(s))', qa.synthetic_session())
            page.reload()
            cards = page.locator('.operator-system-card')
            expect(cards.nth(0).locator('.operator-status-badge')).to_have_text('최근 실행 성공')
            expect(cards.nth(1).locator('.operator-status-badge')).to_have_text('재검수 오류 1건')
            expect(cards.nth(2).locator('.operator-status-badge')).to_have_text('최근 실행 실패')
            expect(cards.nth(3)).not_to_contain_text('게시 완료')
            expect(page.locator('.operator-sites')).to_have_attribute('aria-busy', 'false')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            page.locator('.operator-system-grid').screenshot(path=str(output / f'runtime-{width}.png'))
            mode['hold'] = True
            page.reload()
            expect(cards.nth(2).locator('.operator-status-badge')).to_have_text('운영자 보류 · 후속 생성 승인 필요')
            expect(cards.nth(2)).not_to_contain_text('최근 실행 성공')
            before = calls.count('archive_operator_system_status')
            page.clock.fast_forward(60000)
            expect(page.locator('.operator-refresh-button').first).to_have_attribute('aria-busy', 'false')
            assert calls.count('archive_operator_system_status') > before, 'Visible dashboard must refresh'
            # Slow local-only approval must keep controls locked across a faster poll.
            page.get_by_role('button', name='Synthetic review', exact=False).click()
            approve = page.get_by_role('button', name='승인', exact=True)
            expect(approve).to_be_enabled()
            approve.click()
            expect(approve).to_be_disabled()
            page.clock.fast_forward(60000)
            expect(page.locator('.operator-refresh-button').first).to_have_attribute('aria-busy', 'false')
            expect(approve).to_be_disabled()
            assert len(pending_decisions) == 1
            pending_decisions.pop().fulfill(json={**review, 'status': 'APPROVED'})
            expect(approve).to_have_count(0)
            expect(page.locator('.operator-refresh-button').first).to_have_attribute('aria-busy', 'false')
            # A hidden tab must expire observations without issuing polling reads.
            page.evaluate('Object.defineProperty(document, "visibilityState", {configurable:true,get:()=>"hidden"})')
            before = len(calls)
            page.clock.fast_forward(121000)
            expect(page.get_by_text('조회한 지 2분이 지나 현재 상태를 확인할 수 없습니다. 새로고침하세요.')).to_be_visible()
            assert len(calls) == before
            mode['deny'] = True
            page.goto(base + '/operator/knowledge/')
            expect(page.get_by_role('alert')).to_contain_text('불러오지 못했습니다')
            expect(page.get_by_role('heading', name='검토할 글 · 조회 불가')).to_be_visible()
            expect(page.get_by_text('이 목록에 글이 없습니다.')).to_have_count(0)
            before = len(providers)
            page.goto(base + '/operator/')
            expect(page.get_by_text('자동화 실행 상태를 불러오지 못했습니다.')).to_be_visible()
            assert len(providers) == before, 'Denied Operator must not fetch public provider evidence'
            assert not errors, errors
            reports.append({'width': width, 'result': 'PASS', 'evidence': 'synthetic Auth/RPC/providers; no production access'})
            context.close()
        browser.close()
    server.shutdown()
    (output / 'audit.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2))
    print(json.dumps(reports, ensure_ascii=False))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--screenshots', required=True, type=Path)
    run(parser.parse_args().screenshots)
