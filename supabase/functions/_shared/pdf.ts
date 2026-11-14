import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';

export const BRAND = rgb(0x23 / 255, 0x91 / 255, 0x5c / 255);
export const INK = rgb(0x14 / 255, 0x1f / 255, 0x1d / 255);
export const INK2 = rgb(0x45 / 255, 0x53 / 255, 0x4e / 255);
export const LINE = rgb(0xdc / 255, 0xe6 / 255, 0xe0 / 255);

/** Standard PDF fonts can't draw ₹, so PDFs use "Rs." with Indian digit grouping. */
export function rs(n: number | string): string {
  const v = Number(n);
  const [int, dec] = Math.abs(v).toFixed(2).split('.');
  const last3 = int.slice(-3), rest = int.slice(0, -3);
  const g = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return `Rs. ${v < 0 ? '-' : ''}${g}${dec === '00' ? '' : '.' + dec}`;
}

export function phone(p?: string | null): string {
  const d = (p ?? '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : (p ?? '');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function istDate(value: string | Date, withTime = false): string {
  const d = new Date(new Date(value).getTime() + 5.5 * 3600 * 1000); // shift to IST, read as UTC
  const s = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (!withTime) return s;
  const h = d.getUTCHours(), m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${s}, ${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'} IST`;
}

/** Keeps only characters the WinAnsi standard fonts can encode. */
export function clean(s: string): string {
  return s.replace(/₹/g, 'Rs.').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > width && line) { out.push(line); line = word; } else line = test;
    }
    out.push(line);
  }
  return out;
}

export interface Doc {
  pdf: PDFDocument; font: PDFFont; bold: PDFFont; page: PDFPage; y: number; margin: number; width: number;
  newPage: () => void; text: (s: string, opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number }) => void;
}

export async function createDoc(company: { name: string; address?: string | null; gstin?: string | null }, logo?: Uint8Array | null): Promise<Doc> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoImg = logo ? await pdf.embedPng(logo).catch(() => null) : null;
  const margin = 50;
  const doc = { pdf, font, bold, margin, width: 595.28 - margin * 2 } as Doc;

  doc.newPage = () => {
    doc.page = pdf.addPage([595.28, 841.89]);
    doc.y = 841.89 - margin;
    if (logoImg) {
      const h = 34, w = (logoImg.width / logoImg.height) * h;
      doc.page.drawRectangle({ x: margin, y: doc.y - h - 6, width: w + 12, height: h + 12, color: rgb(0.02, 0.02, 0.02) });
      doc.page.drawImage(logoImg, { x: margin + 6, y: doc.y - h, width: w, height: h });
    }
    doc.page.drawText(clean(company.name), { x: margin + 180, y: doc.y - 12, size: 11, font: bold, color: INK });
    if (company.address) doc.page.drawText(clean(company.address), { x: margin + 180, y: doc.y - 26, size: 9, font, color: INK2 });
    if (company.gstin) doc.page.drawText(`GSTIN ${clean(company.gstin)}`, { x: margin + 180, y: doc.y - 38, size: 9, font, color: INK2 });
    doc.y -= 60;
    doc.page.drawLine({ start: { x: margin, y: doc.y }, end: { x: 595.28 - margin, y: doc.y }, thickness: 1, color: LINE });
    doc.y -= 24;
  };
  doc.text = (s, opts = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? bold : font;
    for (const line of wrap(s, f, size, doc.width)) {
      if (doc.y < margin + 40) doc.newPage();
      doc.page.drawText(line, { x: margin, y: doc.y, size, font: f, color: opts.color ?? INK });
      doc.y -= size * 1.45;
    }
    doc.y -= opts.gap ?? 0;
  };
  doc.newPage();
  return doc;
}

export function footer(doc: Doc, note: string) {
  const pages = doc.pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(clean(note), { x: doc.margin, y: 28, size: 8, font: doc.font, color: INK2 });
    p.drawText(`Page ${i + 1} of ${pages.length}`, { x: 595.28 - doc.margin - 60, y: 28, size: 8, font: doc.font, color: INK2 });
  });
}
