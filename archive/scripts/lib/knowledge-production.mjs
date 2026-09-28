const shaPattern = /^[a-f0-9]{40}$/

export function isExactProductionDeployMeta(meta, expectedCommit) {
  return Boolean(meta
    && meta.version === 1
    && meta.provider === 'netlify'
    && meta.context === 'production'
    && shaPattern.test(expectedCommit ?? '')
    && meta.commit_ref === expectedCommit)
}
