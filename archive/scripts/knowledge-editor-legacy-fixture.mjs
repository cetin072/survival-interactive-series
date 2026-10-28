// SQL fixture generator: public Git bytes only; never connects to any DB.
import {execFileSync} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {collectLegacySource,legacyBriefIds} from './lib/knowledge-legacy-source.mjs'
const base=resolve(import.meta.dirname,'../..')
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:base,encoding:'utf8'}).trim()
const quote=s=>"'"+s.replaceAll("'","''")+"'"
console.log('BEGIN; CREATE TEMP TABLE legacy_test_sources(source jsonb);')
for(const id of legacyBriefIds)console.log('INSERT INTO legacy_test_sources VALUES ('+quote(JSON.stringify(collectLegacySource(base,commit,id)))+'::jsonb);')
console.log(await readFile(resolve(base,'supabase/tests/knowledge_editor_legacy.sql'),'utf8'))
