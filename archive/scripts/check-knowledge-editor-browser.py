"""Private synthetic editor click regression. No real login or publication.

All Auth/RPC traffic is intercepted; unexpected requests are denied. This is
separate from authenticated operator and real Production verification.
"""
import argparse
import copy
import functools
import http.server
import importlib.util
import json
import os
from pathlib import Path
import threading
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('operator_qa', ROOT / 'archive/scripts/check-operator-deploy-browser.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
JOB = '00000000-0000-4000-8000-000000000010'
BRIEF = dict(id='K-999', slug='private-editor-fixture', title='비공개 편집 검증용 원고', summary='일반 기록 방법을 안내합니다.',
             meta_description='비공개 검증 설명', lead='확인 시각과 담당자를 기록합니다.', label='생존 지식',
             scope='현장별 조건은 담당 기관이 확인해야 하며 이 글은 기록 방법만 설명합니다.', basis='공식 자료의 일반 원칙',
             footer='현장 담당자의 판단을 따릅니다.', editorial_note='실제 게시하지 않는 합성 원고',
             sections=[dict(heading='기록 방법', blocks=[dict(type='prose', text='확인 시각과 담당자를 기록합니다.'),
                       dict(type='unordered_list', items=['확인 시각', '담당자'])])],
             sources=[dict(id='S1', title='공식 자료', url='https://www.fema.gov/guide', note='기록 원칙만 참고', checked_at='2026-10-23')],
             semantic_qa_status='REVIEW', status='READY', risk_level='HIGH', risk_domains=['OTHER_SEVERE_HARM'],
             publication_policy='HUMAN_APPROVED', ai_assisted=True, tools=[], story_refs=[])


def envelope(status='HUMAN_REVIEW', body=True, archived=False):
    brief = copy.deepcopy(BRIEF) if body else None
    return dict(job_id=JOB, revision=1 if body else 0, brief=brief, brief_id='K-999', status=status, archived=archived,
                original=dict(brief=copy.deepcopy(brief), note='보존된 과거 이유', evidence=dict(unknowns=[], conflicts=[], copyright_status='CLEAR')),
                context={}, evidence_review=dict(claims=[dict(claim='기록 원칙', source_ids=['S1'], context='일반 기록', limitation='현장별 판단 제외')], resolutions=[]),
                history=[], updated_at='2026-10-23T00:00:00Z', request=None)


def run(args):
    output = Path(args.screenshots)
    output.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(qa.Handler, directory=str(ROOT / 'archive/web/dist')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    report = []
    with sync_playwright() as pw:
        executable = os.environ.get('CHROMIUM_EXECUTABLE')
        browser = pw.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}))
        for width in [320, 390, 1280]:
            context = browser.new_context(viewport={'width': width, 'height': 900})
            state = {'data': envelope(), 'calls': [], 'deny': False, 'fail_save': False}
            original = copy.deepcopy(state['data']['original'])
            errors = []
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))

            def rpc(route):
                name = urlparse(route.request.url).path.split('/')[-1]
                payload = route.request.post_data_json or {}
                state['calls'].append((name, copy.deepcopy(payload)))
                if state['deny']:
                    route.fulfill(status=403, json={'message': 'SURVIVAL_ARCHIVE_OPERATOR_FORBIDDEN'})
                    return
                if name == 'archive_operator_knowledge_editor_get':
                    result = state['data']
                elif name == 'archive_operator_knowledge_editor_save':
                    if state['fail_save'] or payload['p_expected_revision'] != state['data']['revision']:
                        route.fulfill(status=409, json={'message': 'KNOWLEDGE_EDITOR_REVISION_CONFLICT'})
                        return
                    state['data']['revision'] += 1
                    state['data']['brief'] = copy.deepcopy(payload['p_brief'])
                    state['data']['evidence_review'] = copy.deepcopy(payload['p_evidence_review'])
                    result = state['data']
                elif name == 'archive_operator_knowledge_editor_request':
                    assert payload['p_expected_revision'] == state['data']['revision']
                    state['data']['request'] = dict(request_id=JOB, revision=payload['p_expected_revision'],
                        publish_requested=payload['p_publish'], status='CHECKING', result={}, updated_at='2099-01-01T00:00:00Z')
                    result = state['data']['request']
                elif name == 'archive_operator_knowledge_editor_action':
                    state['data']['archived'] = payload['p_action'] == 'ARCHIVE'
                    result = state['data']
                else:
                    route.fulfill(status=403, json={'message': 'QA_DENIES_UNEXPECTED_MUTATION'})
                    return
                route.fulfill(json=copy.deepcopy(result))

            context.route('https://*.supabase.co/**', rpc)
            context.route('https://api.github.com/**', lambda r: r.fulfill(status=403))
            context.route('https://api.netlify.com/**', lambda r: r.fulfill(status=403))
            page.goto(base + f'/operator/knowledge/{JOB}/')
            expect(page.get_by_role('heading', name='운영자 로그인', exact=True)).to_be_visible()
            page.evaluate('(session) => localStorage.setItem("sb-jgsxpdflgkqroecfjzxq-auth-token",JSON.stringify(session))', qa.synthetic_session())
            page.reload()
            expect(page.get_by_role('heading', name=BRIEF['title'], exact=True)).to_be_visible()
            page.get_by_label('도입', exact=True).fill('저장 전 수정한 정확한 도입 문장입니다.')
            page.get_by_role('button', name='발행', exact=True).dblclick()
            expect(page.get_by_role('heading', name='검사 중', exact=True)).to_be_visible()
            saves = [p for n, p in state['calls'] if n.endswith('_save')]
            requests = [p for n, p in state['calls'] if n.endswith('_request')]
            assert len(saves) == 1 and len(requests) == 1
            assert saves[0]['p_brief']['lead'] == '저장 전 수정한 정확한 도입 문장입니다.'
            assert saves[0]['p_brief']['semantic_qa_status'] == 'REVIEW'
            assert requests[0]['p_expected_revision'] == 2 and requests[0]['p_publish'] is True
            assert not page.get_by_role('heading', name='게시됨', exact=True).count()
            state['data']['request']['status'] = 'FAILED'
            state['data']['request']['result'] = {'reason': 'KNOWLEDGE_EDITOR_REQUIRED_CI_FAILED'}
            expect(page.get_by_role('heading', name='발행을 완료하지 못했습니다', exact=True)).to_be_visible(timeout=12000)
            expect(page.get_by_role('button', name='다시 시도', exact=True)).to_be_enabled()
            expect(page.get_by_label('도입', exact=True)).to_have_value('저장 전 수정한 정확한 도입 문장입니다.')
            assert state['data']['original'] == original

            state['data'] = envelope('BLOCKED', archived=True)
            state['calls'] = []
            page.reload()
            expect(page.get_by_role('button', name='복원', exact=True)).to_be_visible()
            expect(page.get_by_role('button', name='발행', exact=True)).to_be_disabled()
            page.get_by_role('button', name='복원', exact=True).click()
            expect(page.get_by_label('도입', exact=True)).to_be_enabled()
            page.get_by_label('도입', exact=True).fill('기존 원고를 보존하고 복원한 뒤 수정한 문장입니다.')
            page.get_by_role('button', name='저장', exact=True).click()
            expect(page.get_by_text('저장됨', exact=True)).to_be_visible()
            page.get_by_role('button', name='미리보기', exact=True).click()
            expect(page.get_by_role('heading', name='글 미리보기', exact=True)).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'horizontal overflow at {width}'
            page.screenshot(path=str(output / f'editor-restored-{width}.png'), full_page=False)

            state['data'] = envelope('HOLD', body=False, archived=True)
            page.reload()
            expect(page.get_by_role('heading', name='원고 미작성', exact=True)).to_be_visible()
            page.get_by_role('button', name='초안 만들기 · 직접 작성', exact=True).click()
            expect(page.get_by_label('제목', exact=True)).to_be_visible()
            assert not [p for n, p in state['calls'] if n.endswith('_request')]

            # Exact, current quote anchors and unsaved/conflicting edits remain private.
            state['data'] = envelope()
            quote = '기관 확인 전에는 현장의 안전 여부를 단정하지 않습니다.'
            state['data']['brief']['sections'][0]['blocks'][0]['text'] = quote
            state['data']['original']['evidence']['unknowns'] = [{'quote': quote, 'reason': '현장 조건의 확인 범위를 설명하세요.'}]
            page.reload()
            expect(page.get_by_role('button', name='해당 문장 수정', exact=True)).to_be_visible()
            page.get_by_role('button', name='해당 문장 수정', exact=True).click()
            page.wait_for_function('(q)=>document.activeElement?.value?.slice(document.activeElement.selectionStart,document.activeElement.selectionEnd)===q', arg=quote)
            assert page.evaluate('document.activeElement.value.slice(document.activeElement.selectionStart,document.activeElement.selectionEnd)') == quote
            expect(page.locator('.knowledge-editor-inline-reason')).to_contain_text('현장 조건')
            page.get_by_role('button', name='+ 섹션 추가', exact=True).click()
            page.locator('.knowledge-draft-section').first.locator('header button').nth(1).click()
            page.get_by_role('button', name='해당 문장 수정', exact=True).click()
            expect(page.locator('.knowledge-draft-editor textarea:focus')).to_have_value(quote)
            focused = page.locator('.knowledge-draft-editor textarea:focus')
            focused.fill(quote + ' ' + quote)
            expect(page.get_by_role('button', name='해당 문장 수정', exact=True)).to_have_count(0)
            expect(page.locator('.knowledge-editor-inline-reason')).to_have_count(0)
            dialogs = []
            def dismiss_navigation(dialog):
                dialogs.append(dialog.type)
                dialog.dismiss()
            page.once('dialog', dismiss_navigation)
            page.get_by_role('link', name='← 글 목록', exact=True).click(no_wait_after=True)
            assert dialogs == ['beforeunload']
            assert '/operator/knowledge/' + JOB in page.url
            state['fail_save'] = True
            page.get_by_role('button', name='저장', exact=True).click()
            expect(page.get_by_role('heading', name='다른 저장본과 비교', exact=True)).to_be_visible()
            assert page.locator('.knowledge-draft-editor').get_by_text('정확히 연결되지').count() == 0
            state['fail_save'] = False
            page.once('dialog', lambda d: d.accept())
            state['deny'] = True
            page.reload()
            expect(page.get_by_role('alert').first).to_be_visible()
            assert page.get_by_role('button', name='발행', exact=True).count() == 0
            assert not errors, errors
            report.append({'mode': 'SYNTHETIC_PRIVATE_CLICK', 'width': width, 'save_before_publish': True,
                           'double_click_one_request': True, 'premature_completion': False,
                           'restoration': True, 'empty_draft': True, 'unauthorized_denied': True, 'exact_moved_anchor': True, 'ambiguous_anchor_hidden': True, 'dirty_navigation_warning': True, 'conflict_preserves_edits': True})
            context.close()
        browser.close()
    server.shutdown()
    (output / 'knowledge-editor-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--screenshots', required=True)
    run(parser.parse_args())
