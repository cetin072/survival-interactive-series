"""Published item knowledge browser acceptance, independent of fictional Wiki and the personal BAG store.
Public articles are searchable independently. App CTAs never create inventory.
"""
import importlib,os,re,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from bag_side_remote import verify_remote
landing=importlib.import_module('check-bag-landing')

def main():
    base=os.environ.get('BAG_LANDING_BASE_URL');server=None
    if base:verify_remote(base,os.environ.get('BAG_LANDING_EXPECTED_SHA'))
    else:server,base=landing.serve(Path(os.environ.get('BAG_LANDING_ROOT',landing.ROOT/'web'/'dist')))
    report=landing.ROOT/'reports'/'bag-knowledge';report.mkdir(parents=True,exist_ok=True)
    preview='deploy-preview-' in base
    def url(path):return base+path+('?ntl-drawer-state=hidden' if preview else '')
    try:
      with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
        for width in (320,390,1280):
          ctx=browser.new_context(viewport={'width':width,'height':844},locale='ko-KR');page=ctx.new_page()
          errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
          listing=ctx.request.get(base+'/knowledge/bag/index.json')
          assert listing.status==200,listing.status
          articles=listing.json()
          assert len(articles)>=8
          assert len({item['href'] for item in articles})==len(articles)
          response=page.goto(url('/knowledge/'),wait_until='networkidle');assert response.status==200
          section=page.locator('#knowledge-bag-items')
          expect(section.locator('h2')).to_have_text('물품별 생존지식')
          hrefs=set(section.locator('a[href^="/knowledge/bag/"]').evaluate_all('(els)=>els.map(el=>el.getAttribute("href"))'))
          assert {item['href'] for item in articles}==hrefs
          listing=page.goto(url('/knowledge/bag/'),wait_until='networkidle')
          assert listing.status==200
          expect(page.locator('h1')).to_have_text('비상대비 물품별 생존지식')
          for item in articles:
            response=page.goto(url(item['href']),wait_until='networkidle')
            assert response.status==200,item
            expect(page.locator('h1')).to_have_text(item['title'])
            expect(page.get_by_role('heading',name='지금 30초 점검')).to_be_visible()
            expect(page.get_by_role('heading',name='이 물품을 직접 준비하고 관리하려면?')).to_be_visible()
            assert page.locator('link[rel="canonical"]').get_attribute('href')=='https://survival-diary-archive.netlify.app'+item['href']
            assert page.locator('meta[name="robots"]').get_attribute('content')=='index,follow'
            if preview:assert 'noindex' in response.headers.get('x-robots-tag','')
            body=page.locator('body').inner_text()
            assert not re.search(r'DRAFT|reviewedAt|guide-\d|게시 후 연결|Automation C|앱 연결|변경 이력|자료·링크 확인|발행 승인 대기',body),item
            assert page.locator('section').filter(has=page.get_by_text('근거 자료',exact=True)).count()>=1
            assert page.locator('.bag-article-cta>a[href^="/bag-lab/alpha.html?catalog=guide-"]').count()==1
            assert page.locator('a[href^="/knowledge/"]').count()>=2
            landing.overflow(page)
            if width==390:page.screenshot(path=str(report/(item['id']+'.png')),full_page=True)
          assert {item['id'] for item in articles}.issuperset({'guide-01','guide-02','guide-03','guide-04','guide-05','guide-06','guide-07','guide-43'})
          # The article is discoverable without the app. Opening its CTA does not register stock.
          first=next(item for item in articles if item['id']=='guide-01')
          page.goto(url(first['href']),wait_until='networkidle')
          page.locator('.bag-article-cta>a').click()
          expect(page.locator('[data-command="add"]').first).to_be_enabled()
          assert (landing.await_bag(page))['revision']==0
          # Use real V1 IDs and an arbitrary local item: only matching inventory gets the link.
          page.evaluate("""async()=>{
            const p=await import('/bag-lab/personal.mjs'),s=await import('/bag-lab/storage.mjs');
            const bag=p.emptyBag();
            bag.items=[
              {id:'catalog-guide-01',name:'방수 서류 파우치',category:'documents',unit:'개',target:1,orderedQuantity:0,batches:[p.newBatch(1)]},
              {id:'custom-light',name:'손전등',category:'equipment',unit:'개',target:1,orderedQuantity:0,batches:[p.newBatch(1)]},
              {id:'misc-item',name:'맞춤품',category:'equipment',unit:'개',target:1,orderedQuantity:0,batches:[p.newBatch(1)]}
            ];
            await s.saveBag(bag,0);
          }""")
          page.reload(wait_until='networkidle')
          before=landing.await_bag(page)
          page.locator('[data-nav="inventory"]').click()
          assert page.locator('[data-owned-knowledge]').count()==2
          assert page.locator('[data-owned-knowledge]').nth(0).get_attribute('href')=='/knowledge/bag/waterproof-document-pouch/'
          assert page.locator('[data-owned-knowledge]').nth(1).get_attribute('href')=='/knowledge/bag/flashlight/'
          with page.expect_popup() as opened:page.locator('[data-owned-knowledge]').nth(1).click()
          popup=opened.value;popup.wait_for_load_state('networkidle')
          expect(popup.locator('h1')).to_contain_text('손전등')
          popup.close()
          page.locator('[data-guide-group="documents"]').click()
          page.locator('.catalog-explain').first.locator('summary').click()
          with page.expect_popup() as opened:page.locator('[data-item-knowledge="guide-01"]').first.click()
          popup=opened.value;popup.wait_for_load_state('networkidle')
          expect(popup.locator('h1')).to_contain_text('방수 서류 파우치')
          popup.close()
          assert landing.await_bag(page)==before
          assert not errors,errors
          print('PASS Knowledge '+str(width)+'px: '+str(len(articles))+' standalone public articles, search/catalog/owned links, no inventory writes',flush=True)
          ctx.close()
        browser.close()
    finally:
      if server:server.shutdown()
if __name__=='__main__':main()
