// Screenshot the Expo web build at phone size.
// node scripts/shot-app.mjs <account|none> path1 path2 ...   (paths without leading slash; "root" = /)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './env.mjs';

const [who, ...paths] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:8095';
const out = path.join(root, 'scripts', '.screens');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
await page.goto(base + '/');
await page.waitForTimeout(4000);
if (who && who !== 'none') {
  const acc = JSON.parse(readFileSync(path.join(root, 'scripts', '.test-accounts.json'), 'utf8'))[who];
  await page.getByText('Developer sign-in (test accounts)').click();
  await page.waitForTimeout(800);
  await page.getByLabel('Email').fill(acc.email);
  await page.getByLabel('Password').fill(acc.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(4000);
}
for (const raw of paths) {
  const p = '/' + raw.replace(/^\/+/, '').replace(/^root$/, '');
  await page.goto(base + p);
  await page.waitForTimeout(Number(process.env.WAIT ?? 3000));
  const file = path.join(out, `app${p.replace(/[^a-z0-9]+/gi, '_')}.png`);
  await page.screenshot({ path: file, fullPage: process.env.FULL === '1' });
  console.log('shot', file);
}
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].slice(0, 15).join('\n'));
await browser.close();
