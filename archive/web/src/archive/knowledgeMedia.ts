import type { SupabaseClient } from '@supabase/supabase-js'

export const knowledgeMediaBucket = 'survival-knowledge-media'
export const knowledgeMediaMaxSourceBytes = 12 * 1024 * 1024
export const knowledgeMediaMaxPublishedBytes = 200 * 1024
const allowedSourceTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxDimensions = [1600, 1400, 1200, 1000, 800, 640]
const qualities = [0.82, 0.72, 0.62, 0.52, 0.42]

export type PreparedKnowledgeImage = {
  blob: Blob
  width: number
  height: number
  bytes: number
  alt: string
}

export type UploadedKnowledgeImage = {
  url: string
  path: string
  width: number
  height: number
  bytes: number
  alt: string
}

function filenameAlt(name: string) {
  const base = name.replace(/\.[^.]+$/, '').trim()
  return base || '생존 지식 이미지'
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('KNOWLEDGE_IMAGE_ENCODE_FAILED')), 'image/webp', quality)
  })
}

export function knowledgeMediaObjectPath(jobId: string, assetId: string = crypto.randomUUID()) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
    throw new Error('KNOWLEDGE_MEDIA_JOB_ID_INVALID')
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) {
    throw new Error('KNOWLEDGE_MEDIA_ASSET_ID_INVALID')
  }
  return `knowledge/${jobId.toLowerCase()}/${assetId.toLowerCase()}.webp`
}

export async function prepareKnowledgeImage(file: File): Promise<PreparedKnowledgeImage> {
  if (!allowedSourceTypes.has(file.type)) throw new Error('KNOWLEDGE_IMAGE_TYPE_UNSUPPORTED')
  if (!file.size || file.size > knowledgeMediaMaxSourceBytes) throw new Error('KNOWLEDGE_IMAGE_SOURCE_TOO_LARGE')
  if (typeof createImageBitmap !== 'function') throw new Error('KNOWLEDGE_IMAGE_BROWSER_UNSUPPORTED')

  const bitmap = await createImageBitmap(file)
  try {
    for (const maxDimension of maxDimensions) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('KNOWLEDGE_IMAGE_CANVAS_UNAVAILABLE')
      context.drawImage(bitmap, 0, 0, width, height)

      for (const quality of qualities) {
        const blob = await canvasBlob(canvas, quality)
        if (blob.size <= knowledgeMediaMaxPublishedBytes) {
          return { blob, width, height, bytes: blob.size, alt: filenameAlt(file.name) }
        }
      }
    }
  } finally {
    bitmap.close()
  }

  throw new Error('KNOWLEDGE_IMAGE_CANNOT_MEET_PUBLIC_BUDGET')
}

export async function uploadKnowledgeImage(
  client: SupabaseClient,
  jobId: string,
  file: File,
): Promise<UploadedKnowledgeImage> {
  const prepared = await prepareKnowledgeImage(file)
  const path = knowledgeMediaObjectPath(jobId)
  const { error } = await client.storage
    .from(knowledgeMediaBucket)
    .upload(path, prepared.blob, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    })
  if (error) throw new Error(`KNOWLEDGE_IMAGE_UPLOAD_FAILED:${error.message}`)

  const { data } = client.storage.from(knowledgeMediaBucket).getPublicUrl(path)
  if (!data.publicUrl?.startsWith('https://')) throw new Error('KNOWLEDGE_IMAGE_PUBLIC_URL_INVALID')
  return {
    url: data.publicUrl,
    path,
    width: prepared.width,
    height: prepared.height,
    bytes: prepared.bytes,
    alt: prepared.alt,
  }
}
