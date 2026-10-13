/**
 * The one-click owner door is a demo convenience, so the thing worth testing is not the button — it is
 * that the door is *shut* in every other kind of build. The gate is a derived value on the config
 * module, which lets it be evaluated per-process in a child with a chosen environment instead of being
 * mocked, and `src/lib/env.ts` is the only file this imports (no database, no framework).
 *
 * `npm run test:unit`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const ENV_MODULE = pathToFileURL(path.join(ROOT, 'src/lib/env.ts')).href;

// `flag('')` reads as *off*, not as *unset*, so a case that wants the default has to delete the
// variable rather than pass an empty string - otherwise this file would be testing the harness.
function gate(env: Record<string, string | null>): { access: string; demo: string; live: string } {
  const script =
    `import(${JSON.stringify(ENV_MODULE)}).then((m) =>` +
    ` console.log([m.demoOwnerAccessEnabled, m.demoCatalogueEnabled, m.liveCommerceEnabled].join(',')))`;
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === null) delete childEnv[key];
    else childEnv[key] = value;
  }
  const out = execFileSync(process.execPath, ['--experimental-strip-types', '-e', script], {
    env: childEnv,
    encoding: 'utf8',
  }).trim();
  const [access, demo, live] = out.split(',');
  // An unparseable child output must fail as '' !== 'false', never as a crash on undefined.
  return { access: access ?? '', demo: demo ?? '', live: live ?? '' };
}

test('the owner shortcut is closed in a real production build', () => {
  // Nothing set but NODE_ENV: demo catalogue defaults off, live commerce defaults off.
  const r = gate({ NODE_ENV: 'production', KBRANDS_DEMO_CATALOGUE: null, KBRANDS_LIVE_COMMERCE: null });
  assert.equal(r.demo, 'false', 'a production build must not publish the demo catalogue');
  assert.equal(r.access, 'false', 'a production build must not offer one-click owner access');
});

test('the owner shortcut is closed the moment the store goes live', () => {
  const r = gate({ NODE_ENV: 'production', KBRANDS_DEMO_CATALOGUE: '1', KBRANDS_LIVE_COMMERCE: '1' });
  assert.equal(r.demo, 'true');
  assert.equal(r.live, 'true');
  assert.equal(r.access, 'false', 'live commerce is the switch that removes the shortcut');
});

test('the owner shortcut is open only for a build that declares itself a demo', () => {
  const prodDemo = gate({ NODE_ENV: 'production', KBRANDS_DEMO_CATALOGUE: '1', KBRANDS_LIVE_COMMERCE: '0' });
  assert.equal(prodDemo.access, 'true', 'a demo deployment needs the shortcut to be usable');
  const dev = gate({ NODE_ENV: 'development', KBRANDS_DEMO_CATALOGUE: null, KBRANDS_LIVE_COMMERCE: null });
  assert.equal(dev.access, 'true', 'a development machine gets it by default');
});

test('the route checks the gate before it touches the credential store', () => {
  // Comments are stripped first: the file's own header explains the shortcut in terms of
  // `authenticate()`, and a plain indexOf would find that sentence instead of the call.
  const src = readFileSync(path.join(ROOT, 'src/app/api/auth/demo-owner/route.ts'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
  const gateAt = src.indexOf('if (!demoOwnerAccessEnabled)');
  const authAt = src.indexOf('authenticate(');
  assert.ok(gateAt > -1, 'the route must read the gate');
  assert.ok(authAt > -1, 'the route must authenticate through the normal path');
  assert.ok(gateAt < authAt, 'the gate must be checked first, before any credential is read');
  assert.ok(
    !/KBRANDS_BOOTSTRAP_ADMIN_PASSWORD\s*[:=]\s*['"]/.test(src),
    'no credential may ever be hardcoded in the shortcut',
  );
});
