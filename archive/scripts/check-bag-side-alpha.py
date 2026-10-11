"""Real Chromium gate for BAG-SIDE-01 personal Alpha. SYNTHETIC test data only.
Local execution serves only archive/web/public. Optional Preview requires exact SHA.
No Production, user database, scheduler or external write is used.
"""
from __future__ import annotations
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from tempfile import TemporaryDirectory
import json, os, time, urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parent.parent/'web'/'public'
REPORT=Path(__file__).resolve().parent.parent/'reports'/'bag-side-alpha'
class QuietHTTP(SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass

def address(base):
    suffix='?ntl-drawer-state=hidden' if 'netlify.app' in base else ''
    return base.rstrip('/')+'/bag-lab/alpha.html'+suffix

def ready(page,url):
    page.goto(url,wait_until='networkidle',timeout=30000)
    expect(page.locator('[data-command="add"]').first).to_be_enabled()

def stored(page):
    return page.evaluate("async()=> (await import('./storage.mjs')).readBag()")

def confirm_save(page):
    page.locator('#submit').click()
    try:
        expect(page.locator('#editor')).not_to_be_visible()
    except AssertionError:
        print('SAVE_DIAGNOSTIC',page.locator('#editor').inner_text(),flush=True)
        print('INVALID_FIELDS',page.locator('#editor :invalid').evaluate_all('(els)=>els.map(el=>({name:el.name,message:el.validationMessage}))'),flush=True)
        page.screenshot(path=str(REPORT/'save-failure.png'),full_page=True)
        raise

def undo_previous(page):
    page.locator('#undo').click()
    # IndexedDB read is async. A checked checkbox left inside the CLOSED dialog
    # can satisfy Playwright.check() before the new unchecked form is rendered.
    expect(page.locator('#editor')).to_be_visible()
    expect(page.locator('#editor-title')).to_have_text('이전 저장 복원')
    page.locator('#editor [name="confirm"]').check()
    confirm_save(page)

def fill_batch(row,quantity,date=None,inspection=None):
    row.locator('[name="quantity"]').fill(str(quantity))
    if date:
        row.locator('[name="dateType"]').select_option('consumption')
        row.locator('[name="markedUntil"]').fill(date)
    if inspection: row.locator('[name="nextInspection"]').fill(inspection)

def register(page,name,target,category,batches):
    page.locator('[data-command="add"]:visible').first.click()
    form=page.locator('#editor-form')
    form.locator('[name="name"]').fill(name)
    form.locator('[name="category"]').select_option(category)
    form.locator('[name="target"]').fill(str(target))
    for index,values in enumerate(batches):
        if index: form.locator('[data-command="add-batch"]').click()
        fill_batch(form.locator('[data-batch]').nth(index),*values)
    confirm_save(page)

def card(page,name='간편식'):
    return page.locator('.personal-item').filter(has=page.get_by_role('heading',name=name,exact=True))

def backup(page):
    page.locator('[data-nav="inventory"]').click()
    page.locator('#backup-panel').evaluate('(el)=>el.open=true')
    with page.expect_download() as download_info: page.locator('#export').click()
    download=download_info.value
    assert download.failure() is None
    return Path(download.path()).read_text(encoding='utf-8')

def select_backup(page,text):
    page.locator('#backup-panel').evaluate('(el)=>el.open=true')
    page.locator('#import').set_input_files({'name':'test-backup.json','mimeType':'application/json','buffer':text.encode('utf-8')})

def apply_restore(page,text):
    select_backup(page,text)
    expect(page.locator('#editor')).to_be_visible()
    page.locator('#editor [name="confirm"]').check()
    confirm_save(page)

def no_overflow(page):
    dimensions=page.evaluate("""()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
      elements:[...document.querySelectorAll('*')].map(el=>({tag:el.tagName,id:el.id,cls:el.className,
      right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width}))
      .filter(el=>el.right>innerWidth+2)})""")
    dialog_ok=not page.locator('#editor').is_visible() or page.locator('#editor').evaluate('(el)=>el.scrollWidth<=el.clientWidth+2')
    if dimensions['scroll']>dimensions['width']+2 or not dialog_ok:
        page.screenshot(path=str(REPORT/f"overflow-{dimensions['width']}.png"),full_page=True)
        print('OVERFLOW_DIAGNOSTIC',json.dumps(dimensions,ensure_ascii=False),flush=True)
    assert dimensions['scroll']<=dimensions['width']+2,'page horizontal overflow'
    assert dialog_ok,'dialog horizontal overflow'

def check_guided_catalog(page,width):
    """Guidance can prefill a draft but cannot create actual inventory or change backups."""
    original=stored(page)
    expect(page.locator('#catalog-ready-count')).to_contain_text('0 /')
    page.locator('[data-command="catalog"]').click()
    expect(page.locator('#catalog-panel')).to_be_visible()
    expect(page.locator('#catalog-items .catalog-entry')).to_have_count(7)
    food=page.locator('.catalog-entry').filter(has=page.locator('h4',has_text='간편식'))
    food.locator('[data-guide-add]').click()
    expect(page.locator('#editor [name="name"]')).to_have_value('간편식')
    expect(page.locator('#editor [name="category"]')).to_have_value('food')
    expect(page.locator('#editor [name="target"]')).to_have_value('3')
    expect(page.locator('#editor [name="quantity"]')).to_have_value('0')
    assert stored(page)==original,'previewing a guide should never write stock'
    page.locator('#cancel').click()
    page.locator('#family-more').click()
    expect(page.locator('#family-count')).to_have_text('2명')
    food=page.locator('.catalog-entry').filter(has=page.locator('h4',has_text='간편식'))
    food.locator('[data-guide-add]').click()
    expect(page.locator('#editor [name="target"]')).to_have_value('6')
    assert stored(page)==original,'family suggestions should not persist'
    page.locator('#cancel').click()
    page.locator('#family-less').click()
    page.locator('[data-guide-group="documents"]').click()
    expect(page.locator('[data-guide-group="documents"]')).to_have_attribute('aria-pressed','true')
    expect(page.locator('#catalog-items .catalog-entry')).to_have_count(6)
    page.locator('[data-guide-group="food"]').click()
    no_overflow(page)
    if width==390: page.screenshot(path=str(REPORT/'alpha-guided-catalog-390.png'))
    page.locator('[data-nav="bag"]').click()
    assert stored(page)==original

def run(browser,width,base):
    context=browser.new_context(viewport={'width':width,'height':844},locale='ko-KR',timezone_id='Asia/Seoul',accept_downloads=True)
    page=context.new_page();page.set_default_timeout(10000)
    errors=[];page.on('pageerror',lambda error: errors.append(str(error)))
    url=address(base);ready(page,url)
    expect(page.locator('#item-count')).to_have_text('0')
    assert stored(page)['revision']==0 and stored(page)['bag']['items']==[]
    assert page.locator('#panel-inventory').is_hidden()
    no_overflow(page)
    check_guided_catalog(page,width)
    register(page,'간편식',6,'food',[(4,'2027-04-30'),(2,'2027-12-31')])
    register(page,'생수',2,'water',[(2,'2027-05-31')])
    register(page,'손전등',1,'equipment',[(1,None,'2026-11-01')])
    register(page,'보조배터리',1,'equipment',[(1,None,'2026-11-15')])
    register(page,'위생티슈',2,'hygiene',[(2,'2027-07-01')])
    before=stored(page);assert len(before['bag']['items'])==5
    page.reload(wait_until='networkidle')
    expect(page.locator('#item-count')).to_have_text('5')
    assert stored(page)==before,'refresh lost actual records'
    page.locator('[data-nav="inventory"]').click()
    card(page).locator('[data-mode="take"]').click()
    page.locator('#editor [name="quantity"]').fill('2')
    # Two synchronous submissions reproduce fast repeated taps, not two intended actions.
    page.locator('#editor-form').evaluate("form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}")
    expect(page.locator('#editor')).not_to_be_visible()
    after=stored(page);food=after['bag']['items'][0]
    assert [b['quantity'] for b in food['batches']]==[2,2]
    assert after['revision']==before['revision']+1,'double submission wrote twice'
    expect(page.locator('#needs-count')).to_have_text('1')
    card(page).locator('[data-mode="order"]').click()
    page.locator('#editor [name="quantity"]').fill('2');confirm_save(page)
    assert [b['quantity'] for b in stored(page)['bag']['items'][0]['batches']]==[2,2]
    assert stored(page)['bag']['items'][0]['orderedQuantity']==2
    short_backup=backup(page)
    card(page).locator('[data-mode="put"]').click()
    fill_batch(page.locator('#editor [data-batch]'),2,'2028-03-31');no_overflow(page)
    if width==390: page.screenshot(path=str(REPORT/'alpha-mobile-refill.png'))
    confirm_save(page)
    full=stored(page);food=full['bag']['items'][0]
    assert [(b['quantity'],b['markedUntil']) for b in food['batches']]==[(2,'2027-04-30'),(2,'2027-12-31'),(2,'2028-03-31')]
    expect(page.locator('#needs-count')).to_have_text('0')
    full_backup=backup(page)
    assert json.loads(full_backup)['bag']==full['bag']
    select_backup(page,short_backup)
    expect(page.locator('#editor')).to_be_visible()
    assert stored(page)==full,'import selection must not mutate before confirmation'
    page.locator('#cancel').click();assert stored(page)==full
    apply_restore(page,short_backup)
    expect(page.locator('#needs-count')).to_have_text('1')
    restored=stored(page);assert restored['bag']==json.loads(short_backup)['bag']
    apply_restore(page,short_backup)
    assert stored(page)==restored,'re-importing identical backup must not duplicate or rewrite'
    undo_previous(page)
    assert stored(page)['bag']==full['bag'],'previous snapshot did not restore exact pre-import state'
    stable=stored(page)
    malformed=['{',full_backup.replace('BAG-SIDE-01','OTHER'),full_backup.replace('2027-04-30','2027-02-30'),'x'*(1024*1024+1)]
    duplicate=json.loads(full_backup);duplicate['bag']['items'][0]['batches'][1]['id']=duplicate['bag']['items'][0]['batches'][0]['id']
    malformed.append(json.dumps(duplicate,ensure_ascii=False))
    for text in malformed:
        select_backup(page,text)
        expect(page.locator('#save-status')).to_contain_text('복원하지 않았습니다')
        assert stored(page)==stable,'invalid import changed the original'
    # Injection-shaped names are plain text, never HTML or script.
    hostile=json.loads(full_backup);hostile['bag']['items'][0]['name']='<img src=x onerror=alert(1)>'
    apply_restore(page,json.dumps(hostile,ensure_ascii=False))
    assert page.locator('.personal-item img').count()==0
    expect(page.get_by_role('heading',name='<img src=x onerror=alert(1)>',exact=True)).to_be_visible()
    apply_restore(page,full_backup)
    page.locator('[data-nav="bag"]').click()
    page.locator('.upcoming-row').first.click()
    assert page.locator('#panel-inventory').is_visible()
    assert page.locator('.personal-item').evaluate_all('(els)=>els.some(el=>el===document.activeElement)')
    no_overflow(page)
    page.screenshot(path=str(REPORT/f'alpha-inventory-{width}.png'))
    page.locator('[data-nav="bag"]').click();no_overflow(page)
    page.screenshot(path=str(REPORT/f'alpha-home-{width}.png'))
    page.locator('[data-nav="bag"]').focus();page.keyboard.press('ArrowRight')
    expect(page.locator('[data-nav="inventory"]')).to_have_attribute('aria-selected','true')
    page.locator('[data-nav="learn"]').click();expect(page.locator('#panel-learn')).to_be_visible()
    # Browser storage remains functional with the already loaded page offline.
    context.set_offline(True)
    page.locator('[data-nav="inventory"]').click()
    page.locator('[data-command="settings"]').click()
    page.locator('#editor [name="bagName"]').fill('오프라인 시험 가방')
    page.locator('#editor [name="rotationLeadDays"]').fill('30');confirm_save(page)
    assert stored(page)['bag']['bagName']=='오프라인 시험 가방'
    context.set_offline(False)
    # Deletes require confirmation; recovery copy makes the confirmed delete reversible.
    prior_delete=stored(page)['bag']
    card(page).locator('[data-mode="delete"]').click();page.locator('#cancel').click()
    assert stored(page)['bag']==prior_delete
    card(page).locator('[data-mode="delete"]').click();page.locator('#editor [name="confirm"]').check();confirm_save(page)
    assert len(stored(page)['bag']['items'])==4
    undo_previous(page)
    assert stored(page)['bag']==prior_delete
    if width==390:
        faults(page,context,url)
    assert not errors,'browser JS errors: '+str(errors)
    context.close()
    print(f'PASS Alpha width={width}: register/refresh/6->4->6/double-tap/backup/restore/undo/invalid import/XSS/tabs/offline/delete')

def faults(page,context,url):
    # True multi-tab stale edit: old screen is not allowed to replace newer data.
    page2=context.new_page();ready(page2,url);page2.locator('[data-nav="inventory"]').click()
    card(page).locator('[data-mode="edit"]').click()
    card(page2).locator('[data-mode="edit"]').click()
    page.locator('#editor [name="target"]').fill('7');confirm_save(page)
    page2.locator('#editor [name="target"]').fill('8');page2.locator('#submit').click()
    expect(page2.locator('#editor-error')).to_contain_text('다른 탭')
    assert stored(page)['bag']['items'][0]['target']==7
    assert page2.locator('#editor [name="target"]').input_value()=='8','stale error discarded typed input'
    page2.close()
    # Throw after recovery-copy PUT, before current PUT; both writes must roll back.
    old=stored(page)
    previous=page.evaluate("async()=>(await import('./storage.mjs')).readRawRecord('previous')")
    page.evaluate("()=>{window.originalPut=IDBObjectStore.prototype.put; IDBObjectStore.prototype.put=function(v,k){if(k==='current')throw new DOMException('test quota failure','QuotaExceededError');return window.originalPut.call(this,v,k);};}")
    card(page).locator('[data-mode="edit"]').click();page.locator('#editor [name="target"]').fill('9');page.locator('#submit').click()
    expect(page.locator('#editor-error')).to_contain_text('quota')
    assert stored(page)==old,'quota failure changed current'
    assert page.evaluate("async()=>(await import('./storage.mjs')).readRawRecord('previous')")==previous,'quota failure changed recovery copy'
    page.evaluate('()=>{IDBObjectStore.prototype.put=window.originalPut;delete window.originalPut;}');page.locator('#cancel').click()
    # Two concurrent writes at same revision: transactional winner + explicit conflict.
    result=page.evaluate("""async()=>{const m=await import('./storage.mjs'),r=await m.readBag();const a={...r.bag,bagName:'transaction A'},b={...r.bag,bagName:'transaction B'};return (await Promise.allSettled([m.saveBag(a,r.revision),m.saveBag(b,r.revision)])).map(x=>x.status==='fulfilled'?'OK':x.reason.code);} """)
    assert sorted(result)==['OK','STALE']
    # Future stored schema is preserved byte-for-byte, never replaced with samples.
    raw=stored(page);raw['bag']['schemaVersion']=999
    page.evaluate("""raw=>new Promise((resolve,reject)=>{const r=indexedDB.open('bag-side-01-alpha',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put(raw,'current');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};r.onerror=()=>reject(r.error);})""",raw)
    page.reload(wait_until='networkidle')
    expect(page.locator('#load-error')).to_be_visible()
    expect(page.locator('[data-command="add"]').first).to_be_disabled()
    expect(page.locator('#item-count')).to_have_text('—')
    assert page.evaluate("async()=>(await import('./storage.mjs')).readRawRecord()")==raw
    with page.expect_download() as download_info: page.locator('#raw-export').click()
    assert json.loads(Path(download_info.value.path()).read_text())==raw
    print('PASS fault boundaries: stale tab / aborted quota transaction / concurrent write / future schema preserved / raw recovery export')

def persistent_reopen(p,base,executable):
    with TemporaryDirectory(prefix='bag-alpha-profile-') as profile:
        args={'headless':True,'args':['--no-sandbox'],'viewport':{'width':390,'height':844},'locale':'ko-KR'}
        if executable: args['executable_path']=executable
        ctx=p.chromium.launch_persistent_context(profile,**args)
        page=ctx.pages[0];ready(page,address(base));register(page,'재실행 확인품',1,'equipment',[(1,None,'2027-01-01')]);original=stored(page);ctx.close()
        ctx=p.chromium.launch_persistent_context(profile,**args)
        page=ctx.pages[0];ready(page,address(base));assert stored(page)==original;ctx.close()
    print('PASS browser process close/reopen retains exact IndexedDB record')

def denied_storage(browser,base):
    context=browser.new_context();page=context.new_page()
    page.add_init_script("Object.defineProperty(window,'indexedDB',{get(){throw new DOMException('test storage denied','SecurityError')}})")
    page.goto(address(base),wait_until='networkidle')
    expect(page.locator('#load-error')).to_be_visible()
    expect(page.locator('#item-count')).to_have_text('—')
    expect(page.locator('[data-command="add"]').first).to_be_disabled()
    context.close();print('PASS denied storage: no fake empty/saved state')

def verify_preview(base,expected):
    for attempt in range(24):
        try:
            with urllib.request.urlopen(base.rstrip('/')+'/deploy-meta.json',timeout=8) as response: metadata=json.load(response)
            if metadata.get('commit_ref')==expected and metadata.get('context')=='deploy-preview':
                print('PASS exact Alpha Preview SHA:',expected);return
        except Exception:
            if attempt==23: raise
        time.sleep(5)
    raise AssertionError('Preview exact SHA did not become ready')

def main():
    base=os.environ.get('BAG_LAB_BASE_URL','http://127.0.0.1:8924')
    expected=os.environ.get('BAG_LAB_EXPECTED_SHA');http=None
    if expected: verify_preview(base,expected)
    elif os.environ.get('BAG_LAB_BASE_URL'): raise RuntimeError('Remote testing requires BAG_LAB_EXPECTED_SHA; Production is not a test target.')
    else:
        http=ThreadingHTTPServer(('127.0.0.1',8924),partial(QuietHTTP,directory=str(ROOT)))
        Thread(target=http.serve_forever,daemon=True).start()
    REPORT.mkdir(parents=True,exist_ok=True)
    executable=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE')
    try:
        with sync_playwright() as p:
            kwargs={'headless':True,'args':['--no-sandbox']}
            if executable: kwargs['executable_path']=executable
            browser=p.chromium.launch(**kwargs)
            try:
                for width in (320,390,1280): run(browser,width,base)
                denied_storage(browser,base)
            finally: browser.close()
            persistent_reopen(p,base,executable)
    finally:
        if http: http.shutdown();http.server_close()
    print('PASS BAG-SIDE-01 local/backup Alpha browser gate')
if __name__=='__main__': main()
