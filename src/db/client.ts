import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * K-brands persistence layer.
 *
 * Audit note: the repository arrived with no framework, no ORM and no database.
 * Native addons (better-sqlite3, pg) cannot be compiled in this environment
 * because prebuilt binaries are unreachable and node-gyp fails, so the platform
 * is built on Node's own `node:sqlite` driver (synchronous, transactional,
 * dependency-free) behind a small repository abstraction. Swapping to
 * Postgres for scale-out is a documented, contained change — see
 * docs/database.md.
 */

export type SqlParams = (string | number | null | bigint)[];

let db: DatabaseSync | null = null;
let dbPath = '';

export function resolveDbPath(): string {
  const configured = process.env.KBRANDS_DB_PATH;
  if (configured) return path.resolve(configured);
  const fallback = path.join(process.cwd(), '.data', 'kbrands.sqlite3');
  const testPath = process.env.KBRANDS_TEST_DB_PATH;
  return testPath ? path.resolve(testPath) : fallback;
}

export function getDb(): DatabaseSync {
  if (db) return db;
  dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 8000');
  db.exec('PRAGMA wal_autocheckpoint = 500');
  return db;
}

/** Used by tests and scripts to point at a fresh file. */
export function closeDb(): void {
  if (db) {
    try {
      db.exec('PRAGMA wal_checkpoint (TRUNCATE)');
    } catch {
      /* best effort */
    }
    db.close();
    db = null;
  }
}

export function currentDbPath(): string {
  return dbPath || resolveDbPath();
}

/**
 * node:sqlite returns rows as null-prototype objects. Inside the server that is
 * harmless, but Next.js refuses to serialize them into Client Components ("Only plain
 * objects, and a few built-ins, can be passed to Client Components from Server
 * Components") — and the storefront does pass rows down: listing facets, variant grids,
 * cart lines. Normalising here fixes every consumer at once, instead of relying on each
 * call site to remember to copy.
 */
function plain<T>(row: T): T {
  return row !== null && typeof row === 'object' ? ({ ...row } as T) : row;
}

export function all<T = Record<string, unknown>>(sql: string, params: SqlParams = []): T[] {
  const rows = getDb().prepare(sql).all(...(params as never[])) as unknown as T[];
  return rows.map((row) => plain(row));
}

export function get<T = Record<string, unknown>>(
  sql: string,
  params: SqlParams = [],
): T | undefined {
  return plain(getDb().prepare(sql).get(...(params as never[])) as unknown as T | undefined);
}

export function run(sql: string, params: SqlParams = []): { changes: number; lastInsertRowid: number } {
  const res = getDb().prepare(sql).run(...(params as never[]));
  return { changes: Number(res.changes), lastInsertRowid: Number(res.lastInsertRowid) };
}

export function exec(sql: string): void {
  getDb().exec(sql);
}

type TxResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Serialized write transaction. Uses BEGIN IMMEDIATE so that competing writers
 * take the write lock up front (this is what makes the inventory decrement and
 * order creation race-safe at the storage level) and retries on SQLITE_BUSY.
 */
export function transaction<T>(fn: () => T, opts: { immediate?: boolean; retries?: number } = {}): T {
  const immediate = opts.immediate ?? true;
  const retries = opts.retries ?? 4;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return inTx(fn, immediate);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const busy = /SQLITE_BUSY|database is locked/i.test(msg);
      if (!busy || attempt > retries) throw err;
      // Exponential-ish backoff with jitter, synchronous on purpose (Node builtin driver).
      const delay = 12 * attempt + Math.floor(Math.random() * 18);
      sleepSync(delay);
    }
  }
}

function inTx<T>(fn: () => T, immediate: boolean): T {
  const d = getDb();
  const depth = (d as unknown as { __kbDepth?: number }).__kbDepth ?? 0;
  if (depth > 0) {
    // Nested call: participate in the outer transaction (savepoint semantics).
    (d as unknown as { __kbDepth: number }).__kbDepth = depth + 1;
    try {
      return fn();
    } finally {
      (d as unknown as { __kbDepth: number }).__kbDepth = depth;
    }
  }
  (d as unknown as { __kbDepth: number }).__kbDepth = 1;
  d.exec(immediate ? 'BEGIN IMMEDIATE' : 'BEGIN');
  let result: TxResult<T>;
  try {
    result = { ok: true, value: fn() };
  } catch (err) {
    result = { ok: false, error: err };
  }
  if (result.ok) {
    try {
      d.exec('COMMIT');
      return result.value;
    } catch (err) {
      safeRollback(d);
      throw err;
    }
  }
  safeRollback(d);
  throw result.error;
}

function safeRollback(d: DatabaseSync) {
  try {
    d.exec('ROLLBACK');
  } catch {
    /* already rolled back */
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Small guarded helpers so INSERT/UPDATE column lists can never drift out of
 * sync with their value lists (a class of bug worth removing entirely).
 */
export function insertRow(table: string, values: Record<string, unknown>): { lastInsertRowid: number; changes: number } {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  for (const k of keys) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(k)) throw new Error(`invalid column name: ${k}`);
  }
  const cols = keys.join(', ');
  const ph = keys.map(() => '?').join(', ');
  const params = keys.map((k) => normalise(values[k]));
  const res = run(`INSERT INTO ${table} (${cols}) VALUES (${ph})`, params);
  return { lastInsertRowid: res.lastInsertRowid, changes: res.changes };
}

export function updateRow(
  table: string,
  idColumn: string,
  idValue: string | number,
  values: Record<string, unknown>,
): { changes: number } {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  if (keys.length === 0) return { changes: 0 };
  for (const k of keys) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(k)) throw new Error(`invalid column name: ${k}`);
  }
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const params = keys.map((k) => normalise(values[k]));
  const res = run(`UPDATE ${table} SET ${sets} WHERE ${idColumn} = ?`, [...params, idValue]);
  return { changes: res.changes };
}

function normalise(v: unknown): string | number | bigint | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string') return v;
  return JSON.stringify(v);
}
