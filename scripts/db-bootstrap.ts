import { runMigrations, migrationStatus } from '../src/db/migrate.ts';
import { closeDb, currentDbPath, get } from '../src/db/client.ts';

const res = runMigrations();
console.log(`[db] file: ${currentDbPath()}`);
console.log(`[db] migrations applied now: ${String(res.applied)} / total ${String(res.total)}`);
for (const s of migrationStatus()) console.log(`  ${s.applied ? 'x' : '.'} ${String(s.version)} ${s.name}`);
const tables = get<{ count: number }>(
  "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
);
console.log(`[db] tables: ${String(tables?.count ?? 0)}`);
closeDb();
