import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {readProductionPreflight, remainingProductionBudget} from './production-preflight.mjs';

const policy = JSON.parse(readFileSync(new URL('./preflight.json', import.meta.url)));
const now = Date.parse('2026-10-16T20:00:00.000Z');
const hash = raw => createHash('sha256').update(raw, 'utf8').digest('hex');
const cssPath = '/_next/static/immutable/chunks/new-build.css';
const fixedPaths = policy.allowedPaths.filter(subject => !subject.startsWith('/_next/'));
function fixture() {
  return {...policy, sourceSha: 'b'.repeat(40), allowedPaths: [...fixedPaths, cssPath, '/_next/static/immutable/chunks/new-build.js', '/_next/static/immutable/media/new-font.s.family.woff2'], cssHashes: {[cssPath]: 'c'.repeat(64)}, deploymentId: 'dpl_CurrentPublicBuild123', capturedAtUtc: '2026-10-16T19:59:00.000Z', validUntilUtc: '2026-10-16T20:10:00.000Z'};
}
function environment(raw, snapshot = fixture()) {
  return {FM_PRODUCTION_PREFLIGHT_SHA256: hash(raw), FM_ROOT_ADMISSION_SHA256: 'd'.repeat(64), FM_WORKFLOW_SHA: 'e'.repeat(40), GITHUB_SHA: 'e'.repeat(40), FM_SITE_SOURCE_SHA: snapshot.sourceSha, FM_HARD_STOP_UTC: snapshot.validUntilUtc};
}
function rejected(change) {
  const snapshot = fixture();
  change(snapshot);
  const raw = JSON.stringify(snapshot);
  assert.throws(() => readProductionPreflight(raw, environment(raw, snapshot), now));
}

test('new admitted deployment/source/assets load without editing tracked policy', () => {
  const before = readFileSync(new URL('./preflight.json', import.meta.url));
  const snapshot = fixture();
  const raw = JSON.stringify(snapshot);
  const production = readProductionPreflight(raw, environment(raw), now);
  assert.notEqual(production.preflight.sourceSha, policy.sourceSha);
  assert.deepEqual(production.preflight, snapshot);
  assert.equal(production.rawSnapshot, raw);
  assert.equal(production.snapshotSha256, hash(raw));
  assert.equal(remainingProductionBudget(production, now), 585000);
  assert.deepEqual(readFileSync(new URL('./preflight.json', import.meta.url)), before);
});

test('snapshot and exact raw SHA are required with no old-policy fallback', () => {
  const raw = JSON.stringify(fixture());
  assert.throws(() => readProductionPreflight(undefined, environment(raw), now));
  assert.throws(() => readProductionPreflight('', environment(''), now));
  assert.throws(() => readProductionPreflight(raw, {...environment(raw), FM_PRODUCTION_PREFLIGHT_SHA256: undefined}, now));
  assert.throws(() => readProductionPreflight(raw + '\n', environment(raw), now));
  assert.throws(() => readProductionPreflight(raw, {...environment(raw), FM_PRODUCTION_PREFLIGHT_SHA256: 'g'.repeat(64)}, now));
  const oversized = ' '.repeat(16385);
  assert.throws(() => readProductionPreflight(oversized, environment(oversized), now));
  const malformed = '{';
  assert.throws(() => readProductionPreflight(malformed, environment(malformed), now));
  for (const malformedShape of ['null', '[]', '12', '"snapshot"']) {
    assert.throws(() => readProductionPreflight(malformedShape, environment(malformedShape), now));
  }
});

test('shape, literal agency origin/root and public policy cannot widen', () => {
  rejected(snapshot => {snapshot.extra = true;});
  for (const key of Object.keys(fixture())) {
    rejected(snapshot => {delete snapshot[key];});
  }
  rejected(snapshot => {snapshot.origin = 'https://example.com';});
  rejected(snapshot => {snapshot.origin += ':443';});
  rejected(snapshot => {snapshot.url += '?query=1';});
  rejected(snapshot => {snapshot.url = 'https://agency-landing-page-fm.royeradames.com/private';});
  rejected(snapshot => {snapshot.scope = 'Arbitrary route';});
  rejected(snapshot => {snapshot.allowedPaths = null;});
  rejected(snapshot => {snapshot.allowedPaths.push('/api/private');});
  rejected(snapshot => {snapshot.allowedPaths = snapshot.allowedPaths.filter(subject => subject !== '/');});
  rejected(snapshot => {snapshot.allowedPaths.push('/');});
  rejected(snapshot => {snapshot.allowedPaths.push('/new-static-page');});
  rejected(snapshot => {snapshot.allowedPaths.push(12);});
  rejected(snapshot => {snapshot.allowedPaths = Array.from({length: 129}, (_, index) => '/_next/static/immutable/chunks/' + index + '.js');});
});

