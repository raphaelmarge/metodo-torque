'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { chromium } = require('./ci/node_modules/playwright');
async function run() {
  const root = path.resolve(__dirname, '..');
  const base = process.env.BASE_URL || process.env.MT_BASE;
  const suppliedFile = process.env.HQ_ARTIFACT_PATH;
  let dir, browser;
  try {
    // HTTP uses the configured static server; file mode needs no server at all.
    // A supplied artifact is read-only. Only our uniquely named generated file is removed.
    if (!suppliedFile) dir = fs.mkdtempSync(path.join(base ? __dirname : os.tmpdir(), 'torque-hq-artifact-'));
    const file = suppliedFile ? path.resolve(suppliedFile) : path.join(dir, 'preview.html');
    if (!suppliedFile) execFileSync(process.execPath, [path.join(root, 'tools/hq-ops/build-preview.cjs'), file]);
    let url = pathToFileURL(file).href;
    if (base) {
      const origin = new URL(base.endsWith('/') ? base : base + '/');
      assert.ok(['http:', 'https:'].includes(origin.protocol), 'BASE_URL must point to an HTTP static server');
      const relative = path.relative(root, file);
      assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'HTTP artifact must be inside the checkout served by BASE_URL');
      url = new URL(relative.split(path.sep).map(encodeURIComponent).join('/'), origin).href;
    }
    const expected = fs.readFileSync(file);
    const executablePath = process.env.CHROMIUM_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
    browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const calls = [], errors = [];
    await ctx.route('**/*', route => {
      if (route.request().url() === url) return route.continue();
      calls.push(route.request().url()); return route.abort();
    });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    const response = await page.goto(url);
    assert.ok(response && response.status() === 200, 'artifact document must load successfully');
    assert.equal(page.url(), url, 'navigation must use the requested artifact URL without redirects');
    assert.deepEqual(await response.body(), expected, 'browser must receive this checkout artifact, not another server or page');
    await page.locator('.hq-stats').waitFor();
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
    console.log('PASS HQ artifact: ' + (base ? 'HTTP via configured BASE_URL/MT_BASE' : 'offline file') + ', dashboard, reports, influencer, mobile; zero external requests/errors.');
  } finally {
    try { if (browser) await browser.close(); }
    finally {
      if (dir) {
        const generatedFile = path.join(dir, 'preview.html');
        if (fs.existsSync(generatedFile)) fs.unlinkSync(generatedFile);
        fs.rmdirSync(dir);
      }
    }
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
