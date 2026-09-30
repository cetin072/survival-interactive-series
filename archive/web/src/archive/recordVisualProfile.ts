import profiles from '../../../content/public-facts/C03-AFTERFALL/S03/RECORD_VISUAL_PROFILES_20260930.json'

export type RecordVisualProfile = {
  node_id: string
  type: 'character' | 'location' | 'event' | 'reference'
  label: string
  list_description: string
  description: string
  render_cues: string[]
  canon_policy: string
  source_note: string
}

const records = profiles.records as RecordVisualProfile[]
const byNodeId = new Map(records.map((record) => [record.node_id, record]))

export function recordVisualProfileFor(nodeId: string): RecordVisualProfile | undefined {
  return byNodeId.get(nodeId)
}

export function recordVisualProfiles(): RecordVisualProfile[] {
  return records
}
