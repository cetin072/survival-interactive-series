"""BAG-only PWA offline/cohort/persistence gate. Synthetic data; never QA or Production writes."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib, json, os, shutil, re, time
from playwright.sync_api import sync_playwright, expect, Error as PlaywrightError
import importlib.util
spec=importlib.util.spec_from_file_location('bag_alpha',Path(__file__).with_name('check-bag-side-alpha.py'))
alpha=importlib.util.module_from_spec(spec);spec.loader.exec_module(alpha)
ROOT=alpha.ROOT
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()
    def guess_type(self,path):
        if path.endswith(('.mjs','.js')): return 'text/javascript'
        if path.endswith('.webmanifest'): return 'application/manifest+json'
        return super().guess_type(path)
def serve(root):
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(root)))
    Thread(target=server.serve_forever,daemon=True).start()
    return server,'http://127.0.0.1:'+str(server.server_port)
def wait_condition(page,expression,timeout=30000):
    # Playwright's in-page waitForFunction loop reevaluates a string after a
    # timer, which strict branch QA CSP correctly rejects. Poll the SAME read
    # through the automation protocol; never bypass or loosen the site's CSP.
    deadline=time.monotonic()+timeout/1000
    while time.monotonic()<deadline:
        try:
            if page.evaluate('() => ('+expression+')'):return
        except PlaywrightError as error:
            if 'Execution context was destroyed' not in str(error) and 'Cannot find context' not in str(error):raise
        page.wait_for_timeout(100)
    raise AssertionError('Timed out waiting for browser condition: '+expression)

def controlled(page):
    wait_condition(page,'navigator.serviceWorker.controller?.scriptURL.includes("/bag-lab/sw.js")')
    registration=page.evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration("/bag-lab/alpha.html");return {scope:r.scope,active:!!r.active}}')
    assert registration['scope'].endswith('/bag-lab/') and registration['active']
def atomic_text(path,text):
    temporary=path.with_suffix(path.suffix+'.tmp');temporary.write_text(text);temporary.replace(path)
def permission_checks(browser,base):
    # Permissions belong to real, explicitly created disposable contexts. Older
    # Chromium reports a persistent default-context ID it cannot grant to via CDP.
    for permission in ('denied','granted'):
        ctx=browser.new_context(permissions=['notifications'] if permission=='granted' else [])
        try:
            pg=ctx.new_page()
            if permission=='denied':
                session=ctx.new_cdp_session(pg)
                identifier=session.send('Target.getTargetInfo')['targetInfo']['browserContextId']
                session.send('Browser.setPermission',{'permission':{'name':'notifications'},'setting':'denied','origin':base,'browserContextId':identifier})
            alpha.ready(pg,alpha.address(base));controlled(pg)
            actual=pg.evaluate('Notification.permission');assert actual==permission,f'Notification permission expected {permission}, observed {actual} on {browser.version}'
            before=alpha.stored(pg)
            pg.locator('[data-nav="settings"]').click()
            expect(pg.locator('#reminder-time-label')).to_be_hidden();expect(pg.locator('#reminder-settings')).to_be_hidden()
            pg.locator('#reminder-enabled').click()
            if permission=='denied':
                expect(pg.locator('#reminder-permission')).to_have_text('권한 거부됨');expect(pg.locator('#reminder-enabled')).not_to_be_checked();expect(pg.locator('#reminder-test')).to_be_disabled()
            else:
                expect(pg.locator('#reminder-permission')).to_have_text('권한 허용됨')
                details=pg.locator('details').filter(has=pg.get_by_text('알림 문제 해결·권한 설정',exact=True));details.locator('summary').click()
                pg.locator('#reminder-test').click();expect(pg.locator('#reminder-status')).to_contain_text('테스트 알림을 확인해 주세요.')
                expect(pg.locator('#reminder-count')).to_contain_text('0개')
            assert alpha.stored(pg)==before
        finally:ctx.close()
    print('PASS actual browser denied/granted/opt-in/test notification capability; no native-only controls or closed-app web reservations',flush=True)
def regenerate(root,version):
    bag=root/'bag-lab';manifest=bag/'pwa-assets.js'
    data=json.loads(manifest.read_text().split('self.BAG_PWA_BUILD=',1)[1].rstrip(';\n'))
    data['version']=version
    for asset in data['assets']: asset['sha256']=hashlib.sha256((bag/asset['path']).read_bytes()).hexdigest()
    atomic_text(bag/'alpha-shell.txt',(bag/'alpha.html').read_text())
    atomic_text(manifest,'self.BAG_PWA_BUILD='+json.dumps(data)+';\n')
def update(page):
    page.evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration("/bag-lab/alpha.html");await r.update()}')
def main():
    remote=os.environ.get('BAG_LAB_BASE_URL');expected=os.environ.get('BAG_LAB_EXPECTED_SHA')
    if remote:
        # Shared guard permits only exact PR Preview or dedicated BAG branch QA.
        from bag_side_remote import verify_remote
        verify_remote(remote,expected)
    alpha.REPORT.mkdir(parents=True,exist_ok=True)
    with TemporaryDirectory() as temp, sync_playwright() as p:
        root=Path(temp)/'public';shutil.copytree(ROOT,root)
        server,local=serve(root);other,otherbase=serve(root)
        base=remote or local
        kwargs={'headless':True,'channel':'chromium','args':['--no-sandbox']}
        if os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'):kwargs['executable_path']=os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE']
        browser=p.chromium.launch(**kwargs)
        try:
            context=p.chromium.launch_persistent_context(str(Path(temp)/'profile'),**kwargs,viewport={'width':390,'height':844},locale='ko-KR');page=context.pages[0];errors=[];navigations=[]
            page.on('framenavigated',lambda frame:navigations.append(frame.url) if frame==page.main_frame else None)
            page.on('pageerror',lambda error:errors.append(str(error)))
            alpha.ready(page,alpha.address(base));controlled(page);page.wait_for_timeout(300)
            try:wait_condition(page,'false',timeout=10)
            except AssertionError:pass
            else:raise AssertionError('Condition waiter accepted a false predicate')
            assert len(navigations)==1,navigations # Initial SW claim never reloads the first screen.
            manifest=page.evaluate('async()=>await (await fetch("/bag-lab/manifest.webmanifest")).json()')
            assert manifest['display']=='standalone' and manifest['scope']=='/bag-lab/' and manifest['start_url']=='/bag-lab/alpha.html'
            for icon in manifest['icons']:
                dimension=page.evaluate('async path=>{const image=new Image();image.src=path;await image.decode();return [image.naturalWidth,image.naturalHeight]}',icon['src'])
                assert dimension==[int(icon['sizes'].split('x')[0])]*2
            # Chrome's actual installability protocol, rather than manifest syntax alone.
            cdp=context.new_cdp_session(page);cdp.send('Page.enable');print('Chromium',cdp.send('Browser.getVersion')['product'],flush=True);details=cdp.send('Page.getInstallabilityErrors')
            assert details['installabilityErrors']==[],details
            alpha.register(page,'가상 PWA 시험품',2,'equipment',[(1,None,'2030-01-01')]);initial=alpha.stored(page);backup=alpha.backup(page)
            permission_checks(browser,base)
            # Unrelated caches and root routes are neither owned nor removed.
            page.evaluate('async()=>{await (await caches.open("unrelated-existing-cache")).put("/other.txt",new Response("keep"))}')
            outside=context.new_page();outside.goto(base+'/bag-lab/../');assert outside.evaluate('navigator.serviceWorker.controller') is None
            outside.goto(base+'/bag/');assert outside.evaluate('navigator.serviceWorker.controller') is None
            outside.goto(base+'/knowledge/');assert outside.evaluate('navigator.serviceWorker.controller') is None;outside.close()
            context.set_offline(True);page.reload(wait_until='networkidle');expect(page.locator('[data-command="add"]').first).to_be_enabled();assert alpha.stored(page)==initial
            page.locator('[data-nav="inventory"]').click();card=alpha.card(page,'가상 PWA 시험품');card.locator('[data-mode="edit"]').click();page.locator('#editor [name="target"]').fill('3');alpha.confirm_save(page)
            alpha.register(page,'가상 오프라인 등록품',1,'equipment',[(1,None,'2030-02-01')]);offline=alpha.stored(page)
            alpha.ready(page,alpha.address(base));assert alpha.stored(page)==offline
            assert json.loads(alpha.backup(page))['bag']==offline['bag']
            context.set_offline(False);page.reload(wait_until='networkidle');assert alpha.stored(page)==offline
            assert 'unrelated-existing-cache' in page.evaluate('async()=>await caches.keys()')
            print('PASS manifest/icons/Chrome installability/SW scope/online/offline registration+edit/reload/backup/origin path isolation',flush=True)
            if not remote:
                # Partial update: manifest names a different cohort but bytes are stale.
                page.locator('[data-nav="inventory"]').click()
                alpha.card(page,'가상 PWA 시험품').locator('[data-mode="edit"]').click()
                page.locator('#editor [name="target"]').fill('5')
                caches_before=page.evaluate('async()=>await caches.keys()')
                assets=root/'bag-lab'/'pwa-assets.js';old=assets.read_text();atomic_text(assets,old.replace('"version": "','"version": "broken-').replace('"sha256": "','"sha256": "f'))
                update(page);page.wait_for_timeout(1500)
                assert page.evaluate('async()=>!!(await navigator.serviceWorker.getRegistration("/bag-lab/alpha.html")).waiting') is False
                assert page.evaluate('async()=>await caches.keys()')==caches_before
                expect(page.locator('#editor [name="target"]')).to_have_value('5')
                context.set_offline(True);alpha.confirm_save(page);offline=alpha.stored(page)
                assert any(item['target']==5 for item in offline['bag']['items'] if item['name']=='가상 PWA 시험품')
                context.set_offline(True);page.reload(wait_until='networkidle');assert alpha.stored(page)==offline;context.set_offline(False)
                # Healthy update activates only on consent, then reloads a whole cohort.
                editing=context.new_page();editing_errors=[];editing_navigations=[]
                editing.on('pageerror',lambda error:editing_errors.append(str(error)))
                editing.on('framenavigated',lambda frame:editing_navigations.append(frame.url) if frame==editing.main_frame else None)
                alpha.ready(editing,alpha.address(base));controlled(editing)
                editing.locator('[data-nav="inventory"]').click()
                alpha.card(editing,'가상 PWA 시험품').locator('[data-mode="edit"]').click()
                editing.locator('#editor [name="target"]').fill('4')
                editing.evaluate('window.bagTestControllerChanges=0;navigator.serviceWorker.addEventListener("controllerchange",()=>window.bagTestControllerChanges++)')
                context.set_offline(True);atomic_text(assets,old);html=root/'bag-lab'/'alpha.html';html.write_text(html.read_text().replace('나의 생존가방 · 웹 1.0','나의 생존가방 · 업데이트 검증'))
                regenerate(root,'synthetic-update-v2');context.set_offline(False);wait_condition(page,'navigator.onLine');update(page)
                wait_condition(page,'navigator.serviceWorker.getRegistration("/bag-lab/alpha.html").then(r=>!!r.waiting)')
                wait_condition(editing,'!document.getElementById("pwa-update").hidden')
                # The modal prevents normal button access; also exercise the handler guard.
                editing.locator('#pwa-update').evaluate('(button)=>button.click()')
                expect(editing.locator('#pwa-status')).to_contain_text('먼저 저장하거나 취소')
                expect(editing.locator('#editor [name="target"]')).to_have_value('4')
                assert alpha.stored(editing)==offline # input is not a committed inventory write
                # Another tab saves while the old cohort editor remains open.
                page.locator('[data-nav="inventory"]').click()
                alpha.card(page,'가상 PWA 시험품').locator('[data-mode="edit"]').click()
                page.locator('#editor [name="target"]').fill('6');alpha.confirm_save(page);offline=alpha.stored(page)
                page.locator('[data-nav="settings"]').click();expect(page.locator('#pwa-update')).to_be_visible()
                page.locator('#pwa-update').click();wait_condition(page,'document.title.includes("업데이트 검증")');assert alpha.stored(page)==offline
                wait_condition(editing,'window.bagTestControllerChanges===1')
                expect(editing.locator('#editor')).to_be_visible()
                expect(editing.locator('#editor [name="target"]')).to_have_value('4')
                assert len(editing_navigations)==1 # another tab cannot reload an open editor
                editing.locator('#submit').click();expect(editing.locator('#editor-error')).to_contain_text('다른 탭')
                assert alpha.stored(editing)==offline
                expect(editing.locator('#editor [name="target"]')).to_have_value('4')
                editing.locator('#cancel').click()
                editing.locator('[data-nav="settings"]').click()
                if not editing.locator('#backup-panel').evaluate('(el)=>el.open'):editing.locator('#backup-panel>summary').click()
                editing.locator('[data-command="refresh"]').click()
                expect(editing.locator('#save-status')).to_contain_text('버전 '+str(offline['revision']))
                editing.locator('[data-nav="inventory"]').click();alpha.card(editing,'가상 PWA 시험품').locator('[data-mode="edit"]').click()
                editing.locator('#editor [name="target"]').fill('4');alpha.confirm_save(editing);offline=alpha.stored(editing)
                assert offline['revision']>initial['revision']
                assert any(item['target']==4 for item in offline['bag']['items'] if item['name']=='가상 PWA 시험품')
                assert json.loads(alpha.backup(editing))['bag']==offline['bag']
                # No automatic deferred reload promise: close editor/save, explicitly reload.
                context.set_offline(True);alpha.ready(editing,alpha.address(base))
                assert '업데이트 검증' in editing.title() and alpha.stored(editing)==offline
                assert not editing_errors,editing_errors
                editing.close()
                context.set_offline(True);page.reload(wait_until='networkidle');assert '업데이트 검증' in page.title();assert alpha.stored(page)==offline
                assert json.loads(alpha.backup(page))['bag']==offline['bag'];context.set_offline(False)
                second=context.new_page();alpha.ready(second,alpha.address(otherbase));assert alpha.stored(second)['revision']==0;second.close()
                print('PASS failed mixed update retains previous offline cohort; complete version update retains exact IndexedDB/backup; different origins stay separate',flush=True)
                print('PASS two-tab synthetic update preserves open editor/unsaved values, committed inventory/JSON and offline explicit reload; integrated cohort validated',flush=True)
            assert not errors,errors
            page.screenshot(path=str(alpha.REPORT/'pwa-reminders-390.png'),full_page=True)
            context.close()
            # Actual browser process restart, offline, persistent storage + worker.
            with TemporaryDirectory() as profile:
                args={**kwargs,'viewport':{'width':390,'height':844}}
                ctx=p.chromium.launch_persistent_context(profile,**args);pg=ctx.pages[0];alpha.ready(pg,alpha.address(base));controlled(pg)
                alpha.register(pg,'가상 종료 후 기록',1,'equipment',[(1,None,'2030-01-01')]);before=alpha.stored(pg);ctx.close()
                ctx=p.chromium.launch_persistent_context(profile,**args);ctx.set_offline(True);pg=ctx.pages[0];alpha.ready(pg,alpha.address(base));assert alpha.stored(pg)==before;ctx.close()
            print('PASS browser PROCESS close + offline cold start preserves BAG record',flush=True)
        finally:browser.close();server.shutdown();other.shutdown()
if __name__=='__main__':
    try: main()
    except Exception:
        if os.environ.get('GITHUB_ACTIONS')=='true':
            import traceback
            message=traceback.format_exc().replace('%','%25').replace('\r','%0D').replace('\n','%0A')
            print('::error title=BAG PWA evidence::'+message,flush=True)
        raise
