"""Synthetic-only actual preset clicks, transaction faults and mobile layout."""
import importlib, os
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright, expect
from bag_side_remote import verify_remote
a=importlib.import_module('check-bag-side-alpha')

def open_preset(page,id):
    page.locator('[data-nav="bag"]').click()
    page.locator(f'[data-preset="{id}"]').click()
    expect(page.locator('#editor')).to_be_visible()
    expect(page.locator('[name="packed"]')).not_to_be_checked()
    count=page.locator('[data-preset-row]').count()
    expect(page.locator('.preset-item-detail')).to_have_count(count)
    assert page.locator('.preset-item-detail').first.evaluate('(el)=>!el.open'),'long date/help rows should start folded'
    a.no_overflow(page)

def run(browser,width,base):
    for id,count in [('light',19),('standard',29),('expanded',39)]:
        ctx=browser.new_context(viewport={'width':width,'height':844},locale='ko-KR',timezone_id='Asia/Seoul',accept_downloads=True)
        page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        a.ready(page,a.address(base));original=a.stored(page)
        if id=='light':
            shades=page.locator('.preset-card').evaluate_all('(els)=>els.map(el=>getComputedStyle(el).backgroundColor)')
            assert len(shades)==3 and len(set(shades))==3,'three preset colors must be visually distinct'
            assert page.locator('#catalog-panel').evaluate('(el)=>!el.open'),'catalog should start folded'
            page.screenshot(path=str(a.REPORT/f'preset-home-{width}.png'))
        open_preset(page,id)
        expect(page.locator('#preset-summary')).to_contain_text(f'새로 추가 {count}종 / 기존 유지 0종')
        page.locator('#cancel').click();assert a.stored(page)==original
        open_preset(page,id)
        if width==390: page.screenshot(path=str(a.REPORT/f'preset-preview-{id}-390.png'))
        # One click applies the entire bag; a rapid second submit must do nothing.
        page.locator('#submit').evaluate('(el)=>{el.click();el.click();}')
        expect(page.locator('#editor')).not_to_be_visible()
        saved=a.stored(page);assert len(saved['bag']['items'])==count and saved['revision']==1
        assert all(b['quantity']==0 and b['markedUntil'] is None for i in saved['bag']['items'] for b in i['batches'])
        expect(page.locator('#soon-count')).to_have_text('0')
        expect(a.card(page,'생수').locator('.expiry-warning')).to_contain_text('제품 기한 확인 필요')
        expect(a.card(page,'생수').locator('.draft-note')).to_contain_text('첫 점검 예정일:')
        a.no_overflow(page);page.reload(wait_until='networkidle');assert a.stored(page)==saved
        open_preset(page,id);expect(page.locator('#preset-summary')).to_contain_text(f'새로 추가 0종 / 기존 유지 {count}종');a.confirm_save(page)
        assert a.stored(page)==saved,'repeat changed dates, batches or revision'
        assert a.stored(page)['bag']==a.json.loads(a.backup(page))['bag']
        text=a.backup(page);a.apply_restore(page,text);assert a.stored(page)==saved
        if width==390 and id=='light':
            # Edit a zero-stock draft directly, preserving ID/catalog identity.
            a.card(page,'생수').locator('[data-mode="edit"]').click()
            page.locator('[name="name"]').fill('가상 검증용 아주 긴 이름의 개인 생수 제품 '+('긴이름'*10))
            page.locator('[name="target"]').fill('7')
            page.locator('[name="nextInspection"]').fill('2027-02-28')
            a.no_overflow(page);a.confirm_save(page)
            edited=a.stored(page)
            open_preset(page,'expanded');page.locator('[name="packed"]').check();a.confirm_save(page)
            expanded=a.stored(page);assert len(expanded['bag']['items'])==39
            assert expanded['bag']['items'][:19]==edited['bag']['items']
            assert all(i['batches'][0]['quantity']==i['target'] for i in expanded['bag']['items'][19:])
            a.undo_previous(page);assert a.stored(page)['bag']==edited['bag']
            # Preview selections and dates are editable without saving on change.
            open_preset(page,'expanded')
            newrows=page.locator('[data-preset-row][data-existing="false"]')
            newrows.nth(0).locator('[name="include"]').uncheck()
            newrows.nth(1).locator('[name="target"]').fill('2')
            newrows.nth(1).locator('.preset-item-detail summary').click()
            newrows.nth(1).locator('[name="inspection"]').fill('2027-01-02')
            expect(page.locator('#preset-summary')).to_contain_text('새로 추가 19종')
            assert a.stored(page)['bag']==edited['bag']
            a.confirm_save(page);assert len(a.stored(page)['bag']['items'])==38
            assert any(i['target']==2 and i['batches'][0]['nextInspection']=='2027-01-02' for i in a.stored(page)['bag']['items'][19:])
            a.undo_previous(page)
            # Whole-preset transaction failure must restore CURRENT and PREVIOUS.
            before=a.stored(page);previous=page.evaluate("async()=>(await import('./storage.mjs')).readRawRecord('previous')")
            open_preset(page,'expanded')
            page.evaluate("()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,k){if(k==='current')throw new DOMException('preset quota failure','QuotaExceededError');return window.originalPut.call(this,v,k);};}")
            page.locator('#submit').click();expect(page.locator('#editor-error')).to_contain_text('quota')
            assert a.stored(page)==before
            assert page.evaluate("async()=>(await import('./storage.mjs')).readRawRecord('previous')")==previous
            page.evaluate('()=>IDBObjectStore.prototype.put=window.originalPut');page.locator('#cancel').click()
            # Two real tabs preview the same revision, one wins and one fails closed.
            page2=ctx.new_page();a.ready(page2,a.address(base));open_preset(page,'expanded');open_preset(page2,'expanded')
            a.confirm_save(page);page2.locator('#submit').click();expect(page2.locator('#editor-error')).to_contain_text('다른 탭')
            winner=a.stored(page);assert len(winner['bag']['items'])==39
            page2.close();page.reload(wait_until='networkidle');assert a.stored(page)==winner
            # Tab keyboard navigation and inventory-to-preset shortcut.
            page.locator('[data-nav="bag"]').focus();page.keyboard.press('ArrowRight')
            expect(page.locator('#panel-inventory')).to_be_visible()
            page.locator('[data-command="presets"]').click();expect(page.locator('#preset-panel')).to_be_visible()
            open_preset(page,'light');page.keyboard.press('Escape');expect(page.locator('#editor')).not_to_be_visible()
            page.screenshot(path=str(a.REPORT/'preset-after-390.png'))
        assert not errors,errors
        ctx.close()
    print(f'PASS presets width={width}: all three/cancel/zero stock/double submit/repeat/reload/backup/restore/overflow',flush=True)

def main():
    base=os.environ.get('BAG_LAB_BASE_URL','http://127.0.0.1:8925');expected=os.environ.get('BAG_LAB_EXPECTED_SHA');http=None
    if os.environ.get('BAG_LAB_BASE_URL'):verify_remote(base,expected)
    else:
        http=ThreadingHTTPServer(('127.0.0.1',8925),partial(a.QuietHTTP,directory=str(a.ROOT)))
        Thread(target=http.serve_forever,daemon=True).start()
    a.REPORT.mkdir(parents=True,exist_ok=True)
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
            try:
                for width in (320,390,1280):run(browser,width,base)
            finally:browser.close()
    finally:
        if http:http.shutdown();http.server_close()
if __name__=='__main__':main()
