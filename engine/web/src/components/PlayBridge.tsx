import { useState } from 'react'

export const CHAT_URL_STORAGE_KEY = 'survival-record-chatgpt-url'
export const CHATGPT_ANDROID_PACKAGE = 'com.openai.chatgpt'

export function normalizeChatGptUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'https:') return null
    if (url.hostname !== 'chatgpt.com' && url.hostname !== 'www.chatgpt.com') return null
    return url.toString()
  } catch {
    return null
  }
}

export function isAndroidUserAgent(userAgent: string): boolean {
  return /Android/i.test(userAgent)
}

export function buildAndroidChatGptIntent(targetUrl: string): string {
  const normalized = normalizeChatGptUrl(targetUrl) ?? 'https://chatgpt.com/'
  const url = new URL(normalized)
  const path = `${url.pathname}${url.search}`

  return `intent://${url.host}${path}#Intent;scheme=https;package=${CHATGPT_ANDROID_PACKAGE};end`
}

function initialSavedUrl(): string {
  if (typeof window === 'undefined') return ''
  const saved = window.localStorage.getItem(CHAT_URL_STORAGE_KEY)
  return saved ? normalizeChatGptUrl(saved) ?? '' : ''
}

export function PlayBridge() {
  const [savedUrl, setSavedUrl] = useState(initialSavedUrl)
  const [draftUrl, setDraftUrl] = useState(savedUrl)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const webTarget = savedUrl || 'https://chatgpt.com/'
  const android = typeof navigator !== 'undefined' && isAndroidUserAgent(navigator.userAgent)
  const launchTarget = android ? buildAndroidChatGptIntent(webTarget) : webTarget

  const save = () => {
    const normalized = normalizeChatGptUrl(draftUrl)
    if (!normalized) {
      setError('chatgpt.com의 https 주소만 저장할 수 있습니다.')
      return
    }
    window.localStorage.setItem(CHAT_URL_STORAGE_KEY, normalized)
    setSavedUrl(normalized)
    setDraftUrl(normalized)
    setEditing(false)
    setError('')
  }

  const clear = () => {
    window.localStorage.removeItem(CHAT_URL_STORAGE_KEY)
    setSavedUrl('')
    setDraftUrl('')
    setEditing(false)
    setError('')
  }

  return <section className="play-bridge" aria-label="게임 시작">
    <div className="play-bridge-copy">
      <p className="play-bridge-kicker">WEB-FIRST PLAY</p>
      <h2>현재 상태를 확인했으면 플레이를 이어가세요.</h2>
      <p>실제 자유행동·가족 자율성·세계 판정은 ChatGPT 앱 또는 시즌 채팅에서 진행됩니다.</p>
    </div>

    <div className="play-bridge-actions">
      <a className="play-primary" href={launchTarget}>
        {android ? 'CHATGPT 앱 열기' : savedUrl ? 'PLAY IN CHATGPT' : 'CHATGPT 열기'}
      </a>
      <button className="play-secondary" type="button" onClick={() => setEditing((current) => !current)}>
        {editing ? '링크 설정 닫기' : savedUrl ? '시즌 링크 변경' : '시즌 링크 저장 · 선택'}
      </button>
    </div>

    {editing && <div className="play-link-setup">
      <label htmlFor="season-chat-url">시즌 ChatGPT 주소 · 선택 저장</label>
      <div className="play-link-row">
        <input
          id="season-chat-url"
          value={draftUrl}
          onChange={(event) => setDraftUrl(event.target.value)}
          placeholder="https://chatgpt.com/c/..."
          inputMode="url"
          autoComplete="off"
        />
        <button className="play-primary" type="button" onClick={save}>저장</button>
      </div>
      {error && <p className="play-link-error" role="alert">{error}</p>}
      <p className="play-link-help">Android에서는 앱 직접 실행만 시도합니다. 특정 시즌 채팅으로 바로 들어가고 싶을 때만 주소를 저장하세요.</p>
      {savedUrl && <button className="play-clear" type="button" onClick={clear}>저장된 링크 삭제</button>}
    </div>}
  </section>
}
