import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Explicit operator retirement. No job IDs, prompt text or asset references.
// This hold survives DB deletion and must not advance to another generation.
export const retiredIdentityFingerprint = 'e1959379bb7118aa5ee009e79a2c7159b89d6b6646f001e8c20ae00512f415c6'
export const preparationHold = Object.freeze({
  status: 'ILLUSTRATION_OPERATOR_HOLD',
  reason: 'RETIRED_IDENTITY_NO_SUCCESSOR_AUTHORIZED',
  next_generation_allowed: false,
})

export function isRetiredIllustrationIdentity({ point_id, generation_key }) {
  return createHash('sha256').update(`${point_id}:${generation_key}`).digest('hex') === retiredIdentityFingerprint
}

export function assertIllustrationPreparationAllowed() {
  // Deliberately unconditional: missing/deleted history or catalog changes must
  // not silently clear the hold. Resuming requires a separately reviewed change.
  throw new Error(`${preparationHold.status}:${preparationHold.reason}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.stderr.write(JSON.stringify(preparationHold) + '\n')
  process.exitCode = 1
}
