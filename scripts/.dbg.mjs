import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 2000 } });
const logs = []; p.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 200)));
await p.goto('http://localhost:8095/_sitemap'); await p.waitForTimeout(4000);
for (const el of await p.getByText('_layout.tsx').all()) { await el.click().catch(() => {}); await p.waitForTimeout(300); }
console.log((await p.innerText('body')).slice(0, 2000));
console.log(logs.slice(0, 20).join('\n'));
await b.close();
