import { StrictMode, useLayoutEffect } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

function ReadyApp() {
  useLayoutEffect(() => { delete document.documentElement.dataset.archiveClientRoute }, [])
  return <App />
}

const root = document.getElementById('root')!
const app = (
  <StrictMode>
    <ReadyApp />
  </StrictMode>
)
if (root.dataset.prerenderedHome && !document.documentElement.dataset.archiveClientRoute) {
  hydrateRoot(root, app)
} else {
  root.replaceChildren()
  createRoot(root).render(app)
}
