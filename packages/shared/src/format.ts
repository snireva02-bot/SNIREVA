/** Indian digit grouping without relying on Intl (Hermes-safe). 182000 -> "1,82,000" */
export function groupIN(n: number): string {
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  const out = dec === '00' ? grouped : `${grouped}.${dec}`;
  return neg ? `-${out}` : out;
}

/** ₹1,820 */
export function formatINR(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  return `₹${groupIN(Number.isFinite(n) ? n : 0)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parses 'YYYY-MM-DD' as a local calendar date (no timezone shift). */
export function parseDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

/** "21 Nov" or "21 Nov 2026" */
export function formatDate(value: string | Date | null | undefined, withYear = false): string {
  if (!value) return '—';
  const d = parseDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  const s = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withYear ? `${s} ${d.getFullYear()}` : s;
}

/** "21 Nov 2026, 4:05 pm" */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = parseDate(value);
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(d, true)}, ${h % 12 || 12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole days from today to the given date (negative = past). */
export function daysUntil(value: string | Date): number {
  const d = parseDate(value);
  const t = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((a - b) / 86400000);
}

/** +91 98765 43210 */
export function formatPhone(p: string | null | undefined): string {
  if (!p) return '—';
  const digits = p.replace(/\D/g, '');
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  if (local.length !== 10) return p;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}
