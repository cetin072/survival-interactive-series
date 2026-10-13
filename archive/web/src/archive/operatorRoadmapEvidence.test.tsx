import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {describe,expect,it} from 'vitest'
import {assessRoadmapBuild,parseBuildEvidence,type RoadmapBuildEvidence} from './operatorRoadmapEvidence'
import {OperatorRoadmap} from './OperatorRoadmap'
const sha='e'.repeat(40)
const manifest:RoadmapBuildEvidence={
  schema:'operator-roadmap-build-evidence/v2',kind:'BUILD_ARTIFACTS_ONLY',
  context:'deploy-preview',commit_ref:sha,provider:'netlify',generated_at:'2026-10-13T06:00:00Z',
  artifacts:{knowledge_home:true,published_knowledge_pages:13,bag_landing:true,
    bag_web_app:true,bag_pwa_manifest:true,published_bag_item_pages:0}
}
const deployment={context:'deploy-preview',commit_ref:sha,provider:'netlify'}
const release={policy:'BATCHED_PRODUCTION',source_main_sha:'f'.repeat(40),released_on_kst:'2026-10-12'}
describe('V2-A independent site build evidence',()=>{
  it('shows actual Preview pages but no Production or user action claim',()=>{
    const result=assessRoadmapBuild(manifest,deployment,release,'deploy-preview-542--survival-diary-archive.netlify.app')
    expect(result.surface).toBe('PREVIEW_BUILD')
    expect(result.artifacts.find(x=>x.id==='knowledge')?.count).toBe(13)
    expect(result.artifacts.find(x=>x.id==='bag-guides')?.state).toBe('ABSENT_FROM_BUILD')
    expect(result.explanation).toContain('main 병합이나 정식 사이트 공개를 뜻하지')
  })
  it('confirms a deployed Production BUILD only with matching metadata and release marker',()=>{
    const prod={...manifest,context:'production' as const}
    expect(assessRoadmapBuild(prod,{...deployment,context:'production'},release,'survival-diary-archive.netlify.app').surface).toBe('PRODUCTION_BUILD')
    expect(assessRoadmapBuild(prod,{...deployment,context:'production'},null,'survival-diary-archive.netlify.app').surface).toBe('UNVERIFIED')
    expect(assessRoadmapBuild(prod,{...deployment,context:'production'},release,'deploy-preview-542--survival-diary-archive.netlify.app').surface).toBe('UNVERIFIED')
  })
  it('rejects cross-commit mismatches, malformed counts and forged hosts',()=>{
    expect(assessRoadmapBuild(manifest,{...deployment,commit_ref:'f'.repeat(40)},release,'deploy-preview-542--survival-diary-archive.netlify.app').artifacts.every(x=>x.state==='UNKNOWN')).toBe(true)
    expect(assessRoadmapBuild(manifest,deployment,release,'fake-deploy-preview-542--survival-diary-archive.netlify.app').surface).toBe('UNVERIFIED')
    expect(parseBuildEvidence({...manifest,artifacts:{...manifest.artifacts,published_bag_item_pages:-4}})).toBe(null)
    expect(parseBuildEvidence({...manifest,context:'forged-production'})).toBe(null)
  })
  it('does not infer a published article from unrelated draft files',()=>{
    const a=assessRoadmapBuild(manifest,deployment,release,'deploy-preview-542--survival-diary-archive.netlify.app')
    expect(a.artifacts.find(x=>x.id==='bag-guides')?.count).toBe(0)
    expect(a.artifacts.find(x=>x.id==='bag-guides')?.present).toBe(false)
  })
  it('renders evidence as a separate card from 30-day strategy and conversion results',()=>{
    const html=renderToStaticMarkup(createElement(OperatorRoadmap,{
      logs:[],today:'2026-10-13',hostname:'deploy-preview-542--survival-diary-archive.netlify.app',
      buildEvidence:manifest,deployMeta:deployment,releaseMeta:release,
    }))
    expect(html).toContain('사이트 산출물 자동 확인')
    expect(html).toContain('검수 빌드 확인')
    expect(html).toContain('물품별 생존지식')
    expect(html).toContain('실제 준비 행동은 별도 계측 대기')
    expect(html).not.toContain('13개 실제 준비')
  })
  it('preserves missing data as unknown, not unfinished or successfully published',()=>{
    const html=renderToStaticMarkup(createElement(OperatorRoadmap,{
      logs:[],today:'2026-10-13',hostname:'survival-diary-archive.netlify.app',
      buildEvidence:null,deployMeta:null,releaseMeta:null,
    }))
    expect(html).toContain('빌드 증거 조회 필요')
    expect(html).toContain('확인 필요')
    expect(html).not.toContain('정식 사이트 빌드 확인')
  })
})
