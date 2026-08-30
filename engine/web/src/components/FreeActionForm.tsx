import { FormEvent, useState } from 'react'

export function FreeActionForm({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [value, setValue] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    const action = value.trim()
    if (!action) return
    onSubmit(action)
    setValue('')
  }
  return <form className="free-action" onSubmit={submit}>
    <label htmlFor="free-action">자유행동</label>
    <div><input id="free-action" value={value} onChange={(event) => setValue(event.target.value)} placeholder="원하는 행동을 입력하세요" /><button type="submit">전송</button></div>
  </form>
}
