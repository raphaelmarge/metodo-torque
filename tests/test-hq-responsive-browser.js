/* Synthetic preview only. Optional HQ_GEOMETRY_REPORT_ONLY=1 records the baseline.
 * HQ_SCREENSHOTS writes screenshots; no production, authentication or remote data.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || './ci/node_modules/playwright');
const { createServer } = require('../tools/hq-ops/serve.cjs');
const WIDTHS = [320, 375, 430, 768, 1440];

async function geometry(page) {
  return page.evaluate(() => {
    const visible = el => !!el.getClientRects().length;
    const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const label = el => el.id || el.name || el.getAttribute('data-hqr-report') || el.className || el.tagName;
    const controls = Array.from(document.querySelectorAll('.hq-toolbar input, .hq-toolbar select, .hq-toolbar button, .hq-top-actions input, .hq-top-actions button')).filter(visible);
    const out = controls.filter(el => { const r = rect(el); return r.left < -1 || r.right > innerWidth + 1; }).map(el => ({ control: label(el), ...rect(el) }));
    const escapedFields = controls.filter(el => el.closest('.hq-field')).filter(el => { const r = rect(el), p = rect(el.closest('.hq-field')); return r.left < p.left - 1 || r.right > p.right + 1; }).map(el => ({ control: label(el), ...rect(el), field: rect(el.closest('.hq-field')) }));
    const overlaps = [];
    for (let a = 0; a < controls.length; a++) for (let b = a + 1; b < controls.length; b++) {
      const x = rect(controls[a]), y = rect(controls[b]);
      if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1) overlaps.push([label(controls[a]), label(controls[b])]);
    }
    const content = Array.from(document.querySelectorAll('.hq-card,.hq-section,.hq-stat,.hq-reports-summary,.hq-report-stat,.hq-reports-catalog,.hq-stage-grid,.hq-toolbar,.hq-topbar,.hq-chart-grid'));
    const overflowing = content.filter(visible).filter(el => { const r = rect(el); return r.left < -1 || r.right > innerWidth + 1; }).map(el => ({ item: label(el), ...rect(el) }));
    const nativeDates = controls.filter(el => el.type === 'date' || el.type === 'month').map(el => ({ control: label(el), width: rect(el).width }));
    const bars = Array.from(document.querySelectorAll('.hq-report-stat')).map(el => ({ card: rect(el), bar: el.querySelector('.hq-report-bar') ? rect(el.querySelector('.hq-report-bar')) : null }));
    const misalignedBars = bars.filter((x, i) => x.bar && bars.slice(i + 1).some(y => y.bar && Math.abs(x.card.top - y.card.top) < 1 && Math.abs(x.bar.bottom - y.bar.bottom) > 1));
    return { width: innerWidth, pageWidth: document.documentElement.scrollWidth, out, escapedFields, overlaps, overflowing, nativeDates, misalignedBars,
      shortControls: controls.filter(el => rect(el).height < 43.5).map(el => ({ control: label(el), height: rect(el).height })),
      filters: controls.filter(el => el.closest('[data-hqr-filters]')).map(el => ({ control: label(el), ...rect(el) })) };
  });
}

async function run() {
  const configured = process.env.BASE_URL || process.env.MT_BASE;
  if (configured) assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(configured).hostname), 'Geometry checks only allow a local fixture server');
  const server = configured ? null : createServer();
  if (server) await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8874, '127.0.0.1', resolve); });
  const base = (configured || 'http://127.0.0.1:8874').replace(/\/+$/, '');
  const origin = new URL(base).origin;
  let browser;
  const results = [], errors = [], external = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR', serviceWorkers: 'block' });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) { external.push(new URL(route.request().url()).origin); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    if (process.env.HQ_SCREENSHOTS) fs.mkdirSync(process.env.HQ_SCREENSHOTS, { recursive: true });
    async function record(state, width) {
      await page.evaluate(() => document.fonts.ready);
      const measured = await geometry(page);
      results.push({ state, ...measured });
      if (process.env.HQ_SCREENSHOTS && ['overview', 'subscriptions', 'reports'].includes(state)) await page.screenshot({ path: path.join(process.env.HQ_SCREENSHOTS, state + '-' + width + '.png'), fullPage: true });
    }
    async function navigate(area) {
      if (await page.locator('#hqMenu').isVisible()) await page.locator('#hqMenu').click();
      await page.locator('.hq-nav [data-nav="' + area + '"]').click();
      assert.equal(await page.locator('.hq-app.nav-open').count(), 0, 'Navigation closes the mobile drawer');
    }
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: width <= 430 ? 900 : 1000 });
      await page.goto(base + '/apps/hq-ops-preview.html');
      await page.locator('.hq-stats .hq-stat').first().waitFor();
      assert.match(await page.locator('.hq-demo-banner').innerText(), /DADOS FICT[IÍ]CIOS/);
      await record('overview', width);
      for (const area of ['sales', 'customers', 'finance', 'support', 'health', 'admin', 'reports']) {
        await navigate(area);
        await record(area, width);
      }
      await page.locator('[data-hqr-report="subscriptions"]').click();
      await page.locator('[data-hqr-filters]').waitFor();
      await record('subscriptions', width);
      if (width <= 430 && process.env.HQ_GEOMETRY_REPORT_ONLY !== '1') {
        const table = page.locator('[data-hqr-root] .hq-table-wrap');
        assert.ok(await table.evaluate(el => el.scrollWidth > el.clientWidth + 1), 'The report retains a readable table with its own horizontal scroll');
        await table.evaluate(el => { el.scrollLeft = el.scrollWidth; });
        const lastAction = table.locator('[data-hqr-detail]').first();
        const buttonBox = await lastAction.boundingBox(), tableBox = await table.boundingBox();
        assert.ok(buttonBox.x >= tableBox.x - 1 && buttonBox.x + buttonBox.width <= tableBox.x + tableBox.width + 1, 'Horizontal scrolling reveals the record action');
        await lastAction.click();
        await page.locator('dialog[open]').waitFor();
        await page.locator('dialog[open] [data-close]').click();
        await table.evaluate(el => { el.scrollLeft = 0; });
      }
      const form = page.locator('[data-hqr-filters]');
      await form.locator('[name="from"]').fill('2026-09-01');
      await form.locator('[name="to"]').fill('2026-09-30');
      await form.locator('[name="cohort"]').fill('2026-08');
      await form.locator('button[type="submit"]').click();
      assert.equal(await page.locator('[data-hqr-filters] [name="cohort"]').inputValue(), '2026-08');
      assert.equal(await page.locator('[data-hqr-filters] [name="from"]').inputValue(), '2026-09-01');
      await record('subscriptions-filtered', width);
    }
    for (const r of results) console.log(JSON.stringify({ state: r.state, width: r.width, pageWidth: r.pageWidth, out: r.out, escapedFields: r.escapedFields, overlaps: r.overlaps, overflowing: r.overflowing, shortControls: r.shortControls.length, misalignedBars: r.misalignedBars.length, filters: r.state === 'subscriptions' ? r.filters : undefined }));
    assert.deepEqual(errors, [], 'No browser errors');
    assert.deepEqual(external, [], 'No external requests');
    if (process.env.HQ_GEOMETRY_REPORT_ONLY !== '1') for (const r of results) {
      const where = r.state + ' at ' + r.width + 'px';
      assert.ok(r.pageWidth <= r.width + 1, where + ': document overflow ' + r.pageWidth);
      assert.deepEqual(r.out, [], where + ': controls outside the viewport');
      assert.deepEqual(r.escapedFields, [], where + ': controls escape their field');
      assert.deepEqual(r.overlaps, [], where + ': controls overlap');
      assert.deepEqual(r.overflowing, [], where + ': cards/grids outside the viewport');
      assert.deepEqual(r.shortControls, [], where + ': controls below 44px');
      assert.ok(r.nativeDates.every(d => d.width >= (r.width <= 780 ? 160 : 140)), where + ': native dates have enough room for their text and picker');
      assert.deepEqual(r.misalignedBars, [], where + ': indicator bars in the same row align');
    }
    console.log('HQ geometry: ' + results.length + ' fixture states measured; ' + (process.env.HQ_GEOMETRY_REPORT_ONLY === '1' ? 'baseline only' : 'all assertions passed') + '.');
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
