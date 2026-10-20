"""Read-only local Operator fixture, public-output exclusion and 320/390/1280px checks.
No real authentication, DB, GitHub write or Production request is performed.
"""
import base64,hashlib,json,socket,subprocess,tempfile,time,urllib.parse,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[2]
WEB=ROOT/'archive/web'
DOCS=ROOT/'docs/bunker_os/bag_knowledge'

def main():
    registry=json.loads((DOCS/'ARTICLE_REGISTRY_V1.json').read_text())
    queue=json.loads((DOCS/'DRAFT_QUEUE_V1.json').read_text())
    published=json.loads((WEB/'dist/knowledge/bag/index.json').read_text())
    assert len(published)==8
    assert not (WEB/'dist/bag-review').exists()
    assert not list((WEB/'dist').rglob('GUIDE_*.md'))
    assert not list((WEB/'dist').rglob('ARTICLE_REGISTRY_V1.json'))
    assert not list((WEB/'dist').rglob('SOURCE_RECEIPTS_V1.json'))
    public_ids={p['id'] for p in published}
    for id,item in registry['articles'].items():
        if id not in public_ids and item['slug']:
            assert not (WEB/'dist/knowledge/bag'/item['slug']).exists()
    available={id:item for id,item in registry['articles'].items() if item['file']}
    def listing(ref):
        return [{'type':'file','name':item['file'],'sha':item['source']['blob']} for id,item in available.items() if ref!='main' or id in public_ids]
    state={'bad_read':False,'deny_list':False}
    def github(route):
        req=route.request
        assert req.method=='GET' and 'authorization' not in req.headers
        url=urllib.parse.urlsplit(req.url)
        path=urllib.parse.unquote(url.path.split('/contents/',1)[1]).rstrip('/')
        ref=urllib.parse.parse_qs(url.query)['ref'][0]
        if path=='docs/bunker_os/bag_knowledge':
            if state['deny_list']:route.fulfill(status=403,body='rate limit');return
            route.fulfill(json=listing(ref));return
        if path.endswith('SOURCE_RECEIPTS_V1.json'):route.fulfill(status=404);return
        p=ROOT/path
        if p.name=='DRAFT_QUEUE_V1.json':raw=json.dumps(queue).encode();blob='f'*40
        else:
            raw=p.read_bytes();blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
        if state['bad_read']:blob='0'*40
        route.fulfill(json={'type':'file','encoding':'base64','sha':blob,'content':base64.b64encode(raw).decode()})
    fixture=WEB/'.bag-inbox-qa.html'
    html='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import {OperatorBagKnowledgeInbox} from '/src/archive/OperatorBagKnowledgeInbox.tsx';
import '/src/archive/operator.css';createRoot(document.getElementById('root')).render(React.createElement(OperatorBagKnowledgeInbox));
</script></body></html>'''
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    base='http://127.0.0.1:'+str(port)
    with fixture.open('x') as f:f.write(html)
    server=None
    try:
      with tempfile.TemporaryFile() as log:
        server=subprocess.Popen(['npm','run','dev','--','--host','127.0.0.1','--port',str(port),'--strictPort'],cwd=WEB,stdout=log,stderr=log,start_new_session=True)
        for _ in range(100):
            try:
                with urllib.request.urlopen(base+'/.bag-inbox-qa.html',timeout=1) as r:
                    if r.status==200:break
            except Exception:time.sleep(.1)
        else:raise AssertionError('Vite fixture did not start')
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
            try:
                for width in (320,390,1280):
                    ctx=browser.new_context(viewport={'width':width,'height':844})
                    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                    page.route('https://api.github.com/**',github)
                    page.route('**/deploy-meta.json',lambda route:route.fulfill(json={'context':'deploy-preview'}))
                    page.route('**/knowledge/bag/index.json',lambda route:route.fulfill(json=published))
                    page.goto(base+'/.bag-inbox-qa.html',wait_until='networkidle')
                    expect(page.locator('#bag-knowledge-draft-inbox')).to_contain_text(f'{len(available)}/49편 원문 확인')
                    expect(page.locator('#bag-knowledge-draft-inbox')).to_contain_text('정식 게시 SHA 확인 0')
                    expect(page.locator('.operator-bag-draft-list>li')).to_have_count(len(available)-8)
                    first=page.locator('.operator-bag-draft-button').first
                    first.click();expect(page.locator('.operator-bag-draft-article')).to_be_visible()
                    expect(page.locator('.operator-bag-draft-reader')).to_contain_text('Git blob:')
                    assert not page.locator('.operator-bag-draft-article script').count()
                    page.get_by_role('button',name='전체 49',exact=True).click()
                    expect(page.locator('.operator-bag-draft-list>li')).to_have_count(49)
                    expect(page.locator('.operator-bag-draft-button:disabled')).to_have_count(len(registry['missing']))
                    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),width
                    report=ROOT/'archive/reports/bag-manuscripts';report.mkdir(parents=True,exist_ok=True)
                    page.screenshot(path=str(report/f'operator-fixture-{width}.png'),full_page=True)
                    state['bad_read']=True
                    page.locator('.operator-bag-draft-button:not(:disabled)').first.click()
                    expect(page.locator('.operator-bag-draft-reader [role="alert"]')).to_contain_text('BAG_DRAFT_CHANGED_REFRESH_REQUIRED')
                    state['bad_read']=False;state['deny_list']=True
                    page.get_by_role('button',name='목록 새로고침',exact=True).click()
                    expect(page.locator('[role="alert"]')).to_contain_text('403')
                    expect(page.locator('.operator-bag-draft-list>li')).to_have_count(0)
                    expect(page.locator('.operator-bag-draft-reader')).to_have_count(0)
                    state['deny_list']=False
                    assert not errors,errors
                    ctx.close()
                    print(f'PASS Operator fixture {width}px: actual-file progress, 49 slots, SHA drift/403 fail closed, Preview not Production',flush=True)
                # The real route still requires its existing login. No draft API before login.
                ctx=browser.new_context();page=ctx.new_page();github_requests=[]
                page.on('request',lambda req:github_requests.append(req.url) if 'api.github.com' in req.url else None)
                page.goto(base+'/operator/knowledge/',wait_until='networkidle')
                expect(page.locator('#bag-knowledge-draft-inbox')).to_have_count(0)
                assert not github_requests,github_requests
                ctx.close()
                print('PASS actual anonymous Operator route: no manuscript shelf or GitHub draft fetch; authenticated fixture is not a server authorization test',flush=True)
            finally:browser.close()
    finally:
        fixture.unlink(missing_ok=True)
        if server:
            import os,signal
            os.killpg(server.pid,signal.SIGTERM);server.wait(timeout=10)

if __name__=='__main__':main()
