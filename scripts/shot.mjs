// Screenshot admin pages: node scripts/shot.mjs <role|none> /path1 /path2 ...
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { root } from './env.mjs';

const [role, ...paths] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';
const out = path.join(root, 'scripts', '.screens');
mkdirSync(out, { recursive: true });
const width = Number(process.env.W ?? 1366), height = Number(process.env.H ?? 860);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

if (role && role !== 'none') {
  const acc = JSON.parse(readFileSync(path.join(root, 'scripts', '.test-accounts.json'), 'utf8'))[role];
  await page.goto(base + '/login');
  await page.fill('#email', acc.email);
  await page.fill('#password', acc.password);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
}
for (const raw of paths) {
  const p = '/' + raw.replace(/^\/+/, '').replace(/^root$/, '');
  await page.goto(base + p);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(Number(process.env.WAIT ?? 600));
  const file = path.join(out, `${(process.env.PREFIX ?? '')}${p.replace(/[^a-z0-9]+/gi, '_') || 'root'}.png`);
  await page.screenshot({ path: file, fullPage: process.env.FULL === '1' });
  console.log('shot', file);
}
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
