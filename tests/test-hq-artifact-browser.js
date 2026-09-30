'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { chromium } = require('./ci/node_modules/playwright');
async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'torque-hq-artifact-'));
  const file = path.join(dir, 'preview.html');
  execFileSync(process.execPath, [path.join(__dirname, '../tools/hq-ops/build-preview.cjs'), file]);
  const executablePath = process.env.CHROMIUM_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const calls = [], errors = [];
    const url = pathToFileURL(file).href;
    await ctx.route('**/*', route => {
      if (route.request().url() === url) return route.continue();
      calls.push(route.request().url()); return route.abort();
    });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(url); await page.locator('.hq-stats').waitFor();
    assert.equal(await page.locator('.hq-stat').count(), 4);
    assert.match(await page.locator('.hq-demo-banner').innerText(), /DADOS FICTÍCIOS/);
    await page.locator('.hq-nav [data-nav="reports"]').click();
    assert.ok((await page.locator('#hqArea').innerText()).includes('Relatórios'));
    await page.locator('.hq-nav [data-nav="referrals"]').click();
    await page.locator('a[href^="influencer.html"]').click();
    await page.locator('dialog[open] .ip-kpis').waitFor();
    assert.match(await page.locator('dialog').innerText(), /valores fictícios/);
    assert.equal(await page.locator('dialog .ip-kpis article').count(), 6);
    await page.locator('dialog [data-close]').click();
    await page.locator('.hq-nav [data-nav="overview"]').click();
    if (process.env.HQ_SCREENSHOTS) {
      fs.mkdirSync(process.env.HQ_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.HQ_SCREENSHOTS, 'hq-library-desktop.png'), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    assert.ok(await page.locator('.hq-sidebar').evaluate(el=>el.getBoundingClientRect().right <= 1), 'mobile sidebar stays closed');
    if (process.env.HQ_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.HQ_SCREENSHOTS, 'hq-library-mobile.png'), fullPage: true });
    assert.deepEqual(calls, []); assert.deepEqual(errors, []);
    await ctx.close();
    console.log('PASS HQ artifact: offline file, dashboard, reports, influencer, mobile; zero external requests/errors.');
  } finally { await browser.close(); fs.unlinkSync(file); fs.rmdirSync(dir); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
