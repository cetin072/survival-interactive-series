import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { root } from './lib/knowledge-content.mjs'

const ids = ['K-015', 'K-018']
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const within = (parent, child) => child.toLowerCase() === parent.toLowerCase() || child.toLowerCase().startsWith((parent + sep).toLowerCase())

export async function generateEditorialQaPreview(outputDir) {
  const target = resolve(outputDir)
  if (within(root, target)) throw new Error('EDITORIAL_QA_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY')
  await mkdir(target, { recursive: true })
  if ((await readdir(target)).length) throw new Error('EDITORIAL_QA_OUTPUT_MUST_BE_EMPTY')

  const style = (await Promise.all(['wikiShell.css', 'survivalDesignLanguage.css'].map((name) =>
    readFile(join(root, 'archive/web/src/archive', name), 'utf8')))).join('\n')
  const renderer = await (await import('../web/render-knowledge.mjs')).createKnowledgePageRenderer()
  const manifest = []
  try {
    for (const id of ids) {
      const bytes = await readFile(join(root, 'knowledge/editorial-review', `${id}.editorial-v2.json`))
      const proposal = JSON.parse(bytes)
      const brief = proposal.proposed_brief
      if (proposal.status !== 'EDITORIAL_PROPOSAL_NOT_APPROVED' || brief?.id !== id ||
        brief.status !== 'READY' || brief.risk_level !== 'HIGH' || brief.publication_policy !== 'HUMAN_APPROVED' ||
        !/^[0-9a-f]{64}$/.test(proposal.original?.semantic_result_sha256 ?? '') ||
        !/^[0-9a-f]{40}$/.test(proposal.original?.pr_head_sha ?? '') ||
        !proposal.original?.job_id || !Number.isInteger(proposal.original?.pr_number)) {
        throw new Error(`EDITORIAL_QA_PROPOSAL_BINDING_INVALID: ${id}`)
      }
      const proposalSha = sha(bytes)
      const draft = { ...brief, published_at: '', related_briefs: [], related_stories: [], related_guide: null }
      const article = renderer.render(draft)
      const html = `<!doctype html>
<html lang="ko" data-brief-id="${esc(id)}" data-proposal-sha256="${proposalSha}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>${esc(id)} Editorial V2 QA · 미승인 원고</title>
<style>${style}\nbody{margin:0}.qa-sticky{position:sticky;top:0;z-index:20;padding:8px 14px;background:#713018;color:#fff;font:700 13px/1.4 system-ui,sans-serif}.qa-banner{padding:16px 24px;background:#18251d;color:#fff;font:15px/1.55 system-ui,sans-serif}.qa-banner strong{display:block;font-size:20px}.qa-banner p{margin:5px 0}.qa-banner code{word-break:break-all;font-size:12px;color:#d8e5d4}.qa-banner .qa-warning{color:#ffe5a7;font-weight:700}</style></head>
<body><div class="qa-sticky">${esc(id)} Editorial V2 수정 제안 ${proposalSha.slice(0, 12)} · 미승인 · 기존 Operator 원고와 다름</div><aside class="qa-banner" aria-label="Editorial V2 미승인 원고 안내">
<strong>${esc(id)} · Editorial V2 검수용 화면</strong>
<p class="qa-warning">미승인 수정 제안 · 기존 Operator 사람검토 원고와 다른 버전 · 게시 및 승인 불가</p>
<p>원본 Job ${esc(proposal.original.job_id)} · 기존 PR #${esc(proposal.original.pr_number)} · 원본 head ${esc(proposal.original.pr_head_sha)}</p>
<p>수정 제안 파일 SHA-256 <code>${proposalSha}</code></p>
<p>기존 semantic result SHA-256 <code>${esc(proposal.original.semantic_result_sha256)}</code></p>
</aside>${article}</body></html>`
      const filename = `${id}.editorial-v2.qa.html`
      await writeFile(join(target, filename), html)
      manifest.push({ id, filename, proposal_sha256: proposalSha,
        original_job_id: proposal.original.job_id, original_pr_number: proposal.original.pr_number,
        original_pr_head_sha: proposal.original.pr_head_sha,
        original_semantic_result_sha256: proposal.original.semantic_result_sha256,
        status: proposal.status })
    }
    await writeFile(join(target, 'manifest.json'), JSON.stringify({ kind: 'EDITORIAL_V2_OFFLINE_QA', publication_approval: false, items: manifest }, null, 2) + '\n')
    return { output_dir: target, items: manifest }
  } finally { await renderer.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--out')
  if (at >= 0 && !process.argv[at + 1]) throw new Error('EDITORIAL_QA_OUTPUT_REQUIRED')
  const output = at >= 0 ? process.argv[at + 1] : await mkdtemp(join(tmpdir(), 'knowledge-editorial-v2-qa-'))
  console.log(JSON.stringify(await generateEditorialQaPreview(output)))
}
