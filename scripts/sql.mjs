// Run SQL against the project DB: node scripts/sql.mjs "select 1" | node scripts/sql.mjs -f file.sql
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dbUrl } from './env.mjs';

const args = process.argv.slice(2);
const sql = args[0] === '-f' ? readFileSync(args[1], 'utf8') : args.join(' ');
const client = new pg.Client({ connectionString: dbUrl().replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const res = await client.query(sql);
  for (const r of [].concat(res)) if (r.rows?.length) console.table(r.rows);
} catch (e) {
  console.error('ERROR:', e.message); process.exitCode = 1;
} finally { await client.end(); }
