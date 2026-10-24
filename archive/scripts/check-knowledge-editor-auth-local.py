"""Real local GoTrue -> JWT -> PostgREST -> editor RPC integration.

Requires the isolated CI DB bootstrap, GoTrue and PostgREST on one Docker
--internal network. Never accepts public endpoints or an existing remote account.
The web build must use VITE_SUPABASE_URL=http://127.0.0.1:54330 and a dummy key.
No Auth/RPC responses are mocked. net.http_post is the CI stub, so requests cannot
reach GitHub or publish. Test users and drafts exist only in the disposable DB.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import copy
import base64
import functools
import hashlib
import hmac
import http.server
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[2]
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
SECRET = 'local-editor-integration-only-not-a-production-secret'
PASSWORD = 'Private-local-fixture-only-626!'

def run(args):
    # Refuse external endpoints and any container with an egress-capable network.
    for url in [args.auth_url, args.rest_url]:
        parsed = urlparse(url)
        assert parsed.scheme == 'http' and ipaddress.ip_address(parsed.hostname).is_private
    info = json.loads(subprocess.check_output(['docker', 'inspect', args.db_container]))[0]
    assert info['Name'].startswith('/knowledge-editor-626-')
    allowed_addresses=set()
    for name in info['NetworkSettings']['Networks']:
        network=json.loads(subprocess.check_output(['docker', 'network', 'inspect', name]))[0]
        assert network['Internal']
        allowed_addresses.update(c['IPv4Address'].split('/')[0] for c in network['Containers'].values())
    assert all(urlparse(url).hostname in allowed_addresses for url in [args.auth_url,args.rest_url])
    def sql(statement):
        return subprocess.check_output(['docker', 'exec', '-i', '-e', 'PGUSER=postgres', args.db_container, 'psql', '-d', 'knowledge_semantic_test', '-v', 'ON_ERROR_STOP=1', '-At'], input=statement.encode()).decode().strip()
    assert sql("select pg_get_functiondef('net.http_post(text,jsonb,jsonb,integer)'::regprocedure)").find('SELECT 1::bigint') >= 0
    def call(url, body=None, token=None):
        headers={'Content-Type':'application/json'}
        if token: headers['Authorization']='Bearer '+token
        request=urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            with OPENER.open(request, timeout=15) as response: return json.load(response)
        except urllib.error.HTTPError as error:
            # Server errors only; never log passwords, JWTs or request headers.
            if error.code not in (403,409): print('LOCAL_API_ERROR',urlparse(url).path,error.code,error.read().decode(),flush=True)
            raise
    def jwt(role):
        encode=lambda v:base64.urlsafe_b64encode(json.dumps(v).encode()).rstrip(b'=')
        data=encode({'alg':'HS256','typ':'JWT'})+b'.'+encode({'role':role,'exp':int(time.time())+3600})
        return (data+b'.'+base64.urlsafe_b64encode(hmac.new(SECRET.encode(),data,hashlib.sha256).digest()).rstrip(b'=')).decode()
    service=jwt('service_role')
    def rpc(name, body, token=service): return call(args.rest_url+'/rpc/'+name, body, token)
    suffix=str(int(time.time()))
    accounts={}
    for name,role in [('editor','00000000-0000-4000-8000-000000000003'),('viewer','00000000-0000-4000-8000-000000000005')]:
        email=f'{name}-{suffix}@example.test'
        result=call(args.auth_url+'/signup',{'email':email,'password':PASSWORD})
        uid=result['user']['id']
        assert len(uid)==36 and all(c in '0123456789abcdef-' for c in uid)
        sql(f"insert into public.profiles(id,display_name,role_id,active) values('{uid}','Local fixture','{role}',true);")
        accounts[name]={'email':email,'token':result['access_token']}
    original_counts=sql('select (select count(*) from survival_ops.knowledge_semantic_jobs), (select count(*) from survival_ops.archive_review_items);')
    sources=json.loads(subprocess.check_output(['node',str(ROOT/'archive/scripts/knowledge-editor-import-legacy.mjs'),'--commit',subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT).decode().strip()]))
    documents={s['brief_id']:rpc('archive_worker_knowledge_editor_import_legacy',{'p_source':s}) for s in sources}
    sql("insert into vault.decrypted_secrets(name,decrypted_secret,created_at) values('archive_github_dispatch_token','local-no-dispatch',clock_timestamp());")
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*args): pass
        def do_OPTIONS(self): self.send_response(204);self.end_headers()
        def proxy(self):
            prefix, upstream=('/auth/v1',args.auth_url) if self.path.startswith('/auth/v1') else ('/rest/v1',args.rest_url)
            body=self.rfile.read(int(self.headers.get('Content-Length',0)))
            headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','content-length','connection','accept-encoding')}
            request=urllib.request.Request(upstream+self.path[len(prefix):], data=body if body else None, headers=headers, method=self.command)
            try: response=OPENER.open(request,timeout=15)
            except urllib.error.HTTPError as error: response=error
            with response:
                data=response.read(); self.send_response(response.status)
                self.send_header('Content-Type',response.headers.get('Content-Type','application/json'));self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        def do_POST(self): self.proxy()
        def do_GET(self):
            if self.path.startswith(('/auth/v1','/rest/v1')): self.proxy();return
            if self.path.startswith('/operator'): self.path='/index.html'
            super().do_GET()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',54330),functools.partial(Handler,directory=str(ROOT/'archive/web/dist')))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    report=[]
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'))
            context=browser.new_context(viewport={'width':390,'height':900})
            # Deny all external browser traffic. Local API traffic passes through untouched.
            context.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).hostname=='127.0.0.1' else r.abort())
            page=context.new_page()
            page.goto('http://127.0.0.1:54330/operator/knowledge/')
            page.get_by_label('이메일',exact=True).fill(accounts['editor']['email']);page.get_by_label('비밀번호',exact=True).fill(PASSWORD)
            page.get_by_role('button',name='로그인',exact=True).click()
            expect(page.get_by_role('heading',name='생존지식 글 관리',exact=True)).to_be_visible()
            token=accounts['editor']['token']
            for index,(brief_id,document_id) in enumerate(documents.items()):
                width=[320,390,1280][index%3];page.set_viewport_size({'width':width,'height':900})
                before=rpc('archive_operator_knowledge_editor_get',{'p_job_id':document_id},token)
                page.goto('http://127.0.0.1:54330/operator/knowledge/'+document_id+'/')
                value='실제 로컬 로그인으로 저장한 비공개 검증 문장입니다.'
                page.get_by_label('도입',exact=True).fill(value)
                page.get_by_role('button',name='저장',exact=True).click()
                expect(page.get_by_text('저장됨',exact=True)).to_be_visible()
                page.reload();expect(page.get_by_label('도입',exact=True)).to_have_value(value)
                after=rpc('archive_operator_knowledge_editor_get',{'p_job_id':document_id},token)
                assert after['revision']==before['revision']+1 and after['draft_sha256']
                assert after['original']==before['original'] and after['public_record'] is None and after['request'] is None
                conflict_started=time.monotonic()
                try: rpc('archive_operator_knowledge_editor_save',{'p_job_id':document_id,'p_expected_revision':before['revision'],'p_brief':after['brief'],'p_evidence_review':after['evidence_review']},token);raise AssertionError('stale save accepted')
                except urllib.error.HTTPError as error: assert error.code==409 and time.monotonic()-conflict_started<5
                page.get_by_role('button',name='현재 수정본 재검사',exact=True).click()
                expect(page.get_by_role('button',name='요청 취소',exact=True)).to_be_visible()
                checked=rpc('archive_operator_knowledge_editor_get',{'p_job_id':document_id},token)
                assert checked['request']['publish_requested'] is False
                page.get_by_role('button',name='요청 취소',exact=True).click()
                expect(page.get_by_role('button',name='발행',exact=True)).to_be_enabled()
                # Exercise only request creation/cancellation; the isolated dispatch is a stub.
                page.get_by_role('button',name='발행',exact=True).click()
                expect(page.get_by_role('button',name='요청 취소',exact=True)).to_be_visible()
                requested=rpc('archive_operator_knowledge_editor_get',{'p_job_id':document_id},token)
                assert requested['request']['publish_requested'] is True and requested['request']['revision']==after['revision']
                page.get_by_role('button',name='요청 취소',exact=True).click()
                expect(page.get_by_role('button',name='발행',exact=True)).to_be_enabled()
                try: rpc('archive_operator_knowledge_editor_get',{'p_job_id':document_id},accounts['viewer']['token']);raise AssertionError('viewer accessed editor')
                except urllib.error.HTTPError as error: assert error.code==403
                try: rpc('archive_operator_knowledge_editor_save',{'p_job_id':document_id,'p_expected_revision':after['revision'],'p_brief':after['brief'],'p_evidence_review':after['evidence_review']},accounts['viewer']['token']);raise AssertionError('viewer saved')
                except urllib.error.HTTPError as error: assert error.code==403
                page.screenshot(path=str(output/(brief_id+'.png')))
                report.append({'brief_id':brief_id,'width':width,'real_local_login_save_reload':'PASS','source_preserved':True,'check_only_and_publish_intent_cancel':'PASS','viewer_denied':True,'production_publication':False})
            # Two independent HTTP connections: one saved revision can win either
            # a concurrent edit or request, never both; no lock cycle may hang.
            target=documents['K-002']
            state=rpc('archive_operator_knowledge_editor_get',{'p_job_id':target},token)
            changed=copy.deepcopy(state['brief']);changed['lead']+=' 동시성 검증.'
            def race(name,body):
                try: return (True,rpc(name,body,token))
                except urllib.error.HTTPError as error:
                    assert error.code in (400,409);return (False,None)
            started=time.monotonic()
            with ThreadPoolExecutor(max_workers=2) as pool:
                save=pool.submit(race,'archive_operator_knowledge_editor_save',{'p_job_id':target,'p_expected_revision':state['revision'],'p_brief':changed,'p_evidence_review':state['evidence_review']})
                request=pool.submit(race,'archive_operator_knowledge_editor_request',{'p_job_id':target,'p_expected_revision':state['revision'],'p_publish':False})
                assert sum([save.result()[0],request.result()[0]])==1
            assert time.monotonic()-started<5
            current=rpc('archive_operator_knowledge_editor_get',{'p_job_id':target},token)
            if current['request'] and current['request']['status']=='QUEUED': rpc('archive_operator_knowledge_editor_cancel',{'p_request_id':current['request']['request_id']},token)
            report.append({'concurrent_save_request':'PASS','bounded_conflict_response':'PASS'})
            browser.close()
    finally: server.shutdown()
    assert sql('select (select count(*) from survival_ops.knowledge_semantic_jobs), (select count(*) from survival_ops.archive_review_items);')==original_counts
    (output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--auth-url',required=True);parser.add_argument('--rest-url',required=True);parser.add_argument('--db-container',required=True);parser.add_argument('--output',required=True)
    run(parser.parse_args())
