import { en } from './en';

type Dict = typeof en;
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string];
export type TKey = Leaves<Dict>;

const dict: Dict = en; // swap by locale once hi.ts exists

export function t(key: TKey, params?: Record<string, string | number>): string {
  const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], dict);
  let s = typeof value === 'string' ? value : key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}
