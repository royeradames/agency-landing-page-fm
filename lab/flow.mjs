// Stateful Lighthouse run: prepare browser-local state, then measure the route without resetting storage.
// Usage: node lab/flow.mjs '<job json>' <out.lhr.json>
// setup.type "click": open setup.path, press the button named setup.text, wait to leave that path.
// setup.type "localStorage": open the origin, write setup.data (key -> JSON value), then measure.
import {writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(new URL('./node_modules/', import.meta.url));
const puppeteer = require('puppeteer-core');
const {default: lighthouse, desktopConfig} = await import(new URL('./node_modules/lighthouse/core/index.js', import.meta.url));

const job = JSON.parse(process.argv[2]);
const out = process.argv[3];
const CATS = ['performance', 'accessibility', 'best-practices', 'seo'];
const origin = new URL(job.url).origin;
const browser = await puppeteer.launch({headless: true, executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu']});
try {
  const page = await browser.newPage();
  if (job.setup.type === 'click') {
    await page.goto(origin + job.setup.path, {waitUntil: 'networkidle0'});
    const [button] = await page.$$(`xpath/.//button[normalize-space()=${JSON.stringify(job.setup.text)}]`);
    if (!button) throw Error(`No button ${job.setup.text}`);
    await button.click();
    await page.waitForFunction(path => location.pathname !== path, {timeout: 20000}, job.setup.path);
    await new Promise(r => setTimeout(r, 1500));
  } else if (job.setup.type === 'localStorage') {
    await page.goto(origin + '/robots.txt');
    await page.evaluate(data => { for (const [k, v] of Object.entries(data)) localStorage.setItem(k, JSON.stringify(v)); }, job.setup.data);
  }
  await page.goto('about:blank');
  const flags = {output: 'json', logLevel: 'error', maxWaitForLoad: 45000, disableStorageReset: true, onlyCategories: CATS};
  const config = job.device === 'desktop' ? {...desktopConfig, settings: {...desktopConfig.settings, onlyCategories: CATS, disableStorageReset: true}} : undefined;
  const result = await lighthouse(job.url, flags, config, page);
  writeFileSync(out, JSON.stringify(result.lhr));
} finally {
  await browser.close();
}
