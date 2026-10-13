// Operator roadmap V2-A: classify SAME-ORIGIN emitted artifacts, never business outcomes.
export type RoadmapBuildEvidence = {
  schema: 'operator-roadmap-build-evidence/v2'
  kind: 'BUILD_ARTIFACTS_ONLY'
  commit_ref: string
  context: 'production'|'deploy-preview'|'branch-deploy'|'github-ci'|'local'
  provider: string | null
  generated_at: string
  artifacts: {
    knowledge_home: boolean
    published_knowledge_pages: number
    bag_landing: boolean
    bag_web_app: boolean
    bag_pwa_manifest: boolean
    published_bag_item_pages: number
  }
}
export type RoadmapDeployMeta={context?:string,commit_ref?:string,provider?:string}
export type RoadmapRelease={policy?:string,source_main_sha?:string,released_on_kst?:string}
export type RoadmapSurface='PRODUCTION_BUILD'|'PREVIEW_BUILD'|'UNVERIFIED'
export type RoadmapArtifactState='VISIBLE_IN_BUILD'|'ABSENT_FROM_BUILD'|'UNKNOWN'
export type RoadmapArtifact={id:string,title:string,count:number|null,present:boolean|null,state:RoadmapArtifactState,href:string}
export type RoadmapBuildAssessment={
  surface:RoadmapSurface
  label:string
  generatedAt:string|null
  commitRef:string|null
  artifacts:RoadmapArtifact[]
  explanation:string
}
const sha40=/^[a-f0-9]{40}$/
const previewHost=/^(?:deploy-preview-\d+|qa-[a-z0-9-]+)--survival-diary-archive\.netlify\.app$/
const baseArtifacts=[
  {id:'knowledge',title:'생존지식 공개 페이지',href:'/knowledge/'},
  {id:'landing',title:'생존가방 소개',href:'/bag/'},
  {id:'webapp',title:'생존가방 웹앱',href:'/bag-lab/alpha.html'},
  {id:'bag-guides',title:'물품별 생존지식',href:'/knowledge/bag/'},
] as const
const unknown=():RoadmapArtifact[]=>
  baseArtifacts.map(item=>({...item,present:null,count:null,state:'UNKNOWN'}))
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)
const count=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=100000
export function parseBuildEvidence(value:unknown):RoadmapBuildEvidence|null {
  if(!record(value)||value.schema!=='operator-roadmap-build-evidence/v2'||value.kind!=='BUILD_ARTIFACTS_ONLY')return null
  if(typeof value.commit_ref!=='string'||!(sha40.test(value.commit_ref)||value.commit_ref==='local'))return null
  if(!['production','deploy-preview','branch-deploy','github-ci','local'].includes(String(value.context)))return null
  if(typeof value.generated_at!=='string'||!Number.isFinite(Date.parse(value.generated_at)))return null
  if(!(value.provider===null||typeof value.provider==='string'))return null
  const a=value.artifacts
  if(!record(a)||typeof a.knowledge_home!=='boolean'||!count(a.published_knowledge_pages)
    ||typeof a.bag_landing!=='boolean'||typeof a.bag_web_app!=='boolean'
    ||typeof a.bag_pwa_manifest!=='boolean'||!count(a.published_bag_item_pages))return null
  return value as RoadmapBuildEvidence
}
function defaultAssessment():RoadmapBuildAssessment {
  return {
    surface:'UNVERIFIED',label:'빌드 증거 조회 필요',generatedAt:null,commitRef:null,
    artifacts:unknown(),explanation:'동일 서버의 빌드 목록과 배포정보를 확인하기 전에는 완료·미완료로 판단하지 않습니다.',
  }
}
export function assessRoadmapBuild(
  untrusted:unknown,deploy:RoadmapDeployMeta|null,release:RoadmapRelease|null,hostname:string,
):RoadmapBuildAssessment {
  const manifest=parseBuildEvidence(untrusted)
  if(!manifest||!deploy)return defaultAssessment()
  if(manifest.commit_ref!==deploy.commit_ref||manifest.context!==deploy.context){
    return {...defaultAssessment(),explanation:'빌드 목록과 배포 원본이 서로 다릅니다. 확인 전에는 상태를 인정하지 않습니다.'}
  }
  const production=(hostname==='survival-diary-archive.netlify.app'
    &&deploy.context==='production'&&manifest.provider==='netlify'&&deploy.provider==='netlify'
    &&sha40.test(manifest.commit_ref)
    &&release?.policy==='BATCHED_PRODUCTION'
    &&typeof release.source_main_sha==='string'&&sha40.test(release.source_main_sha)
    &&typeof release.released_on_kst==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(release.released_on_kst))
  const preview=(previewHost.test(hostname)
    &&manifest.provider==='netlify'&&deploy.provider==='netlify'
    &&sha40.test(manifest.commit_ref)
    &&['deploy-preview','branch-deploy'].includes(deploy.context??''))
  // A build observed from a dev/local/untrusted origin cannot establish publish status.
  if(!production&&!preview){
    return {...defaultAssessment(),explanation:'이 서버가 승인된 Production·Preview 배포인지 확인되지 않았습니다.'}
  }
  const a=manifest.artifacts
  const artifactData:[
    boolean|number,boolean|number,boolean|number,boolean|number
  ]=[a.knowledge_home?a.published_knowledge_pages:0,a.bag_landing,a.bag_web_app,a.published_bag_item_pages]
  const artifacts:RoadmapArtifact[]=baseArtifacts.map((item,i)=>{
    const input=artifactData[i]
    const present=typeof input==='boolean'?input:input>0
    return {...item,present,count:typeof input==='number'?input:null,
      state:present?'VISIBLE_IN_BUILD':'ABSENT_FROM_BUILD'}
  })
  return {
    surface:production?'PRODUCTION_BUILD':'PREVIEW_BUILD',
    label:production?'정식 사이트 빌드 확인':'검수 빌드 확인',
    generatedAt:manifest.generated_at,
    commitRef:manifest.commit_ref,
    artifacts,
    explanation:production
      ?'현재 정식 사이트에 배포된 HTML 산출물 목록입니다. 검색 색인·실제 이용자 행동·사업 목표 완료를 증명하지 않습니다.'
      :'검수용 Preview에 포함된 산출물입니다. main 병합이나 정식 사이트 공개를 뜻하지 않습니다.',
  }
}
