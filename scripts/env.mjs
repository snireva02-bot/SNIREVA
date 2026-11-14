// Minimal .env loader (ignores non KEY=VALUE lines).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv(file = path.join(root, '.env')) {
  if (!existsSync(file)) return process.env;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
  return process.env;
}

export function dbUrl() {
  const env = loadEnv();
  const url = env.SUPABASE_DB_URL || env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error('Set SUPABASE_DB_URL (or POSTGRES_URL_NON_POOLING) in .env');
  return url;
}