test('generated paths are individual narrow canonical chunk/font strings', () => {
  for (const subject of ['/api/x.js', '/_next/static/chunks/new.js', '/_next/static/immutable/chunks/new.js?q=1', '/_next/static/immutable/chunks/new.js#part', '/_next/static/immutable/chunks/%2e%2e.js', '/_next/static/immutable/chunks/../new.js', '/_next/static/immutable/chunks/a\\b.js', '/_next/static/immutable/media/a..b.woff2', '/_next/static/immutable/media/a.svg', '//example.com/new.js', '/_next/static/immutable/chunks/' + 'a'.repeat(201) + '.js']) {
    rejected(snapshot => {snapshot.allowedPaths.push(subject);});
  }
});

test('strict hashes and exact nonempty CSS subset are required', () => {
  rejected(snapshot => {snapshot.htmlSha256 = 'G'.repeat(64);});
  rejected(snapshot => {snapshot.htmlSha256 = 12;});
  rejected(snapshot => {snapshot.cssHashes = {};});
  rejected(snapshot => {snapshot.cssHashes = {[cssPath]: 'x'.repeat(64)};});
  rejected(snapshot => {snapshot.cssHashes['/_next/static/immutable/chunks/unknown.css'] = 'c'.repeat(64);});
  rejected(snapshot => {snapshot.allowedPaths.push('/_next/static/immutable/chunks/unhashed.css');});
  rejected(snapshot => {snapshot.cssHashes = [];});
  rejected(snapshot => {snapshot.cssHashes = null;});
});

test('root admission, published workflow, app source and deployment are bound', () => {
  const raw = JSON.stringify(fixture());
  assert.throws(() => readProductionPreflight(raw, {...environment(raw), FM_SITE_SOURCE_SHA: 'a'.repeat(40)}, now));
  assert.throws(() => readProductionPreflight(raw, {...environment(raw), FM_ROOT_ADMISSION_SHA256: ''}, now));
  assert.throws(() => readProductionPreflight(raw, {...environment(raw), GITHUB_SHA: 'a'.repeat(40)}, now));
  rejected(snapshot => {snapshot.sourceSha = 'B'.repeat(40);});
  rejected(snapshot => {snapshot.deploymentId = 'https://example.com';});
  rejected(snapshot => {snapshot.deploymentId = 12;});
});

test('capture, <=15minute lifetime, expiry equal H and cleanup reserve are mandatory', () => {
  rejected(snapshot => {snapshot.capturedAtUtc = '2026-10-16T20:01:00.000Z';});
  rejected(snapshot => {snapshot.capturedAtUtc = '2026-10-16T19:40:00.000Z';});
  rejected(snapshot => {snapshot.validUntilUtc = '2026-10-16T20:00:00.000Z';});
  rejected(snapshot => {snapshot.validUntilUtc = '2026-10-16T20:00:15.000Z';});
  rejected(snapshot => {snapshot.capturedAtUtc = '2026-02-30T19:59:00.000Z';});
  rejected(snapshot => {snapshot.capturedAtUtc = '2026-10-16T19:59:00-00:00';});
  const raw = JSON.stringify(fixture());
  assert.throws(() => readProductionPreflight(raw, {...environment(raw), FM_HARD_STOP_UTC: '2026-10-16T20:11:00.000Z'}, now));
  assert.throws(() => readProductionPreflight(raw, {...environment(raw), FM_HARD_STOP_UTC: '2026-10-16T20:09:00.000Z'}, now));
  const production = readProductionPreflight(raw, environment(raw), now);
  assert.throws(() => remainingProductionBudget(production, Date.parse(fixture().validUntilUtc) - 15000));
  assert.throws(() => remainingProductionBudget(production, Date.parse(fixture().validUntilUtc)));
});
