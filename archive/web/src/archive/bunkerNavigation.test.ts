import {afterEach,describe,expect,it,vi} from 'vitest'
import {bunkerLink} from './OperatorBunkerOsDashboard'
import {stageEvidence,roadmapStage,safeSourceUrl,ROADMAP_CYCLE} from './operatorRoadmapModel'
afterEach(()=>vi.unstubAllGlobals())
describe('bounded operator navigation',()=>{
 it('preserves a validated stage and selected cycle without open redirects',()=>{
  vi.stubGlobal('window',{location:{search:'?cycle=MONTH02_TEST&stage=day-2&page=1&return=https://evil.invalid'}})
  expect(bunkerLink('/operator/#operator-roadmap')).toBe('/operator/?cycle=MONTH02_TEST&stage=day-2&page=1#operator-roadmap')
  expect(bunkerLink('/operator/bunker-os/sources/',{page:null})).not.toContain('page=')
  expect(bunkerLink('/operator/')).not.toContain('evil')
 })
 it('rejects unsafe source schemes and nonexistent stage identifiers',()=>{
  for(const value of ['javascript:alert(1)','data:text/html,x','https://user:secret@example.com'])expect(safeSourceUrl(value)).toBeNull()
  expect(safeSourceUrl('https://example.com/source')).toBe('https://example.com/source')
  for(const value of ['year-6','week-9','day-0','day-1#evil'])expect(roadmapStage(value)).toBeNull()
 })
 it('does not attach other cycle or arbitrary day-index evidence to a milestone',()=>{
  const log={cycle_key:ROADMAP_CYCLE,phase:'WEEK_1_FIND_THE_GAME',day_index:1,status:'COMPLETED',title:'Day 1 · 현재 자산 Audit V1',occurred_at:'2026-10-10'}
  expect(stageEvidence([log,{...log,cycle_key:'MONTH02_TEST'}],'day-1')).toEqual([log])
  expect(stageEvidence([{...log,title:'unrelated'}],'day-1')).toEqual([])
  expect(stageEvidence([log],'year-2')).toEqual([])
 })
})
