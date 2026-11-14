// Usage: node scripts/db.mjs push | types
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { dbUrl, root } from './env.mjs';

const cmd = process.argv[2];
const url = dbUrl();
const run = (args, opts = {}) => {
  const r = spawnSync('supabase', args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(r.status ?? 1); }
  return r.stdout;
};
const q = (s) => (process.platform === 'win32' ? `"${s}"` : s);

if (cmd === 'push') {
  process.stdout.write(run(['db', 'push', '--db-url', q(url), '--include-seed', '--yes'], { input: 'y\n' }));
} else if (cmd === 'types') {
  const out = run(['gen', 'types', 'typescript', '--db-url', q(url), '--schema', 'public']);
  const dest = path.join(root, 'packages/shared/src/database.types.ts');
  writeFileSync(dest, out);
  console.log('wrote', dest);
} else {
  console.log('usage: node scripts/db.mjs push|types');
}
