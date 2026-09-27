/** Content-addressed private Supabase Storage handoff. No call is made until invoked. */
import { inspectPng, pocDigest } from './image-poc-exchange.mjs'
import { acceptForegroundLocalCandidate, planForegroundLocalIngest } from './foreground-image-handoff.mjs'

const demand = (ok, code) => { if (!ok) throw new Error(code) }
const BUCKET = 'survival-archive-originals'

export async function uploadAndVerifyArchiveOriginal({ baseUrl, serviceKey, catalog, observation,
  approval, candidate, originalBytes, fetchImpl = fetch }) {
  demand(typeof baseUrl === 'string' && /^https:\/\/[a-z0-9.-]+$/.test(baseUrl)
    && typeof serviceKey === 'string' && serviceKey.length > 20, 'STORAGE_CREDENTIALS_REQUIRED')
  const file = inspectPng(originalBytes)
  const point = catalog?.points?.find((entry) => entry.point_id === observation?.point_id)
  const expected = acceptForegroundLocalCandidate(point, observation, originalBytes, approval)
  demand(pocDigest(candidate) === pocDigest(expected), 'STORAGE_CANDIDATE_MISMATCH')
  planForegroundLocalIngest(candidate, catalog, observation, originalBytes)
  demand(candidate?.status === 'ACCEPTED_LOCAL_CANDIDATE'
    && candidate.storage_status === 'NOT_STORED' && candidate.file?.sha256 === file.sha256
    && /^candidate-[a-f0-9]{64}$/.test(candidate.candidate_id), 'STORAGE_CANDIDATE_INVALID')
  const path = `AFTERFALL/${candidate.candidate_id}/${file.sha256}.png`
  const url = `${baseUrl}/storage/v1/object/${BUCKET}/${path}`
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const readback = async () => {
    const response = await fetchImpl(`${baseUrl}/storage/v1/object/authenticated/${BUCKET}/${path}`,
      { method: 'GET', headers, cache: 'no-store' })
    if (response.status === 404) return null
    demand(response.ok, 'STORAGE_READBACK_FAILED')
    const bytes = Buffer.from(await response.arrayBuffer())
    demand(bytes.equals(originalBytes), 'STORAGE_READBACK_HASH_MISMATCH')
    return bytes
  }
  let uploadStatus
  try {
    const response = await fetchImpl(url, { method: 'POST', headers: { ...headers,
      'Content-Type': 'image/png', 'x-upsert': 'false' }, body: originalBytes })
    if (!response.ok && response.status !== 409)
      throw new Error(response.status >= 500 || response.status === 429
        ? 'STORAGE_UPLOAD_OUTCOME_UNKNOWN' : 'STORAGE_UPLOAD_FAILED')
    uploadStatus = response.status === 409 ? 'EXISTING_OBJECT_REUSED' : 'UPLOADED'
  } catch (error) {
    // A lost response may follow a successful upload. Read first; never POST again here.
    if (error?.message === 'STORAGE_UPLOAD_FAILED') throw error
    const bytes = await readback()
    if (bytes === null) return { status: 'UPLOAD_OUTCOME_UNKNOWN_RECONCILE_LATER',
      bucket: BUCKET, object_path: path, sha256: file.sha256, upload_attempts: 1,
      storage_verified: false }
    return { status: 'UPLOAD_RESPONSE_LOST_OBJECT_VERIFIED', bucket: BUCKET,
      object_path: path, sha256: file.sha256, upload_attempts: 1, storage_verified: true }
  }
  const bytes = await readback()
  demand(bytes !== null, 'STORAGE_UPLOAD_NOT_READABLE')
  return { status: uploadStatus, bucket: BUCKET, object_path: path,
    sha256: file.sha256, upload_attempts: 1, storage_verified: true }
}
