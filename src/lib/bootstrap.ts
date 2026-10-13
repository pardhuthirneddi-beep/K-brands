import { runMigrations } from '../db/migrate.ts';
import { ensureDefaults } from '../domain/settings.ts';

let bootstrapped = false;

/**
 * Idempotent first-run bootstrap: apply migrations and seed default settings.
 * Kept process-wide so serverless/next-start invocations do not repeat the work.
 * In production you can instead run `npm run db:migrate` at deploy time (documented
 * in docs/deployment.md) — this call is a no-op once migrations are applied.
 */
export function ensureDb(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    runMigrations();
    ensureDefaults();
  } catch (err) {
    console.error('[bootstrap] database setup failed', err instanceof Error ? err.message : 'unknown error');
    throw err;
  }
}
