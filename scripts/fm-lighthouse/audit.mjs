import {createRequire} from 'node:module';
import {readFileSync, writeFileSync, mkdirSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readProductionPreflight, remainingProductionBudget} from './production-preflight.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const production = readProductionPreflight(readFileSync(path.join(root, 'measurement-preflight.json'), 'utf8'));
const preflight = production.preflight;
const device = process.argv[2];
if (!['mobile', 'desktop'].includes(device)) throw Error('Unknown device');
const out = path.join(root, device);
mkdirSync(out);
const dependency = path.join(root, 'node_modules');
const require = createRequire(path.join(dependency, 'lighthouse/package.json'));
const puppeteer = require('puppeteer-core');
const {default: lighthouse, desktopConfig, generateReport} = await import(path.join(dependency, 'lighthouse/core/index.js'));
const allowed = new Set(preflight.allowedPaths);
const record = {device, sourceSha: preflight.sourceSha, publicationSha: process.env.GITHUB_SHA, rootAdmissionReference: process.env.FM_ROOT_ADMISSION_SHA256, productionPreflightSha256: production.snapshotSha256, productionPreflight: preflight, productionPreflightRaw: production.rawSnapshot, started: new Date().toISOString(), requests: [], forbidden: [], errors: [], state: 'RUNNING', productionCspUnmodified: true};
const save = () => writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(record, null, 2));
let browser;
let deadlineTimer;
const deadline = new Promise((_, reject) => {deadlineTimer = setTimeout(() => reject(Error('Per-device 82-second measurement deadline')), 82000);});
const measure = async () => {
  assert.ok(remainingProductionBudget(production) > 90000, 'Insufficient snapshot/fixed-H budget for this device');
  const executablePath = realpathSync('/opt/google/chrome/chrome');
  record.browserExecutablePath = executablePath;
  record.browserExecutableSha256 = createHash('sha256').update(readFileSync(executablePath)).digest('hex');
  record.nodeVersion = process.version;
  record.platform = process.platform;
  record.architecture = process.arch;
  browser = await puppeteer.launch({headless: true, pipe: true, timeout: 15000, executablePath});
  record.browserPid = browser.process().pid;
  record.browserVersion = await browser.version();
  record.lighthouseVersion = require('lighthouse/package.json').version;
  save();
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  await page.exposeFunction('auditForbiddenSocket', url => record.forbidden.push({kind: 'socket-before-connect', url}));
  await page.evaluateOnNewDocument(() => {
    window.WebSocket = class {
      constructor(url) {
        window.auditForbiddenSocket(String(url));
        throw Error('Unexpected socket refused before connect');
      }
    };
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    const permitted = request.method() === 'GET' && url.origin === preflight.origin && allowed.has(url.pathname) && (!url.search || url.pathname === '/' && /^\?_rsc=[A-Za-z0-9]{16}$/.test(url.search)) && !url.hash;
    record.requests.push({method: request.method(), origin: url.origin, path: url.pathname, search: url.search, allowed: permitted});
    if (!permitted) record.forbidden.push({method: request.method(), origin: url.origin, path: url.pathname, search: url.search});
    (permitted ? request.continue() : request.abort()).catch(error => record.errors.push(String(error)));
  });
  page.on('pageerror', error => record.errors.push(String(error)));
  const session = await page.createCDPSession();
  await session.send('Network.enable');
  session.on('Network.webSocketCreated', event => record.forbidden.push({kind: 'websocket', url: event.url}));
  const result = await lighthouse(preflight.url, {output: 'json', logLevel: 'error', maxWaitForLoad: 45000, onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']}, device === 'desktop' ? desktopConfig : undefined, page);
  if (!result) throw Error('No Lighthouse result');
  writeFileSync(path.join(out, 'lhr.json'), JSON.stringify(result.lhr));
  writeFileSync(path.join(out, 'report.html'), generateReport(result.lhr, 'html'));
  const lhr = result.lhr;
  record.fetchTime = lhr.fetchTime;
  record.scores = Object.fromEntries(['performance', 'accessibility', 'best-practices', 'seo'].map(name => [name, lhr.categories[name]?.score]));
  record.runtimeError = lhr.runtimeError || null;
  record.requestedUrl = lhr.requestedUrl;
  record.finalDisplayedUrl = lhr.finalDisplayedUrl;
  record.benchmarkIndex = lhr.environment.benchmarkIndex;
  record.runWarnings = lhr.runWarnings;
  record.state = !lhr.runtimeError && lhr.requestedUrl === preflight.url && lhr.finalDisplayedUrl === preflight.url && Object.values(record.scores).every(score => typeof score === 'number') && !record.forbidden.length && !record.errors.length ? 'MEASURED_URL_SOURCE_BINDING_POSTCHECK_REQUIRED' : 'HOLD_INVALID_OR_FORBIDDEN';
};
try {
  await Promise.race([measure(), deadline]);
} catch (error) {
  record.state = 'ERROR';
  record.errors.push(String(error.stack || error));
} finally {
  clearTimeout(deadlineTimer);
  if (browser) await Promise.race([browser.close(), new Promise((_, reject) => setTimeout(() => reject(Error('Browser close deadline')), 8000))]).then(() => {record.browserCloseAcknowledged = true;}).catch(error => {record.errors.push(String(error)); record.state = 'ERROR_CLEANUP';});
  if (record.browserExecutablePath && createHash('sha256').update(readFileSync(record.browserExecutablePath)).digest('hex') !== record.browserExecutableSha256) {record.errors.push('Chrome executable drift'); record.state = 'ERROR_TOOL_DRIFT';}
  record.finished = new Date().toISOString();
  save();
}
process.exitCode = record.state === 'MEASURED_URL_SOURCE_BINDING_POSTCHECK_REQUIRED' ? 0 : 1;
