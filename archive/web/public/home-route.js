// Synchronous head bootstrap: the shared SPA shell must not flash the home
// or claim its canonical/OG metadata on Reader, Wiki, or operator URLs.
(() => {
  const params = new URLSearchParams(window.location.search)
  const home = (window.location.pathname === '/' || window.location.pathname === '/index.html') && !params.has('view')
  if (!home) {
    document.documentElement.dataset.archiveClientRoute = 'true'
    document.querySelectorAll('[data-home-seo]').forEach((element) => element.remove())
  }
})()
