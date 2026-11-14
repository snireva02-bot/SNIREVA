import { chromium } from 'playwright';
import { readFileSync, statSync } from 'node:fs';
const acc = JSON.parse(readFileSync('scripts/.test-accounts.json', 'utf8')).manager;
const b = await chromium.launch(); const p = await b.newPage({ acceptDownloads: true });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/login'); await p.fill('#email', acc.email); await p.fill('#password', acc.password); await p.click('button[type=submit]');
await p.waitForURL((u) => !u.pathname.startsWith('/login')); await p.goto('http://localhost:5173/reports'); await p.waitForLoadState('networkidle');
for (const tab of ['Collections', 'Scooter utilisation']) {
  await p.getByRole('tab', { name: tab }).click(); await p.waitForTimeout(1500);
  for (const btn of ['Excel', 'PDF']) {
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: btn }).click()]);
    const f = `scripts/.screens/${dl.suggestedFilename()}`; await dl.saveAs(f); console.log(tab, btn, dl.suggestedFilename(), statSync(f).size, 'bytes');
  }
}
console.log(errs.length ? errs : 'no page errors'); await b.close();
