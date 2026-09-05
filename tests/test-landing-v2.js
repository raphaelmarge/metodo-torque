// Browser regression for the supplied v2, using the same BASE_URL as tests/run.sh.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const base = process.env.BASE_URL || 'http://127.0.0.1:8765';
const screenshotDir = process.env.LANDING_SCREENSHOTS;
let browser;
(async () => {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const errors = [];
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    context.setDefaultTimeout(12000);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/personal-vendas.html?zap=5531999990000');
    await page.locator('img[src]').evaluateAll(images => images.forEach(img => img.loading = 'eager'));
    await page.waitForFunction(() => Array.from(document.querySelectorAll('img[src]')).every(img => img.complete && img.naturalWidth));
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
    const images = await page.locator('.screenshot-screen > img').evaluateAll(items => items.map(img => ({
      fit: getComputedStyle(img).objectFit,
      error: Math.abs(img.clientWidth / img.clientHeight - img.naturalWidth / img.naturalHeight)
    })));
    assert.equal(images.length, 7);
    assert(images.every(img => img.fit === 'contain' && img.error < .003), `screen proportion at ${width}`);
    assert(await page.locator('#sobre .about-photo img').evaluateAll(items => items.length === 2 && items.every(img => getComputedStyle(img).objectFit === 'cover')));
    assert(await page.locator('[data-zap]').evaluateAll(items => items.length > 0 && items.every(a => a.href.startsWith('https://wa.me/5531999990000?text=') && a.rel.includes('noopener'))));
    assert(await page.locator('a[href^="#"]').evaluateAll(items => items.every(a => document.getElementById(a.getAttribute('href').slice(1)))));
    for (const href of ['personal.html', 'demo-personal.html', 'demo-aluno.html', 'torqueon.html']) {
      assert(await page.locator(`a[href="${href}"]`).count(), href);
    }
    if (width < 761) {
      await page.locator('#menuToggle').click();
      assert(await page.locator('#mainNav').isVisible());
      await page.keyboard.press('Escape');
      assert(!await page.locator('#mainNav').isVisible());
      for (let i = 0; i < 3; i++) {
        await page.locator(`[data-scene="${i}"]`).click();
        assert(await page.locator(`#story${i}`).isVisible());
        assert(await page.locator(`#scene${i}`).evaluate(el => el.classList.contains('active')));
      }
      await page.locator('#recursos').evaluate(el => el.scrollIntoView({ behavior: 'instant' }));
      await page.waitForFunction(() => document.getElementById('mobileCta').getAttribute('aria-hidden') === 'false');
      assert.equal(await page.locator('#mobileCta a').getAttribute('tabindex'), '0');
    }
    for (let i = 0; i < 4; i++) {
      await page.locator(`#tourTab${i}`).click();
      await page.waitForFunction(() => document.querySelector('.tour-image').complete && document.querySelector('.tour-image').naturalWidth);
      assert.equal(await page.locator(`#tourTab${i}`).getAttribute('aria-selected'), 'true');
      await page.locator('.tour-inspect button').click();
      assert(await page.locator('#screenDialog').isVisible());
      assert.equal(await page.locator('#screenDialogImage').getAttribute('src'), await page.locator('.tour-image').evaluate(img => img.src));
      await page.keyboard.press('Escape');
      assert(await page.locator('.tour-inspect button').evaluate(el => el === document.activeElement));
    }
    await page.locator('#tourNext').click();
    assert.equal(await page.locator('#tourNumber').innerText(), '01');
    await page.locator('#tourPrev').click();
    assert.equal(await page.locator('#tourNumber').innerText(), '04');
    await page.locator('#tourTab3').focus();
    await page.keyboard.press('Home');
    assert.equal(await page.locator('#tourTab0').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#tourTab1').getAttribute('aria-selected'), 'true');
    await page.locator('.hero-inspect button').click();
    assert(await page.locator('#screenDialog').isVisible());
    await page.keyboard.press('Escape');
    await page.locator('#studioName').fill('TORQUE STUDIO');
    assert.equal(await page.locator('#studioPreview').textContent(), 'TORQUE STUDIO');
    await page.locator('#studioName').fill('<img src=x onerror=alert(1)>');
    assert.equal(await page.locator('#studioPreview img').count(), 0);
    await page.locator('.swatch[aria-label="Verde"]').click();
    assert.equal(await page.locator('.swatch[aria-pressed="true"]').count(), 1);
    await page.locator('#studentRange').evaluate(el => { el.value = '200'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    assert((await page.locator('#sliderCaption').innerText()).includes('R$ 49/mês'));
    await page.locator('#preco').evaluate(el => el.scrollIntoView({ behavior: 'instant' }));
    await page.waitForFunction(() => document.getElementById('mobileCta').getAttribute('aria-hidden') === 'true');
    await page.locator('.faq summary').first().click();
    assert.notEqual(await page.locator('.faq details').first().getAttribute('open'), null);
    await page.locator('#openVideo').click();
    assert(await page.locator('#videoDialog').isVisible());
    await page.locator('#productVideo').evaluate(el => el.play());
    await page.waitForFunction(() => document.getElementById('productVideo').readyState >= 1);
    assert(await page.locator('#productVideo').evaluate(el => el.controls && !el.autoplay && el.videoWidth > 0));
    await page.keyboard.press('Escape');
    assert(await page.locator('#productVideo').evaluate(el => el.paused));
    assert(await page.locator('html').evaluate(el => el.classList.contains('motion-off')));
    if (screenshotDir) {
      await page.goto(base + '/personal-vendas.html');
      await page.locator('img[src]').evaluateAll(items => items.forEach(img => img.loading = 'eager'));
      await page.waitForFunction(() => Array.from(document.querySelectorAll('img[src]')).every(img => img.complete && img.naturalWidth));
      await page.evaluate(() => document.fonts.ready);
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDir, `v2-${width}.png`), fullPage: true });
      if (width === 390 || width === 1440) {
        await page.screenshot({ path: path.join(screenshotDir, `abertura-${width}.png`) });
        await page.locator('#sobre').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(screenshotDir, `sobre-${width}.png`) });
      }
    }
    console.log(`PASS ${width}px: layout, image ratios, tours, inspector, brand preview, price, video, FAQ, links`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/personal-vendas.html?zap=invalid');
  assert((await page.locator('[data-zap]').first().getAttribute('href')).startsWith('https://wa.me/5521994429198?'));
  await page.locator('#story1').evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('[data-scene="1"]').getAttribute('aria-pressed') === 'true');
  await page.locator('#motionToggle').click();
  assert(await page.locator('html').evaluate(el => el.classList.contains('motion-off')));
  await page.reload();
  assert(await page.locator('html').evaluate(el => el.classList.contains('motion-off')));
  await context.close();
  const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const fallback = await nojs.newPage(); await fallback.goto(base + '/personal-vendas.html');
  assert(await fallback.locator('#heroTitle').isVisible());
  assert(await fallback.locator('#aboutTitle').isVisible());
  assert(await fallback.locator('.price-value').isVisible());
  await nojs.close();
  assert.deepEqual(errors, []);
  console.log('PASS desktop story, saved pause, invalid WhatsApp fallback, no-JS content, zero page errors');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
