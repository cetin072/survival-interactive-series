"""Install/share UI contracts using synthetic API adapters, not real OS delivery.
Reuses existing Chromium, exact-head remote guard, static server and BAG fixtures.
"""
from pathlib import Path
import importlib.util, json, os
from playwright.sync_api import sync_playwright, expect

spec=importlib.util.spec_from_file_location('bag_pwa',Path(__file__).with_name('check-bag-side-pwa.py'))
pwa=importlib.util.module_from_spec(spec);spec.loader.exec_module(pwa)
ROOT=Path(__file__).resolve().parent.parent
REPORT=ROOT/'reports'/'bag-install-share'
PUBLIC='https://survival-diary-archive.netlify.app/bag/'
PAYLOAD={'title':'나의 생존가방 | 생존일기','text':'준비는 한 번, 관리는 계속. 필요한 물품을 고르고 수량과 점검일을 관리하는 나만의 생존가방.','url':PUBLIC}
ANDROID='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36'
IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'

ADAPTER='''({mode,native,standalone})=>{
  window.__bagCalls={share:[],copy:[],prompt:[]};
  window.Capacitor={isNativePlatform:()=>native};
  Object.defineProperty(navigator,'share',{configurable:true,value:mode==='unsupported'?undefined:async payload=>{
    __bagCalls.share.push({payload,gesture:navigator.userActivation.isActive});
    if(mode==='cancel')throw new DOMException('cancel','AbortError');
    if(mode==='failure')throw new DOMException('blocked','NotAllowedError');
  }});
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:mode==='unsupported'?undefined:{writeText:async url=>{
    __bagCalls.copy.push({url,gesture:navigator.userActivation.isActive});
    if(mode==='failure')throw new Error('clipboard denied');
  }}});
  if(standalone)Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
  // Suppress real browser install UI in this synthetic branch test. The existing
  // PWA gate separately verifies actual Chromium installability/controller.
  window.addEventListener('beforeinstallprompt',event=>{if(!event.bagTest)event.stopImmediatePropagation()},true);
  window.__bagInstall=(outcome)=>{
    const event=new Event('beforeinstallprompt',{cancelable:true});event.bagTest=true;
    event.prompt=async()=>{__bagCalls.prompt.push(navigator.userActivation.isActive);if(outcome==='failure')throw new Error('prompt denied');return {outcome}};
    window.dispatchEvent(event);return event.defaultPrevented;
  };
}'''

def viewport(page):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'horizontal overflow'

