import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const policy = JSON.parse(readFileSync(new URL('./preflight.json', import.meta.url)));
const origin = 'https://agency-landing-page-fm.royeradames.com';
const digestPattern = /^[a-f0-9]{64}$/;
const sourcePattern = /^[a-f0-9]{40}$/;
const generatedPath = /^\/_next\/static\/immutable\/(?:chunks\/[A-Za-z0-9_-]+\.(?:js|css)|media\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.woff2)$/;
const fixedPaths = policy.allowedPaths.filter(subject => !subject.startsWith('/_next/')).sort();

function utcTime(value) {
  assert.equal(typeof value, 'string');
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
  const timestamp = Date.parse(value);
  assert.ok(Number.isFinite(timestamp));
  assert.equal(new Date(timestamp).toISOString(), value.includes('.') ? value : value.replace('Z', '.000Z'));
  return timestamp;
}

export function remainingProductionBudget(production, now = Date.now()) {
  assert.ok(Number.isFinite(now) && production.capturedAt <= now, 'Snapshot capture is in the future');
  const remaining = Math.min(production.hardStop, production.validUntil) - now - 15000;
  assert.ok(remaining > 0, 'Snapshot/fixed H expired or cleanup reserve unavailable; no extension');
  return remaining;
}

export function readProductionPreflight(rawSnapshot, environment = process.env, now = Date.now()) {
  assert.equal(typeof rawSnapshot, 'string', 'Required production snapshot is absent');
  assert.ok(Buffer.byteLength(rawSnapshot, 'utf8') > 0 && Buffer.byteLength(rawSnapshot, 'utf8') <= 16384, 'Production snapshot exceeds16KiB');
  assert.match(environment.FM_PRODUCTION_PREFLIGHT_SHA256 || '', digestPattern);
  const snapshotSha256 = createHash('sha256').update(rawSnapshot, 'utf8').digest('hex');
  assert.equal(snapshotSha256, environment.FM_PRODUCTION_PREFLIGHT_SHA256, 'Production snapshot raw-byte hash mismatch');
  assert.match(environment.FM_ROOT_ADMISSION_SHA256 || '', digestPattern);
  assert.match(environment.FM_WORKFLOW_SHA || '', sourcePattern);
  assert.equal(environment.FM_WORKFLOW_SHA, environment.GITHUB_SHA);
  const preflight = JSON.parse(rawSnapshot);
  assert.ok(preflight && typeof preflight === 'object' && !Array.isArray(preflight));
  assert.deepEqual(Object.keys(preflight).sort(), ['origin', 'url', 'sourceSha', 'allowedPaths', 'htmlSha256', 'cssHashes', 'scope', 'deploymentId', 'capturedAtUtc', 'validUntilUtc'].sort());
  assert.equal(preflight.origin, origin);
  assert.equal(preflight.url, origin + '/');
  assert.equal(typeof preflight.sourceSha, 'string');
  assert.match(preflight.sourceSha, sourcePattern);
  assert.equal(preflight.sourceSha, environment.FM_SITE_SOURCE_SHA);
  assert.equal(typeof preflight.deploymentId, 'string');
  assert.match(preflight.deploymentId, /^dpl_[A-Za-z0-9]{1,64}$/);
  assert.equal(preflight.scope, policy.scope);
  assert.equal(typeof preflight.htmlSha256, 'string');
  assert.match(preflight.htmlSha256, digestPattern);
  assert.ok(Array.isArray(preflight.allowedPaths) && preflight.allowedPaths.length > 0 && preflight.allowedPaths.length <= 128);
  assert.equal(new Set(preflight.allowedPaths).size, preflight.allowedPaths.length);
  for (const subject of preflight.allowedPaths) {
    assert.equal(typeof subject, 'string');
    assert.ok(subject.length <= 200 && !subject.includes('..') && !/[\\%?#]/.test(subject));
    assert.ok(fixedPaths.includes(subject) || generatedPath.test(subject), 'Path outside fixed agency policy');
  }
  assert.deepEqual(preflight.allowedPaths.filter(subject => !subject.startsWith('/_next/')).sort(), fixedPaths);
  assert.ok(preflight.cssHashes && typeof preflight.cssHashes === 'object' && !Array.isArray(preflight.cssHashes));
  const cssPaths = preflight.allowedPaths.filter(subject => subject.endsWith('.css')).sort();
  assert.ok(cssPaths.length > 0);
  assert.deepEqual(Object.keys(preflight.cssHashes).sort(), cssPaths);
  for (const value of Object.values(preflight.cssHashes)) {
    assert.equal(typeof value, 'string');
    assert.match(value, digestPattern);
  }
  const capturedAt = utcTime(preflight.capturedAtUtc);
  const validUntil = utcTime(preflight.validUntilUtc);
  assert.ok(validUntil > capturedAt && validUntil - capturedAt <= 900000, 'Snapshot lifetime must be at most15minutes');
  assert.equal(preflight.validUntilUtc, environment.FM_HARD_STOP_UTC, 'This finite run requires snapshot expiry exactly equal fixed H');
  const hardStop = utcTime(environment.FM_HARD_STOP_UTC);
  Object.freeze(preflight.allowedPaths);
  Object.freeze(preflight.cssHashes);
  Object.freeze(preflight);
  const production = Object.freeze({preflight, rawSnapshot, snapshotSha256, capturedAt, validUntil, hardStop});
  remainingProductionBudget(production, now);
  return production;
}
