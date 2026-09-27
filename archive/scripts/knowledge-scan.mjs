import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { root } from './lib/knowledge-content.mjs'
import { publicKnowledgeInventory, scanKnowledge, bootstrapKnowledge } from './lib/knowledge-scan.mjs'

const args = new Set(process.argv.slice(2))
const allowed = new Set(['--check', '--json', '--bootstrap', '--apply'])
if ([...args].some((arg) => !allowed.has(arg)) || (args.has('--apply') && !args.has('--bootstrap')) || (args.has('--bootstrap') && !args.has('--apply'))) {
  throw new Error('Usage: knowledge-scan.mjs [--check] [--json] | --bootstrap --apply [--json]')
}
const state = JSON.parse(await readFile(join(root, 'knowledge/automation/state.json'), 'utf8'))
const inventory = await publicKnowledgeInventory(root)
if (args.has('--bootstrap')) {
  const count = await bootstrapKnowledge(root, inventory, state, new Date().toISOString())
  console.log(JSON.stringify({ status: 'BASELINE_PRE_V1', added: count }))
} else {
  const result = scanKnowledge(inventory, state)
  console.log(JSON.stringify(result, null, args.has('--json') ? 2 : 0))
}
