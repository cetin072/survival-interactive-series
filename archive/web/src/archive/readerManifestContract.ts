export const readerManifestTransformVersion = 'reader-selection-v1.1.0'

type MinimumReaderManifest = { chronicleId: string; transformVersion: string; coverage?: { verifiedRawParts: number; scanned: number }; chapters: { id: string; body: string; sourceRefs: string[]; archiveSourceRefs: string[] }[] }

export function assertReaderManifest<T extends MinimumReaderManifest>(book: T): T {
  if (book.transformVersion !== readerManifestTransformVersion) throw new Error(`Unsupported Reader manifest: ${book.chronicleId}`)
  if (!book.coverage || book.coverage.scanned !== book.coverage.verifiedRawParts) throw new Error(`Incomplete RAW coverage audit: ${book.chronicleId}`)
  if (book.chapters.some((chapter) => !chapter.body.trim() || !chapter.sourceRefs.length || !chapter.archiveSourceRefs.length)) throw new Error(`Invalid Reader chapter: ${book.chronicleId}`)
  return book
}
