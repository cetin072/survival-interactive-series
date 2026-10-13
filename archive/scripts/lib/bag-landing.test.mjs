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
  assert.equal((html.match(/<script\b/g)||[]).length,0);
  assert.ok(html.includes('실측값이나 권장 운반 중량이 아닙니다'));
});
test('Alpha and sample demo remain distinct; prerelease SEO stays noindex',()=>{
  assert.ok(html.includes('name="robots" content="noindex,nofollow,noarchive"'));
  assert.ok(html.includes('<html lang="ko">'));
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.equal((html.match(/<details>/g)||[]).length,3);
  assert.ok(html.includes('샘플 데이터 가상 시연'));
  assert.ok(html.includes('Android OS 장기 알림은 실기 검증 전 시험 중입니다'));
  assert.ok(html.includes('브라우저 데이터 삭제나 기기 교체'));
  assert.ok(html.includes('https://survival-diary-archive.netlify.app/bag/'));
  assert.ok(!html.includes('og:image'));
  for(const claim of ['자동 교체 알림 완성','Android 정식 출시','무조건 72시간 생존 보장','10/15/18kg 실측 완료','클라우드 자동 백업','사용자 데이터 영구 보존 보장']) assert.ok(!html.includes(claim),claim);
});
