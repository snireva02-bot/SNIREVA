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

// Allocate Kiran's 2-scooter booking (rider's pick pre-ticked + one more)
await p.goto(ADMIN + '/bookings'); await p.getByRole('row', { name: /Kiran Kumar/ }).getByRole('button', { name: 'Allocate' }).click();
const dlg = p.getByRole('dialog');
await dlg.getByText("Rider's pick").first().waitFor();
await dlg.locator('input[type=checkbox]:not(:checked):not(:disabled)').first().check();
await dlg.getByRole('button', { name: 'Allocate 2 scooters' }).click();
await p.getByText(/2 scooters allocated/).waitFor({ timeout: 10000 });
check('allocated 2 scooters to Kiran in one go', true);

// Handle Suresh's battery problem: reply + replacement scooter
await p.goto(ADMIN + '/service'); await p.getByRole('row', { name: /Suresh Babu/ }).click();
await p.getByText('Timeline').waitFor(); await p.getByText(/Technician Anil/).waitFor({ timeout: 10000 });
check('staff see internal note in timeline', await p.getByText(/weak cell/).isVisible());
await p.screenshot({ path: 'scripts/.screens/e2e-admin-service.png' });
await p.getByRole('button', { name: 'Give replacement scooter' }).click();
await p.getByLabel('Replacement').selectOption({ index: 1 });
await p.getByLabel('Reason').fill('Battery cell fault');
await p.getByRole('button', { name: 'Confirm replacement' }).click();
await p.getByText(/Replacement given/).waitFor({ timeout: 10000 });
check('gave Suresh a replacement scooter from the service request', true);

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
