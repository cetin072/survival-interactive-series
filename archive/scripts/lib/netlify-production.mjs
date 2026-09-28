const shaPattern = /^[a-f0-9]{40}$/

export function findProductionSite(sites) {
  if (!Array.isArray(sites)) throw new Error('NETLIFY_SITE_LOOKUP_FAILED')
  const matches = sites.filter((site) => {
    if (site?.name !== 'survival-diary-archive' || typeof site.id !== 'string' || !site.id) return false
    try {
      return new URL(site.ssl_url ?? site.url).hostname === 'survival-diary-archive.netlify.app'
    } catch { return false }
  })
  if (matches.length !== 1) throw new Error('NETLIFY_SITE_LOOKUP_FAILED')
  return matches[0]
}

export function findReadyProductionDeploy(deploys, expectedCommit) {
  if (!shaPattern.test(expectedCommit) || !Array.isArray(deploys)) return null
  return deploys.find((deploy) => typeof deploy?.id === 'string' && deploy.id
    && deploy.state === 'ready'
    && deploy.context === 'production' && deploy.commit_ref === expectedCommit
    && deploy.draft !== true) ?? null
}
