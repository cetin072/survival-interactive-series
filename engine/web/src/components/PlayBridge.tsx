import { useState } from 'react'

export const CHAT_URL_STORAGE_KEY = 'survival-record-chatgpt-url'

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

function initialSavedUrl(): string {
  if (typeof window === 'undefined') return ''
  const saved = window.localStorage.getItem(CHAT_URL_STORAGE_KEY)
  return saved ? normalizeChatGptUrl(saved) ?? '' : ''
}

export function PlayBridge() {
  const [savedUrl, setSavedUrl] = useState(initialSavedUrl)
  const [draftUrl, setDraftUrl] = useState(savedUrl)
  const [editing, setEditing] = useState(savedUrl.length === 0)
  const [error, setError] = useState('')

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
    setEditing(true)
    setError('')
  }

  return <section className="play-bridge" aria-label="게임 시작">
    <div className="play-bridge-copy">
      <p className="play-bridge-kicker">WEB-FIRST PLAY</p>
      <h2>현재 상태를 확인했으면 플레이를 이어가세요.</h2>
      <p>실제 자유행동·가족 자율성·세계 판정은 ChatGPT의 시즌 채팅에서 진행됩니다.</p>
    </div>

    {savedUrl && !editing
      ? <div className="play-bridge-actions">
          <a className="play-primary" href={savedUrl} target="_blank" rel="noreferrer">PLAY IN CHATGPT</a>
          <button className="play-secondary" type="button" onClick={() => setEditing(true)}>시즌 링크 변경</button>
        </div>
      : <div className="play-link-setup">
          <label htmlFor="season-chat-url">시즌 ChatGPT 주소 · 처음 1회 저장</label>
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
          <p className="play-link-help">아직 시즌 채팅이 없다면 먼저 ChatGPT를 열어 S07 채팅을 만든 뒤 그 주소를 여기에 저장하세요.</p>
          <a className="play-open-chatgpt" href="https://chatgpt.com/" target="_blank" rel="noreferrer">CHATGPT 열기</a>
          {savedUrl && <button className="play-clear" type="button" onClick={clear}>저장된 링크 삭제</button>}
        </div>}
  </section>
}
