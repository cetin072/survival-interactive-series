import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Source-of-truth: files actually emitted into the current isolated dist build.
// A file existing in main, a PR, or Draft is not the same as a production publish.
const repositoryDist=resolve(import.meta.dirname,'../web/dist')
const isFile=async path=>{try{return (await stat(path)).isFile()}catch{return false}}
const shaPattern=/^[0-9a-f]{40}$/

async function countPages(distRoot,folder,excluded=[]) {
  const parent=join(distRoot,folder)
  let dirs=[]
  try {dirs=await readdir(parent,{withFileTypes:true})}catch{return 0}
  let count=0
  for(const entry of dirs) {
    if(!entry.isDirectory()||excluded.includes(entry.name))continue
    if(await isFile(join(parent,entry.name,'index.html')))count++
  }
  return count
}
export async function projectRoadmapEvidence(distRoot,deployMeta) {
  if(!deployMeta || typeof deployMeta!=='object') throw new Error('ROADMAP_DEPLOY_META_MISSING')
  const commit=deployMeta.commit_ref
  const context=deployMeta.context
  if(typeof commit!=='string'||(!shaPattern.test(commit)&&commit!=='local'))throw new Error('ROADMAP_COMMIT_INVALID')
  if(!['local','github-ci','deploy-preview','branch-deploy','production'].includes(context))throw new Error('ROADMAP_CONTEXT_INVALID')
  const knowledgeHome=await isFile(join(distRoot,'knowledge/index.html'))
  const bagLanding=await isFile(join(distRoot,'bag/index.html'))
  const bagWebApp=await isFile(join(distRoot,'bag-lab/alpha.html'))
  const bagPwa=bagWebApp && await isFile(join(distRoot,'bag-lab/manifest.webmanifest'))
  const knowledgeCount=await countPages(distRoot,'knowledge',['bag','downloads'])
  const bagGuideCount=await countPages(distRoot,'knowledge/bag',[])
  if(bagGuideCount>0 && !await isFile(join(distRoot,'knowledge/bag/index.html'))) {
    // Individual guides may be emitted by tooling, but an inventory route is not
    // necessarily ready. Do not silently count the browse page as an actual guide.
  }
  return {
    schema:'operator-roadmap-build-evidence/v2',
    kind:'BUILD_ARTIFACTS_ONLY',
    commit_ref:commit,
    context,
    provider:deployMeta.provider??null,
    generated_at:new Date().toISOString(),
    artifacts: {
      knowledge_home:knowledgeHome,
      published_knowledge_pages:knowledgeCount,
      bag_landing:bagLanding,
      bag_web_app:bagWebApp,
      bag_pwa_manifest:bagPwa,
      published_bag_item_pages:bagGuideCount,
    },
    notice:'Built HTML presence only; not CI approval, app installation, data collection, user action, or business milestone completion.',
  }
}
export async function writeRoadmapEvidence(distRoot=repositoryDist) {
  const meta=JSON.parse(await readFile(join(distRoot,'deploy-meta.json'),'utf8'))
  const evidence=await projectRoadmapEvidence(distRoot,meta)
  await mkdir(distRoot,{recursive:true})
  await writeFile(join(distRoot,'operator-roadmap-evidence.json'),JSON.stringify(evidence,null,2)+'\n')
  return evidence
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const data=await writeRoadmapEvidence()
  process.stdout.write(JSON.stringify({status:'OPERATOR_ROADMAP_EVIDENCE_WRITTEN',context:data.context,commit_ref:data.commit_ref,artifacts:data.artifacts})+'\n')
}
