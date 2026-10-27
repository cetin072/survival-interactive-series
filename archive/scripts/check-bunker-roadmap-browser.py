"""Synthetic operator navigation only; blocks all real remote calls and mutations."""
import functools, http.server, importlib.util, json, os, threading
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('qa',ROOT/'archive/scripts/check-operator-deploy-browser.py')
qa=importlib.util.module_from_spec(spec); spec.loader.exec_module(qa)
OLD='MONTH01_FIND_THE_ENGINE'; NEW='MONTH02_TEST'
LOG={'id':'11111111-1111-4111-8111-111111111111','cycle_key':OLD,'phase':'WEEK_1_FIND_THE_GAME','day_index':1,'status':'COMPLETED','title':'Day 1 · 현재 자산 Audit V1','summary':'Synthetic evidence only','details':{'next_actions':['Synthetic next action'],'source_candidates':[{'title':'Invalid source','url':'javascript:alert(1)'}]},'occurred_at':'2026-10-10T00:00:00Z'}
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(qa.Handler,directory=str(ROOT/'archive/web/dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
out=Path('/tmp/bunker-roadmap-browser'); out.mkdir(exist_ok=True)
reports=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'))
 for width in [320,390,1280]:
  context=browser.new_context(viewport={'width':width,'height':1000})
  page=context.new_page(); errors=[]; calls=[]; mode={'error':False,'overflow':False,'deny':False}; held=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  def route(r):
   u=urlparse(r.request.url)
   if u.hostname=='127.0.0.1':r.continue_();return
   name=u.path.split('/')[-1];calls.append(name)
   if name=='archive_operator_bunker_os_read_v2':
    args=r.request.post_data_json
    if mode['error'] or mode['deny']:r.fulfill(status=403,json={'message':'SYNTHETIC_DENIED'});return
    view=args['p_view'];cycle=args.get('p_cycle') or NEW;offset=args.get('p_offset',0)
    if mode.get('empty'):
     r.fulfill(json={'cycles':[],'total_count':0,'current_cycle':None,'logs':[],'running_count':0,'completed_count':0,'blocked_count':0,'approval_count':0,'latest_at':None});return
    common={'current_cycle':cycle,'running_count':0,'completed_count':101,'blocked_count':0,'approval_count':0,'latest_at':LOG['occurred_at']}
    if view=='cycles':body={'cycles':[{'cycle_key':NEW},{'cycle_key':OLD}],'total_count':2}
    elif view=='sources':
     sources=[{'source_key':str(i),'title':'Source '+str(i),'url':'https://example.invalid/'+str(i),'category':'OTHER','log_id':LOG['id'],'log_title':LOG['title'],'cycle_key':cycle,'occurred_at':LOG['occurred_at']} for i in range(201)] if args.get('p_category','ALL')!='BUNKER_BUILD' else []
     body={**common,'total_count':len(sources),'sources':sources[offset:offset+200]}
    elif 'p_offset' not in args:body={**common,'total_count':101 if mode['overflow'] else 1,'has_more':mode['overflow'],'logs':[LOG]}
    elif view=='dashboard':body={**common,'total_count':101 if cycle==OLD else 0,'logs':[LOG] if cycle==OLD else []}
    else:
     logs=[{**LOG,'id':f'{i:08x}-1111-4111-8111-111111111111','title':'Synthetic log '+str(i)} for i in range(101)] if cycle==OLD else []
     body={**common,'total_count':len(logs),'logs':logs[offset:offset+100]}
    if mode.get('hold') and view=='logs':held.append((r,body));return
    r.fulfill(json=body);return
   if name=='archive_operator_bunker_os_log_detail':r.fulfill(json=LOG);return
   if name=='archive_operator_review_inbox':r.fulfill(json={'items':[],'pending_count':0,'automation_error_count':0});return
   if name=='archive_operator_knowledge_inbox':r.fulfill(json={'items':[]});return
   # Existing automation/error views remain visible; no unmocked writes leave this process.
   r.fulfill(status=403,json={'message':'SYNTHETIC_BLOCKED'})
  context.route('**/*',route)
  page.goto(base+'/operator/bunker-os/log/'+LOG['id']+'/?stage=day-1&cycle='+OLD)
  expect(page.get_by_role('heading',name='운영자 로그인',exact=True)).to_be_visible();assert not calls
  page.evaluate('(s)=>localStorage.setItem("sb-jgsxpdflgkqroecfjzxq-auth-token",JSON.stringify(s))',qa.synthetic_session())
  page.goto(base+'/operator/?stage=day-1#operator-roadmap')
  expect(page.locator('#roadmap-stage-title')).to_contain_text('자산 지도')
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
  page.locator('.roadmap-stage-detail').screenshot(path=str(out/f'stage-{width}.png'))
  page.locator('.roadmap-stage-detail').get_by_role('link',name=LOG['title'],exact=True).click()
  expect(page.get_by_role('heading',name=LOG['title'],exact=True)).to_be_visible()
  expect(page.get_by_text('Synthetic next action')).to_be_visible()
  assert page.locator('a[href^="javascript:"]').count()==0
  page.get_by_role('link',name='전체 로드맵',exact=True).click()
  expect(page.locator('#roadmap-stage-title')).to_contain_text('자산 지도')
  page.reload();expect(page.locator('#roadmap-stage-title')).to_contain_text('자산 지도')
  page.go_back();expect(page.get_by_role('heading',name=LOG['title'],exact=True)).to_be_visible()
  page.goto(base+'/operator/?stage=year-5#operator-roadmap');expect(page.get_by_text('세부 실행계획 미정',exact=False)).to_be_visible()
  page.goto(base+'/operator/bunker-os/');expect(page.get_by_role('combobox',name='활동 주기',exact=True)).to_have_value(NEW)
  page.get_by_role('combobox',name='활동 주기',exact=True).select_option(OLD)
  expect(page.get_by_role('combobox',name='활동 주기',exact=True)).to_have_value(OLD)
  page.get_by_role('link',name='작업 기록',exact=True).click()
  expect(page.get_by_text('전체 101건',exact=False)).to_be_visible()
  expect(page.locator('.bunker-os-board-list > li')).to_have_count(100)
  page.get_by_role('link',name='다음 페이지 →',exact=True).click();expect(page.locator('.bunker-os-board-list > li')).to_have_count(1)
  page.reload();expect(page.locator('.bunker-os-board-list > li')).to_have_count(1)
  page.go_back();expect(page.locator('.bunker-os-board-list > li')).to_have_count(100)
  page.get_by_role('link',name='자료함',exact=True).click();expect(page.locator('.bunker-os-source-list > li')).to_have_count(200)
  page.get_by_role('link',name='다음 페이지 →',exact=True).click();expect(page.locator('.bunker-os-source-list > li')).to_have_count(1)
  page.get_by_role('button',name='벙커·건축',exact=True).click();expect(page.get_by_text('이 분류에 모아둔 자료가 없습니다.')).to_be_visible()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
  page.keyboard.press('Tab');assert page.evaluate('document.activeElement.tagName') in ['A','BUTTON','SELECT']
  page.screenshot(path=str(out/f'sources-{width}.png'),full_page=True)
  mode['error']=True;page.reload();expect(page.get_by_role('alert')).to_contain_text('조회 실패')
  assert page.get_by_text('이 분류에 모아둔 자료가 없습니다.').count()==0
  mode['error']=False;page.get_by_role('button',name='다시 조회',exact=True).click();expect(page.get_by_text('이 분류에 모아둔 자료가 없습니다.')).to_be_visible()
  mode['overflow']=True;page.goto(base+'/operator/?stage=day-1');expect(page.get_by_role('alert').filter(has_text='100건')).to_be_visible()
  expect(page.locator('.roadmap-stage-detail')).to_contain_text('조회 필요')
  mode['hold']=True;page.goto(base+'/operator/bunker-os/logs/?cycle='+OLD);expect(page.get_by_role('status')).to_contain_text('불러오는 중')
  page.wait_for_timeout(300);assert held, 'Expected pending old response';mode['hold']=False;page.goto(base+'/operator/bunker-os/?cycle='+NEW)
  expect(page.get_by_role('combobox',name='활동 주기',exact=True)).to_have_value(NEW)
  for r,body in held:
   try:r.fulfill(json=body)
   except Exception:pass
  expect(page.get_by_role('combobox',name='활동 주기',exact=True)).to_have_value(NEW)
  mode['empty']=True;page.goto(base+'/operator/bunker-os/')
  expect(page.get_by_text('주기 목록 0–0 / 0',exact=True)).to_be_visible()
  expect(page.get_by_role('combobox',name='활동 주기',exact=True)).to_have_value('')
  assert not errors, errors
  reports.append({'width':width,'result':'PASS','auth':'synthetic','real_remote_writes':0})
  context.close()
 browser.close()
server.shutdown();(out/'report.json').write_text(json.dumps(reports,indent=2));print(json.dumps(reports))
