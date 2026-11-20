import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve('next/package.json'));
// Read existing private env files normally; never copy or print their contents.
nextRequire('@next/env').loadEnvConfig(repoRoot, true);

const env = { ...process.env, NODE_ENV: 'development' };
const placeholders = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'ci-placeholder',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'ci-placeholder.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'propig-63524',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'propig-63524.firebasestorage.app',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000000000',
};
let usesPlaceholders = false;
for (const [name, value] of Object.entries(placeholders)) {
  if (!env[name]) {
    env[name] = value;
    usesPlaceholders = true;
  }
}
env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ||= 'pppp';
env.NEXT_TELEMETRY_DISABLED ||= '1';
env.DISABLE_SENTRY ||= 'true';
env.NEXT_PUBLIC_DISABLE_SENTRY ||= 'true';
if (usesPlaceholders) {
  console.log('Cloud UI preview uses placeholder Firebase settings. Use the GitHub Actions preview for signed-in checks.');
}
const child = spawn(process.execPath, [
  require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3002',
], { cwd: repoRoot, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143); });
