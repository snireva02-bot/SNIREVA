// Runs the full backend suite in order (each milestone builds on the previous state).
import { spawnSync } from 'node:child_process';
const files = ['m1-rls', 'm2-kyc', 'm3-booking', 'm4-agreement', 'm5-payments', 'm6-m8', 'm9-rls-sweep', 'm10-fleet-service'];
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [`scripts/tests/${f}.mjs`], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
  console.log('');
}
// Clean up what the suites leave behind on the shared project (test riders only; demo riders untouched).
const { admin, accounts } = await import('./helpers.mjs');
const testIds = [accounts.customer1.id, accounts.customer2.id];
await admin.from('service_requests').delete().in('user_id', testIds);
await admin.from('notifications').delete().in('user_id', testIds);
console.log(failed ? `${failed} suite(s) failed` : 'ALL SUITES PASSED');
process.exit(failed ? 1 : 0);
