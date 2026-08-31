import { useEffect, useRef, useState } from 'react'

export const BGM_VOLUME_STORAGE_KEY = 'survival-record-bgm-volume'
export const BGM_ENABLED_STORAGE_KEY = 'survival-record-bgm-enabled'
export const DEFAULT_BGM_VOLUME = 0.25

export function storedBgmVolume(value: string | null): number {
  if (value === null) return DEFAULT_BGM_VOLUME

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_BGM_VOLUME
}

export function storedBgmEnabled(value: string | null): boolean {
  return value === 'true'
}

function initialVolume(): number {
  return typeof window === 'undefined'
    ? DEFAULT_BGM_VOLUME
    : storedBgmVolume(window.localStorage.getItem(BGM_VOLUME_STORAGE_KEY))
}

function initialEnabled(): boolean {
  return typeof window !== 'undefined' && storedBgmEnabled(window.localStorage.getItem(BGM_ENABLED_STORAGE_KEY))
}

export function BgmControl() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [volume, setVolume] = useState(initialVolume)
  const [enabled, setEnabled] = useState(initialEnabled)
  const [playing, setPlaying] = useState(false)
  const [showVolume, setShowVolume] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(BGM_VOLUME_STORAGE_KEY, String(volume))
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (playing) {
      audio.pause()
      setPlaying(false)
      setEnabled(false)
      window.localStorage.setItem(BGM_ENABLED_STORAGE_KEY, 'false')
      return
    }

    try {
      await audio.play()
      setPlaying(true)
      setEnabled(true)
      window.localStorage.setItem(BGM_ENABLED_STORAGE_KEY, 'true')
    } catch {
      setPlaying(false)
      setEnabled(false)
      window.localStorage.setItem(BGM_ENABLED_STORAGE_KEY, 'false')
    }
  }

  return <div className="bgm-control" aria-label="배경음악">
    <audio ref={audioRef} src="/audio/cold-night-small-fire.mp3" loop preload="metadata" />
    <button className="bgm-toggle" type="button" onClick={() => { void togglePlayback() }} aria-pressed={playing}>
      {playing ? 'BGM ❚❚' : 'BGM ▶'}
    </button>
    <button className="bgm-volume-toggle" type="button" onClick={() => setShowVolume((current) => !current)} aria-expanded={showVolume} aria-label="BGM 볼륨 조절">
      VOL
    </button>
    {showVolume && <label className="bgm-volume">
      <span className="sr-only">BGM 볼륨</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        onChange={(event) => setVolume(Number(event.target.value))}
        aria-label="BGM 볼륨"
      />
      <span>{Math.round(volume * 100)}%</span>
    </label>}
    {enabled && !playing && <span className="sr-only">BGM 재생은 직접 버튼을 눌러 시작할 수 있습니다.</span>}
  </div>
}
