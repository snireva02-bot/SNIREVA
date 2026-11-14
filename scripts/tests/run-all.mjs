// Runs the full backend suite in order (each milestone builds on the previous state).
import { spawnSync } from 'node:child_process';
const files = ['m1-rls', 'm2-kyc', 'm3-booking', 'm4-agreement', 'm5-payments', 'm6-m8', 'm9-rls-sweep'];
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [`scripts/tests/${f}.mjs`], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
  console.log('');
}
console.log(failed ? `${failed} suite(s) failed` : 'ALL SUITES PASSED');
process.exit(failed ? 1 : 0);
