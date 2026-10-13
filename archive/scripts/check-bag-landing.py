"""Stage 4 landing/browser acceptance. Fresh synthetic contexts; Preview only remotely.
CI captures the real #516 before build and current build, then exact-SHA Preview.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit
import json, os, re
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parent.parent
REPORT=ROOT/'reports'/'bag-landing'

class QuietHTTP(SimpleHTTPRequestHandler):
    def log_message(self,*_): pass

def serve(root):
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHTTP,directory=str(root)))
    Thread(target=server.serve_forever,daemon=True).start()
    return server,f'http://127.0.0.1:{server.server_port}'

def overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),'horizontal overflow'
    assert page.locator('h1').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1'),'heading overflow'

def home(page,base,label,width):
    response=page.goto(base+'/?ntl-drawer-state=hidden',wait_until='networkidle')
    assert response.status==200
    expect(page.get_by_role('heading',name='일상과 비상상황에 필요한 생존 지식')).to_be_visible()
    assert page.get_by_role('textbox',name='통합 검색').count()==1
    for href in ['/knowledge/','/?view=tools','/?view=story']:
        assert page.locator(f'.wiki-topbar a[href="{href}"]').count()==1
    assert page.locator('.wiki-topbar nav a').count()==4
    expect(page.get_by_role('heading',name='먼저 읽어볼 지식')).to_be_visible()
    expect(page.get_by_role('heading',name='생존 이야기',exact=True)).to_be_visible()
    if label!='before':
        card=page.locator('a[href="/bag/"]')
        assert card.count()==1
        assert page.locator('#wiki-resource-title').evaluate('(el)=>el.getBoundingClientRect().top') < card.evaluate('(el)=>el.getBoundingClientRect().top')
        page.screenshot(path=str(REPORT/f'{label}-home-{width}.png'),full_page=True)
        card.click();expect(page.locator('h1')).to_contain_text('준비는 한 번,')
    else:
        assert page.locator('a[href="/bag/"]').count()==0
        page.screenshot(path=str(REPORT/f'before-home-{width}.png'),full_page=True)

def landing(browser,base,width,height,label):
    ctx=browser.new_context(viewport={'width':width,'height':height},locale='ko-KR')
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    response=page.goto(base+'/bag/?ntl-drawer-state=hidden',wait_until='networkidle')
    assert response.status==200
    assert page.locator('html').get_attribute('lang')=='ko'
    assert page.locator('h1').count()==1
    assert page.locator('meta[name="robots"]').get_attribute('content')=='index,follow'
    if label=='preview':assert 'noindex' in response.headers.get('x-robots-tag','').lower()
    assert page.locator('meta[name="description"]').get_attribute('content')
    assert page.locator('link[rel="canonical"]').get_attribute('href')=='https://survival-diary-archive.netlify.app/bag/'
    assert page.locator('meta[property="og:image"]').get_attribute('content')=='https://survival-diary-archive.netlify.app/bag/share.png'
    image=ctx.request.get(base+'/bag/share.png')
    assert image.status==200 and image.headers.get('content-type','').startswith('image/png')
    png=image.body()
    assert png[:8]==b'\x89PNG\r\n\x1a\n' and int.from_bytes(png[16:20],'big')==1200 and int.from_bytes(png[20:24],'big')==630
    for name in ['og:title','og:description','og:url','og:locale','og:type','og:site_name']:
        assert page.locator(f'meta[property="{name}"]').get_attribute('content')
    assert page.locator('.hero .primary').bounding_box()['y']+page.locator('.hero .primary').bounding_box()['height']<=height,'CTA must be above fold'
    assert page.locator('.hero-description').bounding_box()['y']<height
    expect(page.locator('.bag-body')).to_be_visible()
    expect(page.locator('.preview-tabs')).to_be_visible()
    for icon in page.locator('svg.icon').all():
        assert icon.evaluate('(el)=>el.getBBox().width>0'),'missing SVG icon'
    overflow(page)
    for level in ['h1','h2','h3']:
        for heading in page.locator(level).all():
            assert heading.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1'),'heading text overlaps'
    headings=page.locator('h1,h2,h3').evaluate_all('(els)=>els.map(el=>Number(el.tagName.slice(1)))')
    assert all(b<=a+1 for a,b in zip(headings,headings[1:]))
    links=page.locator('a[href]').evaluate_all('(els)=>[...new Set(els.map(el=>el.getAttribute("href")))]')
    for href in links:
        if href.startswith('#'):continue
        assert href.startswith('/') and not href.startswith('//'),href
        r=ctx.request.get(base+href)
        assert r.status==200,(href,r.status)
        if href.startswith('/knowledge/'):
            text=r.text();assert '비상용품 관리' in text if 'emergency-supplies' in href else '생존 지식' in text
    # Native details via keyboard; focus rings and JS-free navigation.
    for summary in page.locator('summary').all():
        summary.focus();page.keyboard.press('Enter')
        assert summary.evaluate('(el)=>el.parentElement.open')
        overflow(page);page.keyboard.press('Enter')
        assert not summary.evaluate('(el)=>el.parentElement.open')
    page.locator('.hero .primary').focus()
    assert page.locator('.hero .primary').evaluate('(el)=>getComputedStyle(el).outlineStyle')!='none'
    page.keyboard.press('Enter')
    # Netlify Pretty URLs can canonicalize alpha.html to alpha; the app is the same.
    page.wait_for_url(lambda url:urlsplit(url).path.rstrip('/') in ('/bag-lab/alpha.html','/bag-lab/alpha'))
    expect(page.locator('[data-command="add"]').first).to_be_enabled()
    assert await_bag(page)['bag']['items']==[],'landing must not apply a preset or sample inventory'
    # Round-trip a committed synthetic bag through landing and knowledge; preserve exact record.
    bag=page.evaluate("""async()=>{const {emptyBag,newBatch}=await import('/bag-lab/personal.mjs');const {saveBag}=await import('/bag-lab/storage.mjs');const b=emptyBag();b.bagName='랜딩 회귀용 가상 가방';b.items=[{id:'landing-synthetic',name:'가상 손전등',category:'equipment',unit:'개',target:2,orderedQuantity:0,batches:[{...newBatch(1),nextInspection:'2027-01-01'}]}];await saveBag(b,0);return (await import('/bag-lab/storage.mjs')).readBag()}""")
    page.goto(base+'/bag/');page.locator('.hero .text-link').click()
    page.wait_for_url('**/knowledge/emergency-supplies-inventory/')
    expect(page.locator('h1')).to_contain_text('비상용품')
    page.goto(base+'/bag/');page.locator('.hero .primary').click()
    expect(page.locator('[data-command="add"]').first).to_be_enabled()
    assert await_bag(page)==bag,'Alpha record changed across navigation'
    page.goto(base+'/bag/');page.screenshot(path=str(REPORT/f'{label}-landing-{width}.png'),full_page=True)
    page.screenshot(path=str(REPORT/f'{label}-hero-{width}.png'))
    # Every preset card opens the existing selection workflow without creating inventory.
    for preset in ['light','standard','expanded']:
        page.locator('.preset.'+preset).click()
        expect(page.locator('#editor')).to_be_visible()
        expect(page.locator('#editor-title')).to_contain_text({'light':'경량형','standard':'표준형','expanded':'확장형'}[preset])
        page.locator('#cancel').click()
        expect(page.locator('#preset-cards')).to_be_visible()
        assert page.locator('#preset-cards article').count()==3
        assert await_bag(page)==bag
        page.goto(base+'/bag/')
    if (Path(os.environ.get('BAG_LANDING_ROOT',ROOT/'web'/'dist'))/'index.html').exists() or label=='preview':
        home(page,base,label,width)
    assert not errors,errors
    ctx.close();print(f'PASS {label} {width}px: links, CTA, keyboard, layout, SEO, Alpha record preservation',flush=True)

def await_bag(page):
    return page.evaluate("async()=> (await import('/bag-lab/storage.mjs')).readBag()")

def main():
    REPORT.mkdir(parents=True,exist_ok=True);server=None;before_server=None
    base=os.environ.get('BAG_LANDING_BASE_URL');label='preview' if base else 'local'
    if base:
        url=urlsplit(base);sha=os.environ.get('BAG_LANDING_EXPECTED_SHA','')
        assert re.fullmatch(r'deploy-preview-[1-9][0-9]*--survival-diary-archive\.netlify\.app',url.hostname or '') or url.hostname=='qa-bag-side--survival-diary-archive.netlify.app'
        assert url.scheme=='https' and not url.port and not url.username and url.path in ('','/') and not url.query and not url.fragment
        assert re.fullmatch(r'[0-9a-f]{40}',sha)
        from bag_side_remote import verify_remote
        verify_remote(base,sha)
    else:server,base=serve(Path(os.environ.get('BAG_LANDING_ROOT',ROOT/'web'/'dist')))
    try:
        with sync_playwright() as p:
            opts={'headless':True,'args':['--no-sandbox']}
            if os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'):opts['executable_path']=os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE']
            browser=p.chromium.launch(**opts)
            if os.environ.get('BAG_LANDING_BEFORE_ROOT'):
                before_server,before=serve(Path(os.environ['BAG_LANDING_BEFORE_ROOT']))
                for width,height in [(390,844),(1280,900)]:
                    page=browser.new_page(viewport={'width':width,'height':height},locale='ko-KR')
                    home(page,before,'before',width)
                    r=page.goto(before+'/bag/');assert r.status==404
                    page.screenshot(path=str(REPORT/f'before-landing-{width}.png'));page.close()
            for width,height in [(320,740),(390,844),(768,1024),(1280,900)]:landing(browser,base,width,height,label)
            browser.close()
        (REPORT/f'{label}-result.json').write_text(json.dumps({'result':'PASS','base':base,'sha':os.environ.get('BAG_LANDING_EXPECTED_SHA'),'viewports':[320,390,768,1280]},ensure_ascii=False,indent=2))
    finally:
        if server:server.shutdown()
        if before_server:before_server.shutdown()

if __name__=='__main__':main()
