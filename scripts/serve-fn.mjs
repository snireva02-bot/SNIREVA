// Run an Edge Function locally on Deno against the real project: node scripts/serve-fn.mjs <name> [port]
import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadEnv, root } from './env.mjs';
const env = loadEnv();
const [name] = process.argv.slice(2); // Deno.serve listens on :8000
const child = spawn('npx', ['-y', 'deno@2', 'run', '--allow-net', '--allow-env', path.join('supabase', 'functions', name, 'index.ts')], {
  cwd: root, shell: true, stdio: 'inherit',
  env: { ...process.env, RAZORPAY_WEBHOOK_SECRET: env.RAZORPAY_WEBHOOK_SECRET ?? 'local_test_webhook_secret', INTERNAL_SECRET: env.INTERNAL_SECRET,
         SUPABASE_URL: env.SUPABASE_URL, SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY },
});
child.on('exit', (c) => process.exit(c ?? 0));