def checks(browser,base,width,agent,mode='success',native=False,standalone=False):
    ctx=browser.new_context(viewport={'width':width,'height':844},user_agent=agent,locale='ko-KR')
    ctx.add_init_script('('+ADAPTER+')('+json.dumps({'mode':mode,'native':native,'standalone':standalone})+')')
    page=ctx.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    # Positive current+previous V1 records survive both landing and app actions.
    pwa.alpha.ready(page,pwa.alpha.address(base))
    before=page.evaluate('''async()=>{
      const {emptyBag,newBatch}=await import('/bag-lab/personal.mjs');const {saveBag,readBag}=await import('/bag-lab/storage.mjs');
      const bag=emptyBag();bag.bagName='가상 비공개 이름 공유 금지';
      bag.items=[{id:'install-share-synthetic',name:'비공개 가상 재고',category:'equipment',unit:'개',target:2,orderedQuantity:1,batches:[{...newBatch(1),nextInspection:'2027-01-01'}]}];
      await saveBag(bag,0);bag.items[0].target=3;await saveBag(bag,1);return readBag();
    }''')
    for target in ['landing','app']:
        path='/bag/' if target=='landing' else '/bag-lab/alpha.html'
        response=page.goto(base+path+'?ntl-drawer-state=hidden',wait_until='networkidle')
        assert response.status==200
        if target=='app':
            expect(page.locator('[data-nav="settings"]')).to_be_visible();page.locator('[data-nav="settings"]').click()
            expect(page.locator('#backup-panel')).to_be_visible()
            expect(page.locator('#export')).to_be_enabled();expect(page.locator('#import')).to_be_enabled()
            guide=page.locator('[data-bag-install-share] details')
            assert not guide.evaluate('(el)=>el.open');guide.locator('summary').click()
        panel=page.locator('[data-bag-install-share]')
        expect(panel.get_by_text('Android / Chrome',exact=True)).to_be_visible()
        expect(panel.get_by_text('iPhone / Safari',exact=True)).to_be_visible()
        expect(panel.locator('[data-bag-share-preview]')).to_be_hidden() if native else expect(panel.locator('[data-bag-share-preview]')).to_be_visible()
        assert page.evaluate('__bagCalls')=={'share':[],'copy':[],'prompt':[]},'no automatic API/permission request'
        page.locator('[data-bag-share]').click()
        status=panel.locator('[data-bag-share-status]')
        if mode=='unsupported' or native:
            expect(status).to_contain_text('링크 복사')
            assert page.evaluate('__bagCalls.share')==[]
        else:
            expect(status).to_contain_text({'success':'공유 요청을 마쳤습니다','cancel':'공유를 취소했습니다','failure':'공유하지 못했습니다'}[mode])
            calls=page.evaluate('__bagCalls.share');assert calls==[{'payload':PAYLOAD,'gesture':True}],calls
            assert not any(word in json.dumps(calls,ensure_ascii=False) for word in ['비공개','deploy-preview','qa-bag-side','formatVersion','items','files'])
        page.locator('[data-bag-copy]').click()
        if mode in ['unsupported','failure']:
            expect(status).to_contain_text('직접 복사')
            assert page.locator('[data-bag-share-url]').evaluate('(el)=>document.activeElement===el&&el.selectionStart===0&&el.selectionEnd===el.value.length')
        else:
            expect(status).to_contain_text('링크를 복사했습니다')
        if mode!='unsupported':assert page.evaluate('__bagCalls.copy')==[{'url':PUBLIC,'gesture':True}]
        assert panel.locator('[data-bag-share-url]').input_value()==PUBLIC
        if target=='landing':
            assert page.locator('link[rel="manifest"]').count()==0
            assert not page.evaluate('__bagInstall("accepted")'),'landing must not retain/prompt for app install'
            assert page.evaluate('__bagCalls.prompt')==[]
            if not native:
                assert not page.evaluate('navigator.serviceWorker.controller'),'landing remains outside BAG worker scope'
            page.locator('.install-open').click()
            expect(page.locator('[data-command="add"]').first).to_be_enabled()
        else:
            button=panel.locator('[data-bag-install]');expect(button).to_be_hidden()
            if native or standalone:
                assert not page.evaluate('__bagInstall("accepted")');expect(button).to_be_hidden()
                expect(panel.locator('[data-bag-install-status]')).to_contain_text('Android 앱' if native else '홈 화면 앱 모드')
            else:
                for outcome in ['dismissed','failure','accepted']:
                    assert page.evaluate('__bagInstall',outcome)
                    expect(button).to_be_visible();assert page.evaluate('__bagCalls.prompt')==[]
                    button.click();expect(button).to_be_hidden()
                    expect(panel.locator('[data-bag-install-status]')).to_contain_text({'dismissed':'설치를 취소','failure':'설치 창을 열지 못','accepted':'설치를 요청'}[outcome])
                    assert '설치 완료' not in panel.inner_text()
                    assert page.evaluate('__bagCalls.prompt')==[True]
                    page.evaluate('__bagCalls.prompt=[]')
                page.evaluate('window.dispatchEvent(new Event("appinstalled"))')
                expect(panel.locator('[data-bag-install-status]')).to_have_text('브라우저에서 앱 설치를 확인했습니다.')
            viewport(page)
            if mode=='success' and not native and not standalone:
                panel.scroll_into_view_if_needed();page.screenshot(path=str(REPORT/f'app-{width}-{"iphone" if agent==IPHONE else "android"}.png'))
        assert pwa.alpha.stored(page)==before,'install/share changed current or previous inventory'
        viewport(page)
        if target=='landing' and mode=='success' and not native and not standalone:
            page.goto(base+'/bag/?ntl-drawer-state=hidden');page.locator('[data-bag-install-share]').scroll_into_view_if_needed()
            page.screenshot(path=str(REPORT/f'landing-{width}-{"iphone" if agent==IPHONE else "android"}.png'))
    assert not errors,errors
    ctx.close();print(f'PASS install/share {width}px {"iPhone UA" if agent==IPHONE else "Android UA"} {mode} native={native} standalone={standalone}: public payload, gestures, fallback, prompt lifecycle, V1 preserved',flush=True)

def main():
    REPORT.mkdir(parents=True,exist_ok=True);server=None
    base=os.environ.get('BAG_LANDING_BASE_URL')
    if base:
        from bag_side_remote import verify_remote
        verify_remote(base,os.environ.get('BAG_LANDING_EXPECTED_SHA',''))
    else:
        server,base=pwa.serve(Path(os.environ.get('BAG_LANDING_ROOT',ROOT/'web'/'dist')))
    try:
        with sync_playwright() as p:
            options={'headless':True,'channel':'chromium'}
            if os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'):options={'headless':True,'executable_path':os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE']}
            browser=p.chromium.launch(**options)
            for agent in [ANDROID,IPHONE]:
                for width in [320,390,1280]:checks(browser,base,width,agent)
            for mode in ['unsupported','failure','cancel']:checks(browser,base,390,ANDROID,mode)
            checks(browser,base,390,ANDROID,native=True)
            checks(browser,base,390,IPHONE,standalone=True)
            browser.close()
    finally:
        if server:server.shutdown()

if __name__=='__main__':main()
