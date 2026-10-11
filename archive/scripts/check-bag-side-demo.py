"""BAG-SIDE-01 static preview click gate. Sample-only data, no real user storage."""
from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent/"web"/"public"

class QuietHTTP(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

def run(browser, width, height):
    page=browser.new_page(viewport={"width":width,"height":height},locale="ko-KR")
    errors=[]
    page.on("pageerror",lambda error: errors.append(str(error)))
    page.goto("http://127.0.0.1:8923/bag-lab/",wait_until="networkidle",timeout=20000)
    assert page.locator("#item-count").inner_text()=="5"
    assert page.locator("#needs-count").inner_text()=="0"
    assert page.locator("#flow-qty").inner_text()=="6 / 6개"
    assert page.locator(".item").count()==5
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth+2"),"horizontal page overflow"
    page.locator('[data-action="remove-two"]').click()
    assert page.locator("#needs-count").inner_text()=="1"
    assert page.locator("#flow-qty").inner_text()=="4 / 6개"
    assert page.locator('[data-action="remove-two"]').is_disabled(),"double-tap must be disabled"
    page.locator('[data-filter="short"]').click()
    assert page.locator(".item").count()==1 and "간편식" in page.locator(".item").first.inner_text()
    page.locator('[data-action="ordered-two"]').click()
    assert page.locator("#flow-qty").inner_text()=="4 / 6개"
    assert "부족" in page.locator("#needs-copy").inner_text() or page.locator("#needs-count").inner_text()=="1"
    page.locator('[data-action="put-two"]').click()
    assert page.locator("#flow-qty").inner_text()=="6 / 6개"
    assert page.locator("#needs-count").inner_text()=="0"
    assert page.locator('[data-action="put-two"]').is_disabled()
    page.locator('[data-filter="all"]').click()
    assert page.locator(".item").count()==5
    assert "28.03.31" in page.locator(".item").first.inner_text(),"new batch date lost"
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
    http=ThreadingHTTPServer(("127.0.0.1",8923),partial(QuietHTTP,directory=str(ROOT)))
    thread=Thread(target=http.serve_forever,daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
            try:
                run(browser,390,844)
                run(browser,1280,850)
            finally:
                browser.close()
    finally:
        http.shutdown()
        http.server_close()

if __name__=="__main__":
    main()
