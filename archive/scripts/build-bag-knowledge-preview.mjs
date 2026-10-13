// P1 deliberately has no production publishing path or approval bypass.
import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { articleFromDraft, articlePage, previewBuildAllowed } from './lib/bag-item-article.mjs';

const root = new URL('../../', import.meta.url);
export const manuscript = new URL('docs/bunker_os/bag_knowledge/GUIDE_01_WATERPROOF_DOCUMENT_POUCH_DRAFT_V01.md', root);
export const sourceDigest = '6f33dd7d5b8d0bc613318ae8ef98eae60f3aaf68c2de15944b8340c6853f72d4';
export async function buildPreview({ env = process.env, dist = new URL('archive/web/dist/', root) } = {}) {
  const output = new URL('knowledge/bag/', dist);
  // Fixed generated subtree only: remove stale Preview pages on reused builds.
  await rm(output, { recursive: true, force: true });
  // Never allow a committed public page to bypass this final build gate.
  const publicPath = new URL('archive/web/public/knowledge/bag/', root);
  if (await access(publicPath).then(() => true, () => false)) throw new Error('Bag pages must not live in public/');
  if (!previewBuildAllowed(env)) return { pages: 0, status: 'UNAPPROVED_PRODUCTION_EXCLUDED' };
  const raw = (await readFile(manuscript, 'utf8')).replaceAll('\r\n', '\n');
  if (createHash('sha256').update(raw).digest('hex') !== sourceDigest) throw new Error('P1 manuscript changed; review exact source again');
  const article = articleFromDraft(raw, 'guide-01');
  if (article.slug !== 'waterproof-document-pouch') throw new Error('P1 slug mismatch');
  for (const link of article.internal) await access(new URL(link.url.slice(1) + 'index.html', dist));
  const target = new URL(article.slug + '/', output);
  await mkdir(target, { recursive: true });
  await writeFile(new URL('index.html', target), articlePage(article));
  // Site-wide noindex for this Preview artifact, never written on production builds.
  const headers = new URL('_headers', dist);
  const previous = await readFile(headers, 'utf8').catch(() => '');
  await writeFile(headers, previous + '\n/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n');
  return { pages: 1, status: 'PREVIEW_ONLY', path: '/knowledge/bag/waterproof-document-pouch/' };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) console.log(JSON.stringify(await buildPreview()));
