import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectRoadmapEvidence, writeRoadmapEvidence } from '../build-operator-roadmap-evidence.mjs'

const meta={commit_ref:'a'.repeat(40),context:'deploy-preview',provider:'netlify'}
const page=async(root,path)=>{const parts=path.split('/'); await mkdir(join(root,...parts.slice(0,-1)),{recursive:true}); await writeFile(join(root,path),'<!doctype html><title>Test</title>')}
test('counts real published HTML files only, excluding unrelated directories and drafts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'roadmap-build-'))
  try{
    await page(root,'knowledge/index.html')
    await page(root,'knowledge/emergency-supplies-inventory/index.html')
    await page(root,'knowledge/family-emergency-contact-plan/index.html')
    await page(root,'knowledge/downloads/index.html')
    await page(root,'knowledge/bag/index.html')
    await page(root,'knowledge/bag/flashlight/index.html')
    await page(root,'knowledge/bag/raincoat/index.html')
    await page(root,'bag/index.html')
    await page(root,'bag-lab/alpha.html')
    await page(root,'bag-lab/manifest.webmanifest')
    const data=await projectRoadmapEvidence(root,meta)
    assert.deepEqual(data.artifacts,{
      knowledge_home:true,published_knowledge_pages:2,bag_landing:true,
      bag_web_app:true,bag_pwa_manifest:true,published_bag_item_pages:2,
    })
    assert.equal(data.kind,'BUILD_ARTIFACTS_ONLY')
  }finally{await rm(root,{recursive:true,force:true})}
})
test('missing or draft-only content never becomes published evidence',async()=>{
  const root=await mkdtemp(join(tmpdir(),'roadmap-empty-'))
  try {
    await page(root,'knowledge/index.html')
    await page(root,'knowledge/bag-preview/flashlight/index.html')
    await page(root,'bag-lab/manifest.webmanifest')
    const data=await projectRoadmapEvidence(root,meta)
    assert.equal(data.artifacts.published_knowledge_pages,0)
    assert.equal(data.artifacts.published_bag_item_pages,0)
    assert.equal(data.artifacts.bag_web_app,false)
    assert.equal(data.artifacts.bag_pwa_manifest,false)
  }finally{await rm(root,{recursive:true,force:true})}
})
test('rejects malformed deployment context or commit identity rather than manufacturing evidence',async()=>{
  const root=await mkdtemp(join(tmpdir(),'roadmap-bad-'))
  try{
    await assert.rejects(projectRoadmapEvidence(root,{...meta,commit_ref:'PR-merged'}),/ROADMAP_COMMIT_INVALID/)
    await assert.rejects(projectRoadmapEvidence(root,{...meta,context:'fake-production'}),/ROADMAP_CONTEXT_INVALID/)
    await assert.rejects(projectRoadmapEvidence(root,null),/ROADMAP_DEPLOY_META_MISSING/)
  }finally{await rm(root,{recursive:true,force:true})}
})
test('writes stable versioned manifest derived from the same build metadata',async()=>{
  const root=await mkdtemp(join(tmpdir(),'roadmap-write-'))
  try {
    await writeFile(join(root,'deploy-meta.json'),JSON.stringify(meta))
    await page(root,'knowledge/index.html')
    const saved=await writeRoadmapEvidence(root)
    const read=JSON.parse(await readFile(join(root,'operator-roadmap-evidence.json'),'utf8'))
    assert.deepEqual(read,saved)
    assert.equal(read.schema,'operator-roadmap-build-evidence/v2')
    assert.equal(read.commit_ref,meta.commit_ref)
  }finally{await rm(root,{recursive:true,force:true})}
})
