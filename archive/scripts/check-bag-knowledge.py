"""Eight review-only reader pages; exact Preview/QA and synthetic inventory."""
import importlib, os, json, re
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from bag_side_remote import verify_remote
landing=importlib.import_module('check-bag-landing')

def main():
    base=os.environ.get('BAG_LANDING_BASE_URL');server=None
    if base:verify_remote(base,os.environ.get('BAG_LANDING_EXPECTED_SHA'))
    else:server,base=landing.serve(Path(os.environ.get('BAG_LANDING_ROOT',landing.ROOT/'web'/'dist')))
    report=landing.ROOT/'reports'/'bag-knowledge';report.mkdir(parents=True,exist_ok=True)
    # Same existing Preview-only tooling control as BAG/landing acceptance.
    # Keep actual app click/href assertions; do not force clicks through an overlay.
    preview='deploy-preview-' in base
    def url(path):return base+path+('?ntl-drawer-state=hidden' if preview else '')
    def clear_preview_drawer(page):
        if preview:page.goto(page.url+('&' if '?' in page.url else '?')+'ntl-drawer-state=hidden',wait_until='networkidle')
    try:
      with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
        for width in (320,390,1280):
          ctx=browser.new_context(viewport={'width':width,'height':844},locale='ko-KR');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
          page.goto(url('/bag-review/'),wait_until='networkidle');expect(page.locator('h1')).to_have_text('물품 지식 발행 검토')
          links=page.locator('li>a').evaluate_all('(els)=>els.map(el=>el.getAttribute("href"))');assert len(links)==8
          assert page.locator('li').count()==8 and page.get_by_text('사용자 발행 승인 대기',exact=False).count()>=8
          for link in links:
            response=page.goto(url('/bag-review/'+link.removeprefix('./')),wait_until='networkidle');assert response.status==200
            text=page.locator('body').inner_text()
            assert not re.search(r'DRAFT|reviewedAt|guide-\d|게시 후 연결|Automation C|앱 연결|변경 이력|자료·링크 확인',text),text
            expect(page.get_by_role('heading',name='지금 30초 점검')).to_be_visible()
            assert page.locator('h2').count()==7
            assert 'noindex' in page.locator('meta[name="robots"]').get_attribute('content')
            landing.overflow(page)
            for href in page.locator('a[href^="/knowledge/"]').evaluate_all('(els)=>els.map(el=>el.getAttribute("href"))'):
                assert page.request.get(base+href).status==200
            assert page.locator('section').last.locator('a[href^="https:"]').count()>=1
            if width==390:page.screenshot(path=str(report/(link.strip('./').replace('/','-')+'.png')),full_page=True)
          # Return deep link must neither register stock nor expose review pages in catalog.
          page.locator('a[href^="/bag-lab/"]').click();expect(page.locator('[data-command="add"]').first).to_be_enabled()
          clear_preview_drawer(page)
          assert landing.await_bag(page)['revision']==0
          assert page.locator('a[href*="bag-review"]').count()==0
          before=page.evaluate("""async()=>{const p=await import('/bag-lab/personal.mjs'),s=await import('/bag-lab/storage.mjs');const bag=p.emptyBag();bag.items=[{id:'knowledge-test-only',name:'가상 지식 왕복 물품',category:'equipment',unit:'개',target:2,orderedQuantity:1,batches:[{...p.newBatch(1),nextInspection:'2030-01-01'}]}];await s.saveBag(bag,0);return s.readBag()}""")
          page.locator('[data-nav="inventory"]').click()
          page.locator('[data-guide-group="documents"]').click()
          page.locator('.catalog-explain').first.locator('summary').click()
          with page.expect_popup() as opened:page.locator('[data-item-knowledge]').first.click()
          popup=opened.value;popup.wait_for_load_state('networkidle');expect(popup.locator('h1')).to_contain_text('비상용');popup.close()
          assert landing.await_bag(page)==before
          page.goto(url('/bag-review/'+links[0].removeprefix('./')),wait_until='networkidle')
          page.locator('a[href^="/bag-lab/"]').click();expect(page.locator('[data-command="add"]').first).to_be_enabled()
          clear_preview_drawer(page)
          assert landing.await_bag(page)==before
          assert not errors,errors;ctx.close()
          print(f'PASS knowledge {width}px: 8 clean reader previews/pending approvals/live internal links/catalog fallback/return without writes',flush=True)
        browser.close()
    finally:
      if server:server.shutdown()
if __name__=='__main__':main()
