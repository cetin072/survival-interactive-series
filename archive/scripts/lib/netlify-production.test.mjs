import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findProductionSite, findReadyProductionDeploy } from './netlify-production.mjs'

const mergeSha = 'a'.repeat(40)

test('selects the one configured Archive production site by exact domain', () => {
  const site = { id: 'site-123', name: 'survival-diary-archive',
    ssl_url: 'https://survival-diary-archive.netlify.app' }
  assert.equal(findProductionSite([site, { id: 'other', name: 'other-site', ssl_url: 'https://other.netlify.app' }]), site)
  assert.throws(() => findProductionSite([site, { ...site, id: 'duplicate' }]), /NETLIFY_SITE_LOOKUP_FAILED/)
  assert.throws(() => findProductionSite([{ ...site, ssl_url: 'https://wrong.netlify.app' }]), /NETLIFY_SITE_LOOKUP_FAILED/)
})

test('requires a ready production deploy with the exact squash merge SHA', () => {
  const deploy = { id: 'deploy-123', state: 'ready', context: 'production',
    commit_ref: mergeSha, draft: false }
  assert.equal(findReadyProductionDeploy([deploy], mergeSha), deploy)
  assert.equal(findReadyProductionDeploy([{ ...deploy, state: 'building' }], mergeSha), null)
  assert.equal(findReadyProductionDeploy([{ ...deploy, context: 'deploy-preview' }], mergeSha), null)
  assert.equal(findReadyProductionDeploy([{ ...deploy, commit_ref: 'b'.repeat(40) }], mergeSha), null)
  assert.equal(findReadyProductionDeploy([{ ...deploy, draft: true }], mergeSha), null)
  assert.equal(findReadyProductionDeploy([deploy], 'invalid'), null)
})
