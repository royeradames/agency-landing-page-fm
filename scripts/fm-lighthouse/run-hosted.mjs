import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readProductionPreflight, remainingProductionBudget} from './production-preflight.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cap = 8388608;
const devices = ['mobile', 'desktop'];
let production;
let preflight;
const record = {state: 'HOLD_INCOMPLETE', plannedAudits: 2, attempts: [], started: new Date().toISOString(), publicationSha: process.env.GITHUB_SHA, rootAdmissionReference: process.env.FM_ROOT_ADMISSION_SHA256, externallyReviewedSiteSha: process.env.FM_SITE_SOURCE_SHA, runnerOs: process.env.RUNNER_OS, imageOs: process.env.ImageOS, imageVersion: process.env.ImageVersion, nodeVersion: process.version, nodeExecutableSha256: hash(readFileSync(process.execPath)), platform: process.platform, architecture: process.arch, requiresExternalDeploymentPostcheck: true, overallFmPercentage: null, repeats: 0};
const remaining = () => remainingProductionBudget(production);
async function servedIdentity() {
  const observations = {};
  for (const [resource, expected] of [['/', preflight.htmlSha256], ...Object.entries(preflight.cssHashes)]) {
    remaining();
    const response = await fetch(preflight.origin + resource, {method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(Math.min(10000, remaining()))});
    assert.equal(response.status, 200);
    assert.equal(response.url, preflight.origin + resource);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      assert.ok(size <= 1000000, 'Served GET overflow HOLD');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    assert.equal(hash(bytes), expected, 'Served identity drift HOLD');
    observations[resource] = {bytes: bytes.length, sha256: expected};
  }
  return observations;
}
let failure;
try {
  assert.equal(process.env.GITHUB_REPOSITORY, 'royeradames/agency-landing-page-fm');
  assert.equal(process.platform, 'linux');
  assert.equal(process.version, 'v24.11.1');
  assert.match(process.env.FM_ROOT_ADMISSION_SHA256 || '', /^[a-f0-9]{64}$/);
  const pinsBytes = readFileSync(path.join(root, 'source-pins.json'));
  assert.equal(hash(pinsBytes), process.env.FM_SOURCE_PINS_SHA256);
  for (const [name, expected] of Object.entries(JSON.parse(pinsBytes))) assert.equal(hash(readFileSync(path.join(root, name))), expected, name);
  production = readProductionPreflight(process.env.FM_PRODUCTION_PREFLIGHT_JSON);
  assert.equal(existsSync(path.join(root, 'measurement-preflight.json')), false, 'No reuse of a runtime production snapshot');
  writeFileSync(path.join(root, 'measurement-preflight.json'), production.rawSnapshot, {flag: 'wx'});
  production = readProductionPreflight(readFileSync(path.join(root, 'measurement-preflight.json'), 'utf8'));
  preflight = production.preflight;
  record.sourceSha = preflight.sourceSha;
  record.productionPreflightSha256 = production.snapshotSha256;
  record.productionPreflight = preflight;
  record.productionPreflightRaw = production.rawSnapshot;
  record.before = await servedIdentity();
  for (const device of devices) {
    assert.ok(remaining() > 100000, 'Insufficient fixed-H budget for one90s device plus closure');
    assert.equal(existsSync(path.join(root, device)), false, 'No rerun/reuse of prior attempt');
    const child = spawnSync(process.execPath, [path.join(root, 'audit.mjs'), device], {cwd: root, env: process.env, encoding: 'utf8', timeout: 90000, maxBuffer: 1048576, killSignal: 'SIGTERM'});
    const ordinary = {device, exitCode: child.status, signal: child.signal, failure: child.error?.message || null, stdout: child.stdout || '', stderr: child.stderr || ''};
    writeFileSync(path.join(root, device + '-ordinary.json'), JSON.stringify(ordinary));
    record.attempts.push({device, exitCode: child.status, signal: child.signal, failure: child.error?.message || null});
    assert.equal(child.error, undefined, 'Audit deadline/log refusal');
    assert.equal(child.status, 0, 'First nonzero audit closes batch');
    const receipt = JSON.parse(readFileSync(path.join(root, device, 'receipt.json')));
    assert.equal(receipt.state, 'MEASURED_URL_SOURCE_BINDING_POSTCHECK_REQUIRED');
    assert.equal(receipt.browserCloseAcknowledged, true);
    assert.equal(receipt.forbidden.length, 0);
    assert.equal(receipt.errors.length, 0);
    assert.equal(receipt.productionPreflightSha256, production.snapshotSha256);
    assert.deepEqual(receipt.productionPreflight, preflight);
    assert.equal(receipt.productionPreflightRaw, production.rawSnapshot);
    assert.equal(receipt.publicationSha, process.env.GITHUB_SHA);
    const lhr = JSON.parse(readFileSync(path.join(root, device, 'lhr.json')));
    assert.deepEqual(Object.keys(lhr.categories).sort(), ['accessibility', 'best-practices', 'performance', 'seo']);
    assert.equal(lhr.configSettings.formFactor, device);
  }
  record.after = await servedIdentity();
  remaining();
  record.state = 'TWO_SINGLE_PASSES_PUBLIC_BYTES_BOUND_EXTERNAL_DEPLOYMENT_REVIEW_REQUIRED';
} catch (error) {
  failure = error;
  record.failure = String(error.stack || error);
} finally {
  record.finished = new Date().toISOString();
  record.unrun = devices.filter(device => !record.attempts.some(attempt => attempt.device === device));
  writeFileSync(path.join(root, 'hosted-receipt.json'), JSON.stringify(record, null, 2));
  const names = ['hosted-receipt.json', ...devices.flatMap(device => [device + '/lhr.json', device + '/receipt.json', device + '-ordinary.json'])].filter(name => existsSync(path.join(root, name)));
  const reports = names.map(name => {
    const raw = readFileSync(path.join(root, name));
    const encoded = gzipSync(raw).toString('base64');
    return {name, rawBytes: raw.length, rawSha256: hash(raw), encoding: 'gzip+base64', data: encoded};
  });
  const lines = reports.flatMap(report => {
    const chunks = report.data.match(/.{1,4096}/g) || [];
    const {data, ...metadata} = report;
    return ['FM_REPORT ' + JSON.stringify({...metadata, kind: 'begin', chunks: chunks.length}), ...chunks.map((data, index) => 'FM_REPORT ' + JSON.stringify({kind: 'chunk', name: report.name, index, data})), 'FM_REPORT ' + JSON.stringify({kind: 'end', name: report.name, rawSha256: report.rawSha256})];
  });
  if (Buffer.byteLength(lines.join('\n')) > cap || reports.some(report => report.rawBytes > cap)) {
    console.error('HOLD_LOG_OVERFLOW: no report frames emitted; complete raw reports are not retrievable. No measurement accepted.');
    failure ||= Error('Complete raw report/log cap exceeded');
  } else {
    for (const line of lines) console.log(line);
  }
}
process.exitCode = failure ? 1 : 0;
