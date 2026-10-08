/** Unscheduled, explicitly approved first S04 range; uses the existing publisher. */
import { discoveryApply } from './run-daily-archive.mjs'

console.log(JSON.stringify(await discoveryApply({ expectedRange: {
  source_session_uuid: '029cd316-6ac6-4f82-815a-09c4b7372eb3',
  start_order: 0,
  end_order: 9,
  pairs: 5,
  authorization_sha256: '706756ada0b7eac99df13a07c240a22c1fcdcd04562a26f530851de87b10eaf8',
} })))
