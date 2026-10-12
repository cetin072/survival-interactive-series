"""BAG-only PWA offline/cohort/persistence gate. Synthetic data; never QA or Production writes."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib, json, os, shutil, re, time
from playwright.sync_api import sync_playwright, expect
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
def controlled(page):
    page.wait_for_function('navigator.serviceWorker.controller?.scriptURL.includes("/bag-lab/sw.js")')
    registration=page.evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration("/bag-lab/alpha.html");return {scope:r.scope,active:!!r.active}}')
    assert registration['scope'].endswith('/bag-lab/') and registration['active']
def regenerate(root,version):
    bag=root/'bag-lab';manifest=bag/'pwa-assets.js'
    data=json.loads(manifest.read_text().split('self.BAG_PWA_BUILD=',1)[1].rstrip(';\n'))
    data['version']=version
    for asset in data['assets']: asset['sha256']=hashlib.sha256((bag/asset['path']).read_bytes()).hexdigest()
    manifest.write_text('self.BAG_PWA_BUILD='+json.dumps(data)+';\n')
def update(page):
    page.evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration("/bag-lab/alpha.html");await r.update()}')
def main():
    remote=os.environ.get('BAG_LAB_BASE_URL');expected=os.environ.get('BAG_LAB_EXPECTED_SHA')
    if remote:
        assert re.fullmatch(r'https://deploy-preview-[1-9][0-9]*--survival-diary-archive\.netlify\.app',remote.rstrip('/')),'Only per-PR Preview is permitted'
        from bag_side_remote import verify_remote
        verify_remote(remote,expected)
    alpha.REPORT.mkdir(parents=True,exist_ok=True)
    with TemporaryDirectory() as temp, sync_playwright() as p:
        root=Path(temp)/'public';shutil.copytree(ROOT,root)
        server,local=serve(root);other,otherbase=serve(root)
        base=remote or local
        kwargs={'headless':True,'args':['--no-sandbox']}
        if os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'):kwargs['executable_path']=os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE']
        browser=p.chromium.launch(**kwargs)
        try:
            context=p.chromium.launch_persistent_context(str(Path(temp)/'profile'),**kwargs,viewport={'width':390,'height':844},locale='ko-KR');page=context.pages[0];errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            alpha.ready(page,alpha.address(base));controlled(page)
            manifest=page.evaluate('async()=>await (await fetch("/bag-lab/manifest.webmanifest")).json()')
            assert manifest['display']=='standalone' and manifest['scope']=='/bag-lab/' and manifest['start_url']=='/bag-lab/alpha.html'
            for icon in manifest['icons']:
                dimension=page.evaluate('async path=>{const image=new Image();image.src=path;await image.decode();return [image.naturalWidth,image.naturalHeight]}',icon['src'])
                assert dimension==[int(icon['sizes'].split('x')[0])]*2
            # Chrome's actual installability protocol, rather than manifest syntax alone.
            cdp=context.new_cdp_session(page);cdp.send('Page.enable');details=cdp.send('Page.getInstallabilityErrors')
            assert details['installabilityErrors']==[],details
            alpha.register(page,'가상 PWA 시험품',2,'equipment',[(1,None,'2030-01-01')]);initial=alpha.stored(page);backup=alpha.backup(page)
            # Unrelated caches and root routes are neither owned nor removed.
            page.evaluate('async()=>{await (await caches.open("unrelated-existing-cache")).put("/other.txt",new Response("keep"))}')
            outside=context.new_page();outside.goto(base+'/bag-lab/../');assert outside.evaluate('navigator.serviceWorker.controller') is None
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
                caches_before=page.evaluate('async()=>await caches.keys()')
                assets=root/'bag-lab'/'pwa-assets.js';old=assets.read_text();assets.write_text(old.replace('"version": "','"version": "broken-').replace('"sha256": "','"sha256": "f'))
                update(page);page.wait_for_timeout(1500)
                assert page.evaluate('async()=>!!(await navigator.serviceWorker.getRegistration("/bag-lab/alpha.html")).waiting') is False
                assert page.evaluate('async()=>await caches.keys()')==caches_before
                context.set_offline(True);page.reload(wait_until='networkidle');assert alpha.stored(page)==offline;context.set_offline(False)
                # Healthy update activates only on consent, then reloads a whole cohort.
                assets.write_text(old);html=root/'bag-lab'/'alpha.html';html.write_text(html.read_text().replace('로컬 기록 Alpha','업데이트 검증 Alpha'))
                regenerate(root,'synthetic-update-v2');update(page)
                page.wait_for_function('navigator.serviceWorker.getRegistration("/bag-lab/alpha.html").then(r=>!!r.waiting)')
                page.locator('[data-nav="settings"]').click();expect(page.locator('#pwa-update')).to_be_visible()
                page.locator('#pwa-update').click();page.wait_for_function('document.title.includes("업데이트 검증")');assert alpha.stored(page)==offline
                context.set_offline(True);page.reload(wait_until='networkidle');assert '업데이트 검증' in page.title();assert alpha.stored(page)==offline
                assert json.loads(alpha.backup(page))['bag']==offline['bag'];context.set_offline(False)
                second=context.new_page();alpha.ready(second,alpha.address(otherbase));assert alpha.stored(second)['revision']==0;second.close()
                print('PASS failed mixed update retains previous offline cohort; complete version update retains exact IndexedDB/backup; different origins stay separate',flush=True)
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
if __name__=='__main__':main()
