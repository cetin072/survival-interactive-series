export const VERBS = [
  'move',
  'call',
  'request',
  'pickup',
  'transfer',
  'inspect',
  'secure',
  'wait',
  'cancel',
]

const ACTION_KEYS = ['verb', 'actor', 'target', 'to', 'vehicle', 'items']
const RESPONSE_KEYS = ['actions', 'ambiguous', 'confidence', 'ambiguityReason']

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function optionalEnum(values) {
  return { type: 'string', enum: values }
}

/**
 * Builds a case-specific strict JSON Schema so IDs from another scenario cannot
 * be emitted as valid output. The schema is sent unchanged to OpenRouter.
 */
export function buildActionSchema(benchmarkCase) {
  const allowed = benchmarkCase.allowed
  const properties = {
    verb: { type: 'string', enum: VERBS },
    actor: { type: 'string', enum: allowed.actors },
  }

  if (allowed.targets.length) properties.target = optionalEnum(allowed.targets)
  if (allowed.locations.length) properties.to = optionalEnum(allowed.locations)
  if (allowed.vehicles.length) properties.vehicle = optionalEnum(allowed.vehicles)
  if (allowed.items.length) {
    properties.items = {
      type: 'array',
      minItems: 1,
      items: optionalEnum(allowed.items),
    }
  }

  return {
    name: 'survival_game_ordered_actions',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['actions', 'ambiguous', 'confidence'],
      properties: {
        actions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['verb', 'actor'],
            properties,
          },
        },
        ambiguous: { type: 'boolean' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        ambiguityReason: { type: 'string', minLength: 1, maxLength: 240 },
      },
    },
  }
}

/** Local verification mirrors the strict request schema and rejects unknown IDs. */
export function validateActionResponse(value, benchmarkCase) {
  const errors = []
  if (!isObject(value)) return { valid: false, errors: ['response must be an object'] }
  if (!hasOnlyKeys(value, RESPONSE_KEYS)) errors.push('response contains an unknown field')
  if (!Array.isArray(value.actions)) errors.push('actions must be an array')
  if (typeof value.ambiguous !== 'boolean') errors.push('ambiguous must be a boolean')
  if (typeof value.confidence !== 'number' || value.confidence < 0 || value.confidence > 1) errors.push('confidence must be between 0 and 1')
  if (value.ambiguous && (typeof value.ambiguityReason !== 'string' || !value.ambiguityReason.trim())) errors.push('ambiguous responses need ambiguityReason')
  if (!value.ambiguous && value.ambiguityReason !== undefined) errors.push('ambiguityReason is only allowed when ambiguous is true')
  if (!Array.isArray(value.actions)) return { valid: false, errors }

  const allowed = benchmarkCase.allowed
  for (const [index, action] of value.actions.entries()) {
    const prefix = `actions[${index}]`
    if (!isObject(action)) { errors.push(`${prefix} must be an object`); continue }
    if (!hasOnlyKeys(action, ACTION_KEYS)) errors.push(`${prefix} contains an unknown field`)
    if (!VERBS.includes(action.verb)) errors.push(`${prefix}.verb is invalid`)
    if (!allowed.actors.includes(action.actor)) errors.push(`${prefix}.actor is not allowed`)
    if (action.target !== undefined && !allowed.targets.includes(action.target)) errors.push(`${prefix}.target is not allowed`)
    if (action.to !== undefined && !allowed.locations.includes(action.to)) errors.push(`${prefix}.to is not allowed`)
    if (action.vehicle !== undefined && !allowed.vehicles.includes(action.vehicle)) errors.push(`${prefix}.vehicle is not allowed`)
    if (action.items !== undefined) {
      if (!Array.isArray(action.items) || action.items.length === 0 || action.items.some((item) => !allowed.items.includes(item))) errors.push(`${prefix}.items is invalid`)
    }
  }
  return { valid: errors.length === 0, errors }
}

export function normalizedAction(action = {}) {
  return {
    verb: action.verb ?? null,
    actor: action.actor ?? null,
    target: action.target ?? null,
    to: action.to ?? null,
    vehicle: action.vehicle ?? null,
    items: action.items ?? [],
  }
}
