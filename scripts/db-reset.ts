/**
 * `npm run db:reset` — rebuild a *local* development database from migrations plus the
 * demo seed. It never deletes anything: the existing file is moved aside to
 * `.data/backups/` first, because order history and customer rows are not reproducible.
 *
 *   npm run db:reset            # refuses unless you confirm what you are about to do
 *   npm run db:reset -- --yes   # actually swaps the file (local dev only)
 *
 * Production and any externally-managed path are refused outright.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const confirm = process.argv.includes('--yes');
const isProd = process.env.NODE_ENV === 'production';

const target = (() => {
  const configured = process.env.KBRANDS_DB_PATH;
  if (configured) return path.resolve(ROOT, configured);
  return path.join(ROOT, '.data', 'kbrands.sqlite3');
})();

if (isProd) {
  console.error('[db:reset] Refusing to run with NODE_ENV=production. Reset a staging database instead.');
  process.exit(1);
}
if (!target.includes(`${path.sep}.data`) && !target.includes(path.sep + 'tmp') && !target.includes('test')) {
  console.error(`[db:reset] Refusing: "${target}" is not inside ./.data — pass KBRANDS_DB_PATH to a scratch directory if you know what you are doing.`);
  process.exit(1);
}
if (!fs.existsSync(target)) {
  console.log(`[db:reset] no database at ${target}; nothing to reset. Run npm run db:bootstrap.`);
  process.exit(0);
}
if (!confirm) {
  console.error(
    `[db:reset] This would move ${path.relative(ROOT, target)} (plus its -wal/-shm siblings) into\n` +
      `           .data/backups/ and rebuild it from migrations + the demo seed.\n` +
      `           Local orders, customers and audit history in that file will no longer be the\n` +
      `           active database — the backup keeps them recoverable.\n\n` +
      `           Re-run with:  npm run db:reset -- --yes\n`,
  );
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(path.dirname(target), 'backups');
fs.mkdirSync(backupDir, { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  const from = target + suffix;
  if (!fs.existsSync(from)) continue;
  const to = path.join(backupDir, `${path.basename(target)}.${stamp}${suffix}.bak`);
  fs.renameSync(from, to);
  console.log(`[db:reset] preserved ${path.basename(from)} → ${path.relative(ROOT, to)}`);
}

const run = (script: string) =>
  execFileSync(process.execPath, ['--experimental-strip-types', path.join(ROOT, script)], {
    stdio: 'inherit',
    env: process.env,
  });

run('scripts/db-bootstrap.ts');
run('scripts/seed-demo.ts');
console.log('[db:reset] done — fresh local database, demo catalogue, nothing deleted.');
