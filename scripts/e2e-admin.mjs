// Staff flows on the admin dashboard against demo data.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const acc = JSON.parse(readFileSync('scripts/.test-accounts.json', 'utf8')).staff;
const ADMIN = 'http://localhost:5173';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 860 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
let pass = 0, fail = 0; const check = (n, ok) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); };
console.log('Admin dashboard (staff)');
await p.goto(ADMIN + '/login'); await p.fill('#email', acc.email); await p.fill('#password', acc.password); await p.click('button[type=submit]');
await p.waitForURL((u) => !u.pathname.startsWith('/login'));

// KYC review
await p.goto(ADMIN + '/customers?kyc=pending'); await p.getByText('Arjun Reddy').click();
await p.getByRole('button', { name: 'Review all' }).click();
for (let i = 0; i < 3; i++) { await p.getByRole('button', { name: 'Approve', exact: true }).click(); await p.waitForTimeout(1200); }
await p.keyboard.press('Escape');
await p.getByRole('button', { name: 'Approve KYC' }).click();
await p.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
await p.getByText('Customer approved').waitFor({ timeout: 10000 });
check('approved Arjun KYC through the document viewer', true);
await p.screenshot({ path: 'scripts/.screens/e2e-admin-kyc.png' });

// Allocate Kiran's booking
await p.goto(ADMIN + '/bookings'); await p.getByRole('row', { name: /Kiran Kumar/ }).getByRole('button', { name: 'Allocate' }).click();
await p.getByRole('dialog').getByRole('button', { name: 'Allocate scooter' }).click();
await p.getByText('Scooter allocated').waitFor({ timeout: 10000 });
check('allocated a scooter to Kiran', true);

// Record offline payment for Suresh (overdue)
await p.goto(ADMIN + '/rentals?view=overdue'); await p.getByText('Suresh Babu').click();
await p.getByRole('button', { name: 'Record payment' }).click();
await p.getByRole('dialog').getByRole('button', { name: /^Record/ }).click();
await p.getByText(/recorded\. Receipt/).waitFor({ timeout: 10000 });
check('recorded Suresh offline payment', true);
await p.waitForTimeout(1500); await p.screenshot({ path: 'scripts/.screens/e2e-admin-rental.png' });
await p.goto(ADMIN + '/'); await p.waitForTimeout(2000); await p.screenshot({ path: 'scripts/.screens/e2e-admin-overview.png' });
console.log(errs.length ? errs : '  no page errors');
console.log(`\n${pass} passed, ${fail} failed`); await b.close();
