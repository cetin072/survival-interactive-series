"""Render the existing CSS bag/brand to a static 1200x630 PNG; no remote assets."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os

ROOT=Path(__file__).resolve().parent.parent/'web'/'public'/'bag'
css=(ROOT/'bag.css').read_text(encoding='utf-8')
html='''<!doctype html><html lang="ko"><meta charset="utf-8"><style>'''+css+'''
html,body{width:1200px;height:630px;overflow:hidden;background:#142234;color:#fff}
.share-art{position:relative;width:1200px;height:630px;padding:88px 78px}
.share-art .eyebrow{color:#c1d1e1;font-size:18px;letter-spacing:.16em}
.share-art h1{font-size:68px;letter-spacing:-.055em;margin:34px 0 20px}
.share-art .motto{font-size:32px;line-height:1.5;color:#ff955d;font-weight:750}
.share-art .diary{position:absolute;left:78px;bottom:76px;font-size:24px;color:#c1d1e1}
.share-art .mini-bag{position:absolute;left:922px;top:266px;transform:scale(4.8)}
.share-art .circle{position:absolute;left:758px;top:156px;width:360px;height:360px;border-radius:50%;background:#1d3249}
</style><body><div class="share-art"><p class="eyebrow">ONE BAG · ONE HABIT</p>
<h1>나의 생존가방</h1><p class="motto">준비는 한 번,<br>관리는 계속.</p><p class="diary">생존일기</p>
<div class="circle"></div><div class="mini-bag"><div class="bag-handle"></div><div class="bag-body"><div class="bag-pocket"><div class="bag-pocket-line"></div></div><div class="bag-badge">READY</div></div></div>
</div></body></html>'''
with sync_playwright() as p:
    options={'headless':True,'channel':'chromium'}
    if os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'):
        options={'headless':True,'executable_path':os.environ['PLAYWRIGHT_CHROMIUM_EXECUTABLE']}
    browser=p.chromium.launch(**options)
    page=browser.new_page(viewport={'width':1200,'height':630},device_scale_factor=1)
    page.set_content(html,wait_until='load')
    page.evaluate('document.fonts.ready')
    assert page.locator('h1').evaluate('(el)=>el.scrollWidth<=el.clientWidth')
    page.screenshot(path=str(ROOT/'share.png'))
    browser.close()
print('PASS bag/share.png 1200x630; existing CSS bag and brand, no network')
