// Preplay-only, zero-dependency gate. It NEVER opens game sessions or writes to DB.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validatePreplay(doc) {
  const errors = [];
  const insist = (ok, reason) => { if (!ok) errors.push(reason); };
  if (!isObject(doc)) return ['manifest must be a JSON object'];
  insist(doc.schema_version === 1, 'schema_version must be 1');
  insist(doc.status === 'PLANNING_ONLY', 'gameplay must remain PLANNING_ONLY');
  insist(doc.reference === 'FOURTH_WORLDLINE_DRAFT', 'unknown draft identity');
  insist(doc.planning_document === 'docs/FOURTH_WORLDLINE_PLANNING_V1.md', 'planning document reference mismatch');

  insist(isObject(doc.identity), 'identity must exist');
  for (const id of ['worldline_id', 'chronicle_id', 'season_id']) {
    insist(doc.identity?.[id] === null, 'official ' + id + ' cannot be assigned in preplay');
  }

  insist(isObject(doc.protagonist), 'protagonist must exist');
  insist(doc.protagonist?.occupation === '일반 배송기사', 'occupation must be ordinary delivery driver');
  insist(doc.protagonist?.sex === 'male' && doc.protagonist?.adult === true, 'protagonist must be an adult male');
  insist(doc.protagonist?.marital_status === 'single' && doc.protagonist?.children_count === 0 && doc.protagonist?.current_partner === false, 'protagonist relationship baseline mismatch');
  insist(doc.protagonist?.name === null || (typeof doc.protagonist?.name === 'string' && doc.protagonist.name.trim().length > 0), 'name must be null or a nonempty string');
  insist(doc.protagonist?.age === null || (Number.isInteger(doc.protagonist?.age) && doc.protagonist.age >= 18 && doc.protagonist.age <= 100), 'age must be null or an adult integer');

  insist(isObject(doc.opening), 'opening must exist');
  insist(doc.opening?.country === 'KR' && doc.opening?.city === '창원', 'opening must be Changwon, Korea');
  insist(doc.opening?.district === '성산구', 'opening district must be Seongsan-gu');
  insist(doc.opening?.delivery_type === '일반배송', 'delivery type mismatch');
  for (const field of ['district', 'workplace', 'employer', 'vehicle', 'home_access']) {
    const chosen = doc.opening?.[field];
    insist(chosen === null || (typeof chosen === 'string' && chosen.trim().length > 0), field + ' must be null or a nonempty string');
  }

  insist(isObject(doc.disaster), 'disaster must exist');
  insist(doc.disaster?.kind === 'ASTEROID_IMPACT' && doc.disaster?.status === 'TENTATIVE', 'impact is a tentative scenario, not verified canon');
  insist(doc.disaster?.region === '몽골 남부 고비사막' && doc.disaster?.diameter_km_approx === 2, 'tentative impact candidate mismatch');
  insist(doc.disaster?.warning_mode === 'SCIENTISTS_FIRST_PUBLIC_LATE', 'chosen warning policy mismatch');

  insist(isObject(doc.runtime), 'runtime must exist');
  for (const gate of ['play_enabled', 'db_initialized', 'raw_capture_ready', 'canon_initialized', 'production_publication_enabled']) {
    insist(doc.runtime?.[gate] === false, 'unsafe preplay runtime gate: ' + gate);
  }

  insist(isObject(doc.reuse_guards), 'reuse_guards must exist');
  insist(doc.reuse_guards?.pattern_source_branch === 'worldline/afterfall-rpg', 'reuse source does not match audited AFTERFALL branch');
  for (const gate of ['independent_runtime_required', 'no_afterfall_state_fallback', 'state_link_write_blocked_pending_compatibility']) {
    insist(doc.reuse_guards?.[gate] === true, 'missing safety guard: ' + gate);
  }
  return errors;
}

const ownPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === ownPath) {
  const root = resolve(dirname(ownPath), '../..');
  const file = process.argv[2] ? resolve(process.argv[2]) : resolve(root, 'worldlines/FOURTH_DRAFT/PREPLAY.json');
  let source;
  try { source = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { console.error('PREPLAY BLOCKED: cannot read ' + file + ': ' + error.message); process.exit(1); }
  const errors = validatePreplay(source);
  if (errors.length) {
    errors.forEach((error) => console.error('PREPLAY BLOCKED: ' + error));
    process.exit(1);
  }
  console.log('PREPLAY PASS: decisions registered; game, DB, and publication remain disabled.');
}
