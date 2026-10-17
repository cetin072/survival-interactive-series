import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePreplay } from './check-fourth-worldline-preplay.mjs';

const source = JSON.parse(readFileSync(new URL('../../worldlines/FOURTH_DRAFT/PREPLAY.json', import.meta.url), 'utf8'));

test('planning manifest passes', () => {
  assert.deepEqual(validatePreplay(source), []);
});

test('prevents accidental live play and legacy identity reuse', () => {
  const changed = structuredClone(source);
  changed.identity.worldline_id = 'AFTERFALL';
  changed.runtime.play_enabled = true;
  assert.ok(validatePreplay(changed).some((issue) => issue.includes('worldline_id')));
  assert.ok(validatePreplay(changed).some((issue) => issue.includes('play_enabled')));
});

test('future character choices can be added without enabling live state', () => {
  const changed = structuredClone(source);
  changed.protagonist.age = 35;
  changed.opening.vehicle = '소형 택배 차량';
  assert.deepEqual(validatePreplay(changed), []);
});

test('malformed details are rejected', () => {
  const changed = structuredClone(source);
  changed.protagonist.age = 7;
  assert.ok(validatePreplay(changed).some((issue) => issue.includes('age must')));
});
