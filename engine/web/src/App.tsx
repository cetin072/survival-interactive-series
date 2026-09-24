import { useEffect, useState } from 'react'
import { ArchiveApp } from './archive/ArchiveApp'
import { CanonV2RuntimeBlock } from './components/CanonV2RuntimeBlock'
import { PlayableTurnLoop } from './components/PlayableTurnLoop'
import { loadCanonV2Runtime } from './runtime/canonV2Runtime'

function isArchiveHash() {
  return window.location.hash.toLowerCase().startsWith('#archive')
}

export default function App() {
  const [archiveMode, setArchiveMode] = useState(isArchiveHash)

  useEffect(() => {
    const handleHashChange = () => setArchiveMode(isArchiveHash())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (archiveMode) return <ArchiveApp />

  return <>
    <a
      href="#archive"
      aria-label="생존일기 아카이브 열기"
      style={{
        position: 'fixed',
        zIndex: 20,
        right: 12,
        bottom: 12,
        padding: '9px 11px',
        border: '1px solid #587461',
        background: '#101713',
        color: '#b9d4bf',
        textDecoration: 'none',
        fontSize: '.65rem',
        letterSpacing: '.08em',
        boxShadow: '0 8px 24px rgba(0,0,0,.28)',
      }}
    >
      ARCHIVE
    </a>
    <CanonV2RuntimeBlock block={loadCanonV2Runtime()}>
      <PlayableTurnLoop />
    </CanonV2RuntimeBlock>
  </>
}
