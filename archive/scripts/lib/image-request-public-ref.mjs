/** Select foreground portrait requests from a verified local public Visual Catalog.
 * Request preparation does not reserve an attempt, execute a model or prove cost.
 */
import { makeImagePocRequest, validateImagePocRequest } from './image-poc-exchange.mjs'
import { planVisualSelection, validateVisualCatalog } from './visual-compiler.mjs'
import { inspectPublicRef } from './reader-public-ref.mjs'
import { verifyVisualAtPublicRef } from './visual-public-ref.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const visualPath = 'archive/content/visuals/C03-AFTERFALL/VISUALS.json'

export async function prepareImageRequestsFromPublicRef(options = {}) {
  const inspected = await inspectPublicRef(options)
  const verified = await verifyVisualAtPublicRef(options)
  demand(verified.baseCommit === inspected.base, 'VISUAL_REF_MOVED_DURING_REQUEST_READ')
  const bytes = await inspected.read(visualPath)
  demand(bytes.equals(verified.candidateBytes), 'VISUAL_CATALOG_CHANGED_DURING_REQUEST_READ')
  const catalog = JSON.parse(bytes.toString('utf8'))
  validateVisualCatalog(catalog)
  const selection = planVisualSelection(catalog)
  demand(selection.execution_enabled === false, 'IMAGE_EXECUTION_NOT_ALLOWED')
  const byId = new Map(catalog.points.map((point) => [point.point_id, point]))
  const requests = [], deferred = []
  for (const pointId of selection.selected_point_ids) {
    const point = byId.get(pointId)
    demand(point?.status === 'READY', 'SELECTED_IMAGE_POINT_NOT_READY')
    if (point.point_type !== 'CHARACTER') {
      deferred.push({ point_id: pointId, reason: 'FOREGROUND_POC_PORTRAIT_ONLY' })
      continue
    }
    const request = makeImagePocRequest(point, {
      batch_id: catalog.batch_id, source_revision: inspected.base })
    validateImagePocRequest(request)
    requests.push(request)
  }
  return { status: 'IMAGE_REQUESTS_PREPARED_NO_EXECUTION',
    ref: inspected.ref, source_revision: inspected.base,
    catalog_sha256: catalog.content_sha256,
    selected_point_ids: selection.selected_point_ids,
    requests, deferred, attempt_history: 'NOT_SUPPLIED',
    execution_enabled: false, provider_calls: 0, images_generated: 0,
    database_writes: 0, storage_uploads: 0, site_publications: 0,
    zero_added_cost_proven: false }
}
