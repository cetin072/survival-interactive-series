"""BAG-SIDE-01 static preview click gate. Sample-only data, no real user storage."""
from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json, os, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent/"web"/"public"

class QuietHTTP(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

def run(browser, width, height, base_url):
    page=browser.new_page(viewport={"width":width,"height":height},locale="ko-KR")
    errors=[]
    page.on("pageerror",lambda error: errors.append(str(error)))
    page.goto(base_url.rstrip("/")+"/bag-lab/",wait_until="networkidle",timeout=30000)
    assert page.locator("#item-count").inner_text()=="5"
    assert page.locator("#needs-count").inner_text()=="0"
    assert page.locator("#flow-qty").inner_text()=="6 / 6개"
    assert page.locator(".item").count()==5
    assert page.locator("#bag-home h1").count()==1, "state dashboard must be the first major panel"
    assert page.locator("#upcoming .upcoming-row").count()==4
    assert "손전등" in page.locator(".item").first.inner_text(), "items must sort by nearest check date"
    assert "손전등" in page.locator(".upcoming-row").first.inner_text()
    assert page.locator("#soon-count").inner_text().isdigit()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth+2"),"horizontal page overflow"
    page.locator(".stat-near").click()
    assert page.locator(".filters [data-filter='soon']").get_attribute("aria-pressed")=="true"
    assert page.locator(".item").count()>=1
    page.locator(".filters [data-filter='all']").click()
    page.locator(".upcoming-row").first.click()
    assert page.locator("#item-light").evaluate("(element) => document.activeElement === element"), "due-card click must focus item"

    page.locator('[data-action="remove-two"]').click()
    assert page.locator("#needs-count").inner_text()=="1"
    assert "간편식" in page.locator(".upcoming-row").first.inner_text(),"physical shortage must rise to top"
    assert "간편식" in page.locator(".item").first.inner_text(),"physical shortage must rise in inventory"
    assert page.locator("#flow-qty").inner_text()=="4 / 6개"
    assert page.locator('[data-action="remove-two"]').is_disabled(),"double-tap must be disabled"
    page.locator('.filters [data-filter="short"]').click()
    assert page.locator(".item").count()==1 and "간편식" in page.locator(".item").first.inner_text()
    page.locator('[data-action="ordered-two"]').click()
    assert page.locator("#flow-qty").inner_text()=="4 / 6개"
    assert "부족" in page.locator("#needs-copy").inner_text() or page.locator("#needs-count").inner_text()=="1"
    page.locator('[data-action="put-two"]').click()
    assert page.locator("#flow-qty").inner_text()=="6 / 6개"
    assert page.locator("#needs-count").inner_text()=="0"
    assert page.locator('[data-action="put-two"]').is_disabled()
    page.locator('.filters [data-filter="all"]').click()
    assert page.locator(".item").count()==5
    assert "28.03.31" in page.locator("#item-food").inner_text(),"new batch date lost"
    page.locator("#snooze-button").click()
    assert page.locator("#flow-qty").inner_text()=="6 / 6개"
    assert "실제 알림 예약은 하지 않았습니다" in page.locator("#demo-message").inner_text()
    page.locator('[data-action="reset"]').click()
    assert page.locator("#flow-qty").inner_text()=="6 / 6개"
    assert page.locator("#needs-count").inner_text()=="0"
    assert not errors,"Browser JavaScript error: "+str(errors)
    print(f"PASS bag-lab browser width={width} clicks, filters, dates, state and reset")
    page.close()

def main():
    base=os.environ.get("BAG_LAB_BASE_URL","http://127.0.0.1:8923")
    expected=os.environ.get("BAG_LAB_EXPECTED_SHA")
    http=None
    if expected:
        meta_url=base.rstrip("/")+"/deploy-meta.json"
        for attempt in range(24):
            try:
                with urllib.request.urlopen(meta_url,timeout=8) as response:
                    metadata=json.load(response)
                if metadata.get("commit_ref")==expected and metadata.get("context")=="deploy-preview":
                    print("PASS exact Preview metadata:",expected)
                    break
            except Exception as exc:
                if attempt==23:raise
            time.sleep(5)
        else:
            raise AssertionError("Deploy Preview exact SHA did not become ready")
    else:
        http=ThreadingHTTPServer(("127.0.0.1",8923),partial(QuietHTTP,directory=str(ROOT)))
        thread=Thread(target=http.serve_forever,daemon=True)
        thread.start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
            try:
                run(browser,390,844,base)
                run(browser,1280,850,base)
            finally:
                browser.close()
    finally:
        if http:
            http.shutdown()
            http.server_close()

if __name__=="__main__":
    main()
