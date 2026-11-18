// End-to-end demo flows on the Expo web build (http://localhost:8095) + admin (http://localhost:5173).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const APP = 'http://localhost:8095', ADMIN = 'http://localhost:5173', out = 'scripts/.screens';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let pass = 0, fail = 0;
const check = (n, ok) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}`); };

async function rider(name) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => console.log('   page error:', e.message));
  await p.goto(APP); await p.getByText('Try the demo').click();
  await p.getByText(name, { exact: true }).click();
  await p.getByText(/^Good (morning|afternoon|evening)/).waitFor({ timeout: 20000 });
  return p;
}
const shot = (p, n) => p.screenshot({ path: `${out}/e2e-${n}.png` });

console.log('Rider app (demo mode)');
{ // Ravi pays rent
  const p = await rider('Ravi Teja');
  await p.getByText('₹1,820').first().waitFor({ timeout: 20000 });
  check('Ravi sees rent due card', await p.getByText('₹1,820').first().isVisible());
  await shot(p, 'ravi-home');
  await p.getByRole('button', { name: /^Pay ₹1,820/ }).first().click();
  await p.getByText('Amount due').waitFor();
  await p.getByRole('button', { name: /^Pay ₹1,820/ }).click();
  await p.getByText('Payment received').waitFor({ timeout: 30000 });
  check('demo payment confirmed via webhook path', true);
  await p.waitForTimeout(800); await shot(p, 'ravi-paid');
  await p.getByRole('button', { name: 'View receipt' }).click();
  await p.waitForTimeout(1500); await shot(p, 'ravi-payments');
  await p.close();
}
{ // Suresh overdue
  const p = await rider('Suresh Babu');
  await p.getByText('₹1,970').first().waitFor({ timeout: 20000 });
  check('Suresh sees overdue amount with late fee', await p.getByText('₹1,970').first().isVisible() && await p.getByText(/late fee/).first().isVisible());
  await shot(p, 'suresh-home'); await p.close();
}
{ // Imran requests 2 scooters (bulk)
  const p = await rider('Mohammed Imran');
  await p.getByRole('button', { name: 'Browse scooters' }).click();
  await p.getByText('How many scooters?').waitFor({ timeout: 20000 });
  await p.getByLabel('More scooters').click();
  await p.getByLabel(/Pickup location/).click();
  await p.getByText('Madhapur hub').last().click();
  await shot(p, 'imran-scooters');
  await p.getByRole('button', { name: 'Request 2 scooters' }).click();
  await p.locator('text=Request for 2 scooters sent >> visible=true').first().waitFor({ timeout: 15000 });
  check('Imran requested 2 scooters', true);
  await shot(p, 'imran-requested'); await p.close();
}
{ // Venkat: fleet of 3, one payment
  const p = await rider('Venkat Fleet Services');
  await p.getByText(/For 3 scooters/).first().waitFor({ timeout: 20000 });
  check('Venkat sees combined rent for 3 scooters', true);
  await shot(p, 'venkat-home');
  await p.getByText('Rental', { exact: true }).last().click();
  await p.getByText('Your fleet').waitFor();
  check('My scooters lists 3 scooters', (await p.locator('text=/^SNR-0(01|02|11)$/').count()) >= 3);
  await shot(p, 'venkat-fleet');
  await p.getByRole('button', { name: /^Pay all/ }).click();
  await p.getByText(/3 scooters/).first().waitFor();
  await shot(p, 'venkat-pay');
  await p.getByRole('button', { name: /^Pay ₹/ }).click();
  await p.getByText('Payment received').waitFor({ timeout: 30000 });
  check('one payment renewed all 3 scooters', await p.getByText('3 scooters renewed.').isVisible());
  await p.waitForTimeout(800); await shot(p, 'venkat-paid'); await p.close();
}
{ // Suresh: battery problem being handled
  const p = await rider('Suresh Babu');
  await p.goto(APP + '/service'); await p.locator('text=Battery >> visible=true').first().click();
  await p.getByText('Updates').waitFor({ timeout: 20000 });
  check('Suresh sees staff update in timeline', await p.getByText(/Technician Anil/).isVisible());
  check('internal note hidden from Suresh', !(await p.getByText(/weak cell/).count()));
  await shot(p, 'suresh-service'); await p.close();
}
{ // Lakshmi sees agreement
  const p = await rider('Lakshmi Devi');
  await p.getByText('Sign your agreement').waitFor({ timeout: 20000 });
  check('Lakshmi is asked to sign', true);
  await p.getByRole('button', { name: 'Read and sign' }).click();
  await p.getByText(/SCOOTER RENTAL AGREEMENT/).waitFor({ timeout: 15000 });
  check('agreement text rendered for Lakshmi', await p.getByText(/Lakshmi Devi/).first().isVisible());
  await shot(p, 'lakshmi-agreement'); await p.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
