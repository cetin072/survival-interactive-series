import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { articleFromDraft, articlePage, safeLink, previewBuildAllowed } from './bag-item-article.mjs';
import { buildPreview, manuscript, projectP1Article } from '../build-bag-knowledge-preview.mjs';

test('P1 projects reader content, safety and sources without any editorial fields or app links', async () => {
  const raw = await readFile(manuscript, 'utf8');
  const article = articleFromDraft(raw, 'guide-01');
  const html = articlePage(article);
  assert.equal(article.slug, 'waterproof-document-pouch');
  assert.ok(html.includes('개인정보도 함께 노출'));
  assert.ok(html.includes('실제 서류나 현금을 넣은 채 방수 시험을 하지 마세요'));
  assert.ok(html.includes('2026-10-12'));
  assert.ok(html.includes('noindex,nofollow,noarchive'));
  assert.equal(article.internal.length, 1);
  assert.equal(article.sources.length, 2);
  assert.doesNotMatch(html, /DRAFT|catalogId|reviewedAt|sourceReview|linkReview|guide-\d|Automation C|변경 이력|검수|bag-lab|돌아가기|guide-03|guide-05/);
  assert.throws(() => articleFromDraft(raw.replace('놓치기 쉬운 점', '바뀐 섹션'), 'guide-01'));
  assert.throws(() => articleFromDraft(raw, 'guide-02'));
  assert.equal(projectP1Article(raw).id, 'guide-01');
  assert.throws(() => projectP1Article(raw + '\nChanged after review'), /manuscript changed/);
});

test('production and unknown contexts cannot opt in; stale Preview is removed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bag-p1-'));
  const dist = pathToFileURL(dir + '/');
  try {
    for (const env of [{}, { CONTEXT: 'production', BAG_KNOWLEDGE_PREVIEW: '1' }, { CONTEXT: 'branch-deploy', BRANCH: 'qa-preview' }, { CONTEXT: 'unknown', BAG_KNOWLEDGE_PREVIEW: '1' }]) {
      assert.equal(previewBuildAllowed(env), false);
      await mkdir(new URL('knowledge/bag/old/', dist), { recursive: true });
      await writeFile(new URL('knowledge/bag/old/index.html', dist), 'stale preview');
      assert.equal((await buildPreview({ env, dist })).pages, 0);
      await assert.rejects(readdir(new URL('knowledge/bag/', dist)), { code: 'ENOENT' });
    }
    for (const env of [{ CONTEXT: 'deploy-preview' }, { CONTEXT: 'branch-deploy', BRANCH: 'qa-bag-side' }, { BAG_KNOWLEDGE_PREVIEW: '1' }]) assert.equal(previewBuildAllowed(env), true);
    await assert.rejects(buildPreview({ env: { CONTEXT: 'deploy-preview' }, dist }), { code: 'ENOENT' });
    await mkdir(new URL('knowledge/emergency-supplies-inventory/', dist), { recursive: true });
    await writeFile(new URL('knowledge/emergency-supplies-inventory/index.html', dist), await readFile(new URL('../../web/public/knowledge/emergency-supplies-inventory/index.html', import.meta.url)));
    const built = await buildPreview({ env: { CONTEXT: 'deploy-preview' }, dist });
    assert.equal(built.pages, 1);
    assert.deepEqual(await readdir(new URL('knowledge/bag/', dist)), ['waterproof-document-pouch']);
    assert.ok((await readFile(new URL('_headers', dist), 'utf8')).includes('X-Robots-Tag: noindex, nofollow, noarchive'));
    assert.ok((await readFile(new URL('knowledge/bag/waterproof-document-pouch/index.html', dist), 'utf8')).includes('방수 서류 파우치'));
    assert.equal((await buildPreview({ env: { CONTEXT: 'production', BAG_KNOWLEDGE_PREVIEW: '1' }, dist })).pages, 0);
    await assert.rejects(readdir(new URL('knowledge/bag/', dist)), { code: 'ENOENT' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('article links reject executable, protocol-relative and non-knowledge internal targets', () => {
  for (const url of ['javascript:alert(1)', '//evil.example/', 'http://example.com', '/operator/']) assert.throws(() => safeLink(url));
});
