// Regressão da landing aprovada no Sites, publicada no domínio principal.
const assert = require('node:assert/strict');
const fs = require('node:fs');
let chromium;
try { chromium = require('playwright').chromium; }
catch (_) { chromium = require('/opt/node22/lib/node_modules/playwright').chromium; }
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const base = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser;
(async () => {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const errors = [];
  for (const width of [320, 375, 390, 430, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    context.setDefaultTimeout(12000);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const brokenResources = [];
    page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) brokenResources.push(response.url()); });
    await page.goto(base + '/personal-vendas.html?zap=5531999990000');
    await page.locator('img[src]').evaluateAll(images => images.forEach(img => img.loading = 'eager'));
    await page.waitForFunction(() => Array.from(document.querySelectorAll('img[src]')).every(img => img.complete && img.naturalWidth));
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
    const ratios = await page.locator('.phone-shell img, .dashboard-device img').evaluateAll(images => images.map(img => Math.abs(img.clientWidth / img.clientHeight - img.naturalWidth / img.naturalHeight)));
    assert.equal(ratios.length, 3);
    assert(ratios.every(error => error < .003), `screen proportion at ${width}`);
    assert(await page.locator('[data-zap]').evaluateAll(items => items.length > 0 && items.every(a => a.href.startsWith('https://wa.me/5531999990000?text=') && a.rel.includes('noopener'))));
    assert(await page.locator('a[href^="#"]').evaluateAll(items => items.every(a => document.getElementById(a.getAttribute('href').slice(1)))));
    for (const href of ['personal.html', 'demo-personal.html', 'demo-aluno.html', 'privacidade.html']) {
      assert(await page.locator(`a[href="${href}"]`).count(), href);
    }
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://www.torqueon.com.br/personal-vendas.html');
    assert.equal(await page.locator('.price strong').textContent(), '49');
    assert.match(await page.locator('.hero-actions').innerText(), /14 dias grátis/);
    assert.match(await page.locator('.microproof').innerText(), /Sem cartão/);
    for (let i = 0; i < 7; i++) {
      await page.locator(`[data-feature="${i}"]`).click();
      await page.waitForFunction(index => {
        const button = document.querySelector(`[data-feature="${index}"]`);
        const tag = document.getElementById('feature-tag');
        const image = document.getElementById('feature-image');
        const names = ['Seu dia', 'Produto', 'Financeiro', 'Alunos', 'Atendimento', 'Avaliação', 'Agenda'];
        return button.getAttribute('aria-selected') === 'true' && tag.textContent === names[index] && image.complete && image.naturalWidth;
      }, i);
    }
    await page.locator('[data-feature="6"]').focus();
    await page.keyboard.press('Home');
    assert.equal(await page.locator('[data-feature="0"]').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-feature="1"]').getAttribute('aria-selected'), 'true');
    const studentFiles = ['app-fichas.webp', 'app-treino.webp', 'app-corrida.webp', 'app-conquistas.webp'];
    for (let i = 0; i < 4; i++) {
      await page.locator(`[data-student="${i}"]`).click();
      await page.waitForFunction(file => {
        const image = document.getElementById('student-image');
        return image.src.endsWith(file) && image.complete && image.naturalWidth;
      }, studentFiles[i]);
      assert.equal(await page.locator(`[data-student="${i}"]`).getAttribute('aria-selected'), 'true');
    }
    await page.locator('[data-student="3"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-student="0"]').getAttribute('aria-selected'), 'true');
    await page.locator('.faq summary').first().click();
    assert.notEqual(await page.locator('.faq details').first().getAttribute('open'), null);
    await page.locator('.faq summary').nth(1).click();
    await page.waitForFunction(() => document.querySelectorAll('.faq details[open]').length === 1);
    assert.notEqual(await page.locator('.faq details').nth(1).getAttribute('open'), null);
    await page.locator('video').scrollIntoViewIfNeeded();
    await page.locator('video').evaluate(video => video.play());
    await page.waitForFunction(() => document.querySelector('video').readyState >= 1);
    assert(await page.locator('video').evaluate(video => video.controls && !video.autoplay && video.videoWidth > 0));
    await page.locator('video').evaluate(video => video.pause());
    assert.deepEqual(brokenResources, []);
    console.log(`PASS ${width}px: proporções, navegação, departamentos, app do aluno, teclado, oferta, vídeo, FAQ e recursos`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/personal-vendas.html?zap=invalid');
  assert((await page.locator('[data-zap]').first().getAttribute('href')).startsWith('https://wa.me/5521994429198?'));
  await context.close();
  const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const fallback = await nojs.newPage();
  await fallback.goto(base + '/personal-vendas.html');
  assert(await fallback.locator('.hero-title').isVisible());
  assert(await fallback.locator('.price').isVisible());
  assert(await fallback.locator('.hero-actions a[href="personal.html"]').isVisible());
  await nojs.close();
  assert.deepEqual(errors, []);
  console.log('PASS WhatsApp inválido mantém padrão, conteúdo sem JavaScript e nenhum erro de execução');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
