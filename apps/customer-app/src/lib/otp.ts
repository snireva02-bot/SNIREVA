import AsyncStorage from '@react-native-async-storage/async-storage';

/** Client-side throttle on top of Supabase Auth's server rate limits. */
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
export const RESEND_SECONDS = 30;
const key = (phone: string) => `otp-guard:${phone}`;

type Guard = { fails: number; lockedUntil: number };
async function read(phone: string): Promise<Guard> {
  try { return JSON.parse((await AsyncStorage.getItem(key(phone))) ?? '') as Guard; } catch { return { fails: 0, lockedUntil: 0 }; }
}
export async function lockedFor(phone: string): Promise<number> {
  const g = await read(phone);
  return Math.max(0, g.lockedUntil - Date.now());
}
export async function recordFail(phone: string): Promise<number> {
  const g = await read(phone);
  const fails = g.fails + 1;
  const next = fails >= MAX_FAILS ? { fails: 0, lockedUntil: Date.now() + LOCK_MS } : { fails, lockedUntil: 0 };
  await AsyncStorage.setItem(key(phone), JSON.stringify(next));
  return next.lockedUntil ? LOCK_MS : 0;
}
export async function clearGuard(phone: string) {
  await AsyncStorage.removeItem(key(phone));
}
