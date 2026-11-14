// Builds agreement and receipt PDFs and stores them in private buckets.
// Called by the database after signing / payment (internal secret) or by staff (regenerate).
import { HttpError, isInternal, json, serve } from '../_shared/http.ts';
import { adminClient, caller, isStaffRole } from '../_shared/supabase.ts';
import { createDoc, footer, INK2, istDate, phone, rs, BRAND } from '../_shared/pdf.ts';

type DB = ReturnType<typeof adminClient>;

async function logo(db: DB): Promise<Uint8Array | null> {
  const { data } = await db.storage.from('scooters').download('_brand/logo-wide.png');
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

async function agreementPdf(db: DB, id: string) {
  const { data: a } = await db.from('agreements')
    .select('*, rental:rentals(id, user_id, start_date, weekly_rent, deposit_amount, scooter:scooters(code, model), customer:profiles!rentals_user_id_fkey(full_name, phone))')
    .eq('id', id).single();
  if (!a) throw new HttpError(404, 'Agreement not found');
  const { data: st } = await db.from('settings').select('*').eq('id', 1).single();
  const doc = await createDoc({ name: st.company_name, address: st.company_address, gstin: st.company_gstin }, await logo(db));

  doc.text('Scooter Rental Agreement', { size: 16, bold: true, gap: 4 });
  doc.text(`Agreement for ${a.rental.scooter.code} (${a.rental.scooter.model}) - template version ${a.version}`, { color: INK2, gap: 12 });
  doc.text((a.terms_snapshot as { body: string }).body.replace(/^\s*SCOOTER RENTAL AGREEMENT\s*\n+/i, ''), { size: 10, gap: 16 });

  if (doc.y < 200) doc.newPage();
  doc.text('Signed by the Rider', { bold: true, gap: 6 });
  if (a.signature_path) {
    const { data: sig } = await db.storage.from('agreements').download(a.signature_path);
    if (sig) {
      const img = await doc.pdf.embedPng(new Uint8Array(await sig.arrayBuffer())).catch(() => null);
      if (img) {
        const w = Math.min(200, img.width), h = (img.height / img.width) * w;
        doc.page.drawImage(img, { x: doc.margin, y: doc.y - h, width: w, height: h });
        doc.y -= h + 8;
      }
    }
  }
  doc.text(`${a.rental.customer.full_name ?? ''}  ·  ${phone(a.rental.customer.phone)}`);
  doc.text(`Signed electronically on ${istDate(a.signed_at, true)}`, { color: INK2 });
  doc.text(`Terms SHA-256: ${a.terms_hash}`, { size: 8, color: INK2 });
  footer(doc, `${st.company_name} - rental agreement ${a.rental.scooter.code}`);

  const path = `${a.rental.user_id}/agreement-${a.rental.id}.pdf`;
  const bytes = await doc.pdf.save();
  const { error } = await db.storage.from('agreements').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  await db.from('agreements').update({ pdf_path: path }).eq('id', id);
  return path;
}

async function receiptPdf(db: DB, id: string) {
  const { data: p } = await db.from('payments')
    .select('*, customer:profiles!payments_user_id_fkey(full_name, phone), rental:rentals(scooter:scooters(code, model)), by:profiles!payments_recorded_by_fkey(full_name)')
    .eq('id', id).single();
  if (!p) throw new HttpError(404, 'Payment not found');
  if (p.status !== 'paid') throw new HttpError(400, 'Only paid payments have receipts');
  const { data: st } = await db.from('settings').select('*').eq('id', 1).single();
  const doc = await createDoc({ name: st.company_name, address: st.company_address, gstin: st.company_gstin }, await logo(db));

  const methods: Record<string, string> = { upi_gateway: 'UPI (online)', cash: 'Cash', offline_upi: 'UPI (offline)', bank: 'Bank transfer' };
  const types: Record<string, string> = { rent: 'Weekly rent', deposit: 'Security deposit', late_fee: 'Late fee', other: 'Other' };
  doc.text('Payment Receipt', { size: 16, bold: true, gap: 2 });
  doc.text(`Receipt no. ${p.receipt_no}`, { color: INK2, gap: 16 });

  const rows: [string, string][] = [
    ['Received from', `${p.customer.full_name ?? ''} (${phone(p.customer.phone)})`],
    ['Date', istDate(p.paid_at, true)],
    ['For', types[p.type] + (p.rental?.scooter ? ` - ${p.rental.scooter.code} ${p.rental.scooter.model}` : '')],
    ...(p.period_start ? [['Rental period', `${istDate(p.period_start)} to ${istDate(p.period_end)}`] as [string, string]] : []),
    ['Method', methods[p.method] + (p.razorpay_payment_id ? ` (${p.razorpay_payment_id})` : '')],
    ...(p.by?.full_name ? [['Recorded by', p.by.full_name] as [string, string]] : []),
    ...(Number(p.late_fee_amount) > 0 ? [['Includes late fee', rs(p.late_fee_amount)] as [string, string]] : []),
  ];
  for (const [k, v] of rows) {
    doc.page.drawText(k, { x: doc.margin, y: doc.y, size: 10, font: doc.font, color: INK2 });
    doc.page.drawText(v, { x: doc.margin + 140, y: doc.y, size: 10, font: doc.font });
    doc.y -= 20;
  }
  doc.y -= 8;
  doc.page.drawRectangle({ x: doc.margin, y: doc.y - 36, width: doc.width, height: 44, borderColor: BRAND, borderWidth: 1 });
  doc.page.drawText('Amount received', { x: doc.margin + 14, y: doc.y - 18, size: 11, font: doc.font, color: INK2 });
  doc.page.drawText(rs(p.amount), { x: doc.margin + doc.width - 14 - doc.bold.widthOfTextAtSize(rs(p.amount), 16), y: doc.y - 20, size: 16, font: doc.bold });
  doc.y -= 64;
  doc.text('This is a computer-generated receipt and does not need a signature.', { size: 9, color: INK2 });
  footer(doc, `${st.company_name} - receipt ${p.receipt_no}`);

  const path = `${p.user_id}/${p.receipt_no}.pdf`;
  const { error } = await db.storage.from('receipts').upload(path, await doc.pdf.save(), { contentType: 'application/pdf', upsert: true });
  if (error) throw error;
  await db.from('payments').update({ receipt_path: path }).eq('id', id);
  return path;
}

serve(async (req) => {
  if (!isInternal(req)) {
    const { profile } = await caller(req);
    if (!isStaffRole(profile.role)) throw new HttpError(403, 'Staff only');
  }
  const { kind, id } = await req.json();
  const db = adminClient();
  if (kind === 'agreement') return json({ path: await agreementPdf(db, id) });
  if (kind === 'receipt') return json({ path: await receiptPdf(db, id) });
  throw new HttpError(400, 'kind must be agreement or receipt');
});
