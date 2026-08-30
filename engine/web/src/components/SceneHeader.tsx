type Props = { day: string; time: string; location: string; showPanels: boolean; onTogglePanels: () => void }

export function SceneHeader({ day, time, location, showPanels, onTogglePanels }: Props) {
  return <header className="scene-header">
    <div><p className="eyebrow">{day} · {time}</p><h1>{location}</h1></div>
    <button className="panel-toggle" type="button" onClick={onTogglePanels} aria-pressed={showPanels}>
      {showPanels ? '상태 숨기기' : '상태 보기'}
    </button>
  </header>
}
