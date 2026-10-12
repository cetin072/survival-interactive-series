import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { join } from 'node:path'
import { root } from './knowledge-content.mjs'

const script = await readFile(join(root, 'archive/web/public/knowledge/share.js'), 'utf8')
const canonical = 'https://survival-diary-archive.netlify.app/knowledge/family-emergency-contact-plan/'

function fakeControl(hidden = true) {
  return { hidden, handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn },
    click() { return this.handlers.click?.() },
  }
}
function fakePage(navigator, inputUrl = canonical) {
  const actions = fakeControl(true)
  const nativeButton = fakeControl(true)
  const copyButton = fakeControl(true)
  const naverLink = {}
  const xLink = {}
  const facebookLink = {}
  const input = { value: inputUrl, focused: 0, selected: 0,
    focus() { this.focused++ },
    select() { this.selected++ },
  }
  const status = { textContent: '' }
  const children = {
    '[data-knowledge-share-actions]': actions,
    '[data-knowledge-native-share]': nativeButton,
    '[data-knowledge-copy]': copyButton,
    '[data-knowledge-naver-share]': naverLink,
    '[data-knowledge-x-share]': xLink,
    '[data-knowledge-facebook-share]': facebookLink,
    '#knowledge-share-url': input,
    '[data-knowledge-share-status]': status,
  }
  const panel = { querySelector: (sel) => children[sel] ?? null }
  const document = {
    title: 'Fallback document title',
    querySelector: (sel) => {
      if (sel === '[data-knowledge-share]') return panel
      if (sel === 'link[rel="canonical"]') return { getAttribute: () => canonical }
      if (sel === 'meta[property="og:title"]') return { getAttribute: () => '가족 비상연락 | 생존일기' }
      if (sel === 'meta[property="og:description"]') return { getAttribute: () => '비상 연락 방법' }
      return null
    },
  }
  runInNewContext(script, { document, navigator })
  return { actions, nativeButton, copyButton, naverLink, xLink, facebookLink, input, status }
}

test('mobile share uses exact canonical title/description and never Preview URL', async () => {
  const calls = []
  const page = fakePage({
    share: async (args) => { calls.push(args) },
    clipboard: { writeText: async (value) => { calls.push({ copied: value }) } },
  })
  assert.equal(page.actions.hidden, false)
  assert.equal(page.nativeButton.hidden, false)
  await page.nativeButton.click()
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
    title: '가족 비상연락 | 생존일기', text: '비상 연락 방법', url: canonical,
  })
  assert.equal(page.status.textContent, '공유 요청을 완료했습니다.')
  await page.copyButton.click()
  assert.deepEqual(calls[1], { copied: canonical })
  assert.equal(page.status.textContent, '글 주소를 복사했습니다.')
})

test('desktop without Web Share/clipboard offers copy by keyboard and readonly URL', async () => {
  const page = fakePage({})
  assert.equal(page.actions.hidden, false)
  assert.equal(page.nativeButton.hidden, true)
  await page.copyButton.click()
  assert.equal(page.input.value, canonical)
  assert.equal(page.input.focused, 1)
  assert.equal(page.input.selected, 1)
  assert.equal(page.status.textContent, '주소를 선택했습니다. 직접 복사해 주세요.')
})

test('native share cancellation is neutral; failure advises copy rather than publishing', async () => {
  const cancelled = fakePage({ share: async () => { throw { name: 'AbortError' } } })
  await cancelled.nativeButton.click()
  assert.equal(cancelled.status.textContent, '')
  const failed = fakePage({ share: async () => { throw new Error('UNSUPPORTED') } })
  await failed.nativeButton.click()
  assert.equal(failed.status.textContent, '공유가 되지 않았습니다. 링크 복사를 사용해 주세요.')
})

test('missing/mismatched canonical fails closed without enabling script controls', () => {
  const page = fakePage({ share: async () => { throw new Error('should never run') } },
    'https://deploy-preview.example.org/knowledge/family-emergency-contact-plan/')
  assert.equal(page.actions.hidden, true)
  assert.equal(page.nativeButton.hidden, true)
  assert.equal(page.copyButton.handlers.click, undefined)
})

test('social choices are direct and only use canonical URL and OG title', () => {
  const page = fakePage({})
  assert.equal(page.actions.hidden, false)
  const naver = new URL(page.naverLink.href)
  const x = new URL(page.xLink.href)
  const facebook = new URL(page.facebookLink.href)
  assert.equal(naver.origin, 'https://share.naver.com')
  assert.equal(naver.searchParams.get('url'), canonical)
  assert.equal(naver.searchParams.get('title'), '가족 비상연락 | 생존일기')
  assert.equal(x.origin, 'https://x.com')
  assert.equal(x.searchParams.get('url'), canonical)
  assert.equal(x.searchParams.get('text'), '가족 비상연락 | 생존일기')
  assert.equal(facebook.origin, 'https://www.facebook.com')
  assert.equal(facebook.searchParams.get('u'), canonical)
  for (const link of [page.naverLink, page.xLink, page.facebookLink]) {
    assert.ok(!link.href.includes('deploy-preview'))
  }
})

test('unverified canonical leaves every social link inactive', () => {
  const page = fakePage({}, 'https://deploy-preview.example.org/knowledge/family-emergency-contact-plan/')
  assert.equal(page.actions.hidden, true)
  for (const link of [page.naverLink, page.xLink, page.facebookLink]) assert.equal(link.href, undefined)
})
