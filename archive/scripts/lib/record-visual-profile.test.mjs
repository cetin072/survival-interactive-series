import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const profiles = JSON.parse(await readFile(
  resolve(root, 'archive/content/public-facts/C03-AFTERFALL/S03/RECORD_VISUAL_PROFILES_20260930.json'), 'utf8',
))
const graph = JSON.parse(await readFile(
  resolve(root, 'archive/content/graphs/C03-AFTERFALL/GRAPH.json'), 'utf8',
))

test('rich visual profiles cover the complete 40-record public archive', () => {
  assert.equal(profiles.version, 'record-visual-profile-v1')
  assert.equal(profiles.record_count, 40)
  assert.equal(profiles.records.length, 40)
  assert.equal(graph.articles.length, 40)

  const graphIds = new Set(graph.articles.map((article) => article.id))
  const profileIds = new Set(profiles.records.map((record) => record.node_id))
  assert.equal(profileIds.size, 40)
  assert.deepEqual([...profileIds].sort(), [...graphIds].sort())
})

test('every rich profile remains an editorial visual layer with usable depiction cues', () => {
  const operational = /\b(github|supabase|netlify|workflow|provider|storage|registry|handoff|scheduler|automation|report|dashboard|json|sha|ci|pr|api|deploy|receipt)\b/i
  for (const record of profiles.records) {
    assert.ok(['character', 'location', 'event', 'reference'].includes(record.type), record.node_id)
    assert.equal(typeof record.list_description, 'string')
    assert.ok(record.list_description.trim().length >= 20, record.node_id)
    assert.equal(typeof record.description, 'string')
    assert.ok(record.description.trim().length >= 40, record.node_id)
    assert.ok(Array.isArray(record.render_cues) && record.render_cues.length >= 3, record.node_id)
    assert.ok(record.render_cues.every((cue) => typeof cue === 'string' && cue.trim().length >= 2), record.node_id)
    assert.ok(record.render_cues.every((cue) => !operational.test(cue)), record.node_id)
    assert.equal(typeof record.canon_policy, 'string')
    assert.equal(typeof record.source_note, 'string')
  }
})

test('west road artwork stays explicitly illustrative instead of becoming new geography canon', () => {
  const westRoad = profiles.records.find((record) => record.node_id === 'loc-west-road')
  assert.ok(westRoad)
  assert.equal(westRoad.canon_policy, 'CONFIRMED_RECORD_PLUS_USER_SUPPLIED_ILLUSTRATIVE_REFERENCE')
  assert.match(westRoad.source_note, /삽화 자체는 지리·날씨 Canon을 새로 확정하지 않음/)
  assert.ok(westRoad.render_cues.some((cue) => cue.includes('분위기 참고')))
})
