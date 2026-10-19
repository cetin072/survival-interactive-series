// Compatibility entry point. The retired PAT/main-commit publisher cannot run.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '../..');
export async function runProductionRelease(args = []) {
  if (args.includes('--force') || args.includes('--apply')) throw new Error('FORCE_RELEASE_DISABLED');
  const output = execFileSync(process.execPath, [
    'archive/scripts/scheduled-netlify-release.mjs', 'check', 'archive/automation/release-policy.json'
  ], { cwd: root, encoding: 'utf8', env: process.env });
  return JSON.parse(output);
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(await runProductionRelease(process.argv.slice(2)), null, 2)); }
  catch { console.error('SCHEDULED_RELEASE_CHECK_FAILED'); process.exitCode = 1; }
}
