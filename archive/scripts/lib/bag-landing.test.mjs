import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS} from '../../web/public/bag-lab/presets.mjs';

const html=await readFile(new URL('../../web/public/bag/index.html',import.meta.url),'utf8');
test('Landing references the current Alpha preset contract without applying inventory',()=>{
  for(const preset of PRESETS){
    const card=html.match(new RegExp(`<a class="preset ${preset.id}"[\\s\\S]*?</a>`))?.[0];
    assert.ok(card,preset.name);
    assert.ok(card.includes(`<h3>${preset.name}</h3>`));
    assert.ok(card.includes(`<strong>${preset.items.length}</strong>종`));
    assert.ok(card.includes(`참고 ${preset.budget}kg`));
    assert.ok(card.includes(`href="/bag-lab/alpha.html?preset=${preset.id}"`));
  }
  assert.deepEqual([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match=>match[1]),['/bag-lab/pwa.mjs']);
  assert.ok(!html.includes('rel="manifest"'),'landing must not become a PWA install target');
  assert.ok(html.includes('실측값이나 권장 운반 중량이 아닙니다'));
});
test('Public landing is indexable while personal inventory and unapproved drafts stay private to published content',async()=>{
  assert.ok(html.includes('name="robots" content="index,follow"'));
  assert.ok(!html.includes('href="/bag-review/"'));
  assert.ok(html.includes('<html lang="ko">'));
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.equal((html.match(/<details>/g)||[]).length,3);
  assert.ok(html.includes('샘플 데이터 가상 시연'));
  assert.ok(html.includes('웹앱을 닫은 뒤 날짜별 자동 알림은 제공하지 않습니다.'));
  assert.ok(html.includes('브라우저 데이터 삭제나 기기 교체'));
  assert.ok(html.includes('https://survival-diary-archive.netlify.app/bag/'));
  assert.ok(html.includes('property="og:image" content="https://survival-diary-archive.netlify.app/bag/share.png"'));
  const png=await readFile(new URL('../../web/public/bag/share.png',import.meta.url));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),1200);
  assert.equal(png.readUInt32BE(20),630);
  for(const claim of ['자동 교체 알림 완성','Android 정식 출시','무조건 72시간 생존 보장','10/15/18kg 실측 완료','클라우드 자동 백업','사용자 데이터 영구 보존 보장']) assert.ok(!html.includes(claim),claim);
});

const appHtml=await readFile(new URL('../../web/public/bag-lab/alpha.html',import.meta.url),'utf8');
const shareRuntime=await readFile(new URL('../../web/public/bag-lab/pwa.mjs',import.meta.url),'utf8');
test('Public-facing copy is launch-ready, with no review disclaimers or false sharing-delivery claims',()=>{
  for(const visibleHtml of [html,appHtml]){
    for(const obsolete of ['검수 화면','정식 배포 전 주소','1.0 출시 후보','1.0 RC','정식 출시 전','Preview와 정식 사이트','QA와 정식 사이트','미리보기·시험용·정식 사이트']){
      assert.ok(!visibleHtml.includes(obsolete),obsolete);
    }
    assert.ok(!visibleHtml.includes('data-bag-share-preview'));
  }
  assert.ok(appHtml.includes('현재 버전 · 웹 1.0'));
  assert.ok(shareRuntime.includes('선택한 앱에서 링크 전송 여부를 확인해 주세요.'));
  assert.ok(!shareRuntime.includes('공유 요청을 마쳤습니다.'));
  assert.ok(!shareRuntime.includes('data-bag-share-preview'));
});
