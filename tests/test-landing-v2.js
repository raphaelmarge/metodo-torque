// O visual aprovado conserva os caminhos e as interações da landing anterior.
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

async function imageReady(page, id, file) {
  await page.waitForFunction(({ id, file }) => {
    const image = document.getElementById(id);
    return image.complete && image.naturalWidth > 0 && (!file || image.src.endsWith(file));
  }, { id, file });
}

async function inspectScreen(page, imageId, closeButton = false) {
  const trigger = page.locator(`[data-inspect="${imageId}"]`).first();
  await imageReady(page, imageId);
  await trigger.click();
  await page.waitForFunction(() => document.getElementById('screenDialog').open);
  const source = await page.locator(`#${imageId}`).evaluate(img => ({ src: img.currentSrc || img.src, alt: img.alt }));
  await imageReady(page, 'screenDialogImage');
  assert.deepEqual(await page.locator('#screenDialogImage').evaluate(img => ({ src: img.src, alt: img.alt })), source);
  assert(await page.locator('#screenDialogImage').isVisible());
  await mobileCtaState(page, false);
  if (closeButton) await page.locator('#screenDialog [data-close-dialog]').click();
  else await page.keyboard.press('Escape');
  await page.waitForFunction(id => !document.getElementById('screenDialog').open && document.activeElement?.getAttribute('data-inspect') === id, imageId);
}

async function mobileCtaState(page, visible) {
  await page.waitForFunction(visible => document.getElementById('mobileCta').getAttribute('aria-hidden') === String(!visible), visible);
  assert.equal(await page.locator('#mobileCta').evaluate(el => el.inert), !visible);
  assert(await page.locator('#mobileCta a').evaluateAll((links, visible) => links.length > 0 && links.every(link => link.getAttribute('tabindex') === (visible ? '0' : '-1')), visible));
}

async function landingBrand(page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const tokens = ['--bg', '--bg-deep', '--surface', '--surface-2', '--text', '--muted', '--violet', '--violet-bright', '--violet-electric', '--green', '--red'];
    return {
      palette: Object.fromEntries(tokens.map(token => [token, root.getPropertyValue(token)])),
      logo: getComputedStyle(document.querySelector('.topbar .brand strong')).color,
      headline: getComputedStyle(document.querySelector('.hero-title .violet')).color,
      background: getComputedStyle(document.body).backgroundColor
    };
  });
}

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
    await page.locator('img[src]:not([src=""])').evaluateAll(images => images.forEach(img => img.loading = 'eager'));
    await page.waitForFunction(() => Array.from(document.querySelectorAll('img[src]:not([src=""])')).every(img => img.complete && img.naturalWidth));
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
    const ratios = await page.locator('.phone-shell img, .dashboard-device img, #journey-image').evaluateAll(images => images.filter(img => img.clientWidth && img.clientHeight).map(img => Math.abs(img.clientWidth / img.clientHeight - img.naturalWidth / img.naturalHeight)));
    assert(ratios.length >= 3, 'as telas reais continuam presentes');
    assert(ratios.every(error => error < .003), `screen proportion at ${width}`);
    assert(await page.locator('[data-zap]').evaluateAll(items => items.length > 0 && items.every(a => a.href.startsWith('https://wa.me/5531999990000?text=') && a.rel.includes('noopener') && a.rel.includes('noreferrer'))));
    assert(await page.locator('a[href^="#"]').evaluateAll(items => items.every(a => document.getElementById(a.getAttribute('href').slice(1)))));
    for (const href of ['personal.html', 'demo-personal.html', 'demo-aluno.html', 'privacidade.html', 'torqueon.html']) {
      assert(await page.locator(`a[href="${href}"]`).count(), href);
    }
    for (const id of ['app', 'recursos', 'sobre', 'duvidas', 'sua-marca', 'journey']) assert.equal(await page.locator(`[id="${id}"]`).count(), 1, `âncora antiga ${id}`);
    assert(await page.locator('a[href="demo-personal.html"], a[href="demo-aluno.html"]').evaluateAll(links => links.every(link => link.target === '_blank' && link.rel.includes('noopener') && link.rel.includes('noreferrer'))));
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://www.torqueon.com.br/personal-vendas.html');
    assert.equal(await page.locator('.price strong').textContent(), '49');
    assert.match(await page.locator('.hero-actions').innerText(), /14 dias grátis/);
    assert.match(await page.locator('.microproof').innerText(), /Sem cartão/);
    assert(await page.locator('html').evaluate(el => el.classList.contains('motion-off')), 'respeita reduzir movimento');

    if (width <= 860) {
      await mobileCtaState(page, false);
      await page.locator('#menuToggle').click();
      assert.equal(await page.locator('#menuToggle').getAttribute('aria-expanded'), 'true');
      assert(await page.locator('#mainNav').isVisible());
      await mobileCtaState(page, false);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#menuToggle').getAttribute('aria-expanded'), 'false');
      assert(!await page.locator('#mainNav').isVisible());
      await page.locator('#menuToggle').click();
      await page.locator('#mainNav a[href^="#"]').first().click();
      assert.equal(await page.locator('#menuToggle').getAttribute('aria-expanded'), 'false');
      assert(!await page.locator('#mainNav').isVisible());
      await page.locator('#menuToggle').click();
      // Um clique fora do cabeçalho encerra o menu sem bloquear a página.
      await page.mouse.click(8, 800);
      assert.equal(await page.locator('#menuToggle').getAttribute('aria-expanded'), 'false');
    }

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
    await page.keyboard.press('End');
    assert.equal(await page.locator('[data-feature="6"]').getAttribute('aria-selected'), 'true');
    await inspectScreen(page, 'feature-image', true);

    const studentFiles = ['app-fichas.webp', 'app-treino.webp', 'app-corrida.webp', 'app-conquistas.webp', 'app-wod.webp'];
    for (let i = 0; i < studentFiles.length; i++) {
      await page.locator(`[data-student="${i}"]`).click();
      await imageReady(page, 'student-image', studentFiles[i]);
      assert.equal(await page.locator(`[data-student="${i}"]`).getAttribute('aria-selected'), 'true');
      assert.match(await page.locator('#tourNumber').innerText(), new RegExp(`0${i + 1}\\s*/\\s*05`));
      await inspectScreen(page, 'student-image');
    }
    await page.locator('#tourNext').click();
    await imageReady(page, 'student-image', studentFiles[0]);
    assert.match(await page.locator('#tourNumber').innerText(), /01\s*\/\s*05/);
    await page.locator('#tourPrev').click();
    await imageReady(page, 'student-image', studentFiles[4]);
    assert.match(await page.locator('#tourNumber').innerText(), /05\s*\/\s*05/);
    await page.locator('[data-student="4"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-student="0"]').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await page.locator('[data-student="4"]').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await page.locator('[data-student="0"]').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-student="1"]').getAttribute('aria-selected'), 'true');

    const journeyFiles = ['painel-treinos.webp', 'app-inicio-novo.webp', 'painel-inicio.webp'];
    for (let i = 0; i < journeyFiles.length; i++) {
      await page.locator(`[data-scene="${i}"]`).click();
      await imageReady(page, 'journey-image', journeyFiles[i]);
      assert(await page.locator(`#story${i}`).isVisible());
      assert(await page.locator(`#scene${i}`).evaluate(el => el.classList.contains('active')));
      assert.equal(await page.locator(`[data-scene="${i}"]`).getAttribute('aria-pressed'), 'true');
    }
    await inspectScreen(page, 'journey-image');
    await inspectScreen(page, 'hero-image');

    await page.locator('#studioName').fill('TORQUE STUDIO');
    assert.equal(await page.locator('#studioPreview').textContent(), 'TORQUE STUDIO');
    assert.equal(await page.locator('#studioName').getAttribute('maxlength'), '32');
    const unsafeName = '<img src=x onerror=alert(1)>';
    await page.locator('#studioName').fill(unsafeName);
    assert.equal(await page.locator('#studioPreview').textContent(), unsafeName);
    assert.equal(await page.locator('#studioPreview img').count(), 0);
    await page.locator('#studioName').fill('');
    assert.equal(await page.locator('#studioPreview').textContent(), 'Seu nome');
    if (width <= 860) await mobileCtaState(page, false);
    const originalBrand = await landingBrand(page);
    const oldBrandColor = await page.locator('.brand-preview').evaluate(el => getComputedStyle(el).getPropertyValue('--brand-color').trim());
    await page.locator('.swatch[aria-label="Verde"]').click();
    assert.equal(await page.locator('.swatch[aria-pressed="true"]').count(), 1);
    assert.equal(await page.locator('.swatch[aria-label="Verde"]').getAttribute('aria-pressed'), 'true');
    const newBrandColor = await page.locator('.brand-preview').evaluate(el => getComputedStyle(el).getPropertyValue('--brand-color').trim());
    assert(newBrandColor && newBrandColor !== oldBrandColor, 'a cor muda na prévia');
    assert.deepEqual(await landingBrand(page), originalBrand, 'a prévia não altera as cores, a marca ou o fundo da landing');

    assert.equal(await page.locator('#studentRange').getAttribute('min'), '5');
    assert.equal(await page.locator('#studentRange').getAttribute('max'), '200');
    assert.equal(await page.locator('#studentRange').getAttribute('step'), '5');
    await page.locator('#studentRange').focus();
    await page.keyboard.press('End');
    assert.match(await page.locator('#studentCount').innerText(), /200/);
    assert.match(await page.locator('#sliderCaption').innerText(), /R\$\s*49\/mês/);
    assert.equal(await page.locator('.price strong').textContent(), '49');
    await page.keyboard.press('Home');
    assert.match(await page.locator('#studentCount').innerText(), /\b5\b/);
    assert.match(await page.locator('#sliderCaption').innerText(), /R\$\s*49\/mês/);

    if (width <= 860) {
      await page.locator('#journey h2').click();
      await mobileCtaState(page, true);
      await page.locator('#menuToggle').click();
      await mobileCtaState(page, false);
      await page.keyboard.press('Escape');
      await mobileCtaState(page, true);
      await page.locator('#preco').evaluate(el => el.scrollIntoView({ behavior: 'instant', block: 'start' }));
      await mobileCtaState(page, false);
    }
    await page.locator('.faq summary').first().click();
    assert.notEqual(await page.locator('.faq details').first().getAttribute('open'), null);
    await page.locator('.faq summary').nth(1).click();
    await page.waitForFunction(() => document.querySelectorAll('.faq details[open]').length === 1);
    assert.notEqual(await page.locator('.faq details').nth(1).getAttribute('open'), null);

    const inlineVideoParent = await page.locator('#productVideo').evaluateHandle(video => video.parentElement);
    await page.locator('#openVideo').click();
    assert(await page.locator('#videoDialog').isVisible());
    assert.equal(await page.locator('#videoDialog #productVideo').count(), 1);
    await mobileCtaState(page, false);
    await page.locator('#productVideo').evaluate(video => video.play());
    await page.waitForFunction(() => document.getElementById('productVideo').readyState >= 1);
    assert(await page.locator('#productVideo').evaluate(video => video.controls && !video.autoplay && video.videoWidth > 0));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('videoDialog').open && document.getElementById('productVideo').paused && document.activeElement === document.getElementById('openVideo'));
    assert(await page.locator('#productVideo').evaluate((video, parent) => video.parentElement === parent, inlineVideoParent), 'o vídeo volta ao local original');
    assert.equal(await page.locator('#productVideo').count(), 1, 'não duplica o player');
    await inlineVideoParent.dispose();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow após interações at ${width}`);
    assert.deepEqual(brokenResources, []);
    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.goto(base + '/personal-vendas.html');
      await page.locator('img[src]:not([src=""])').evaluateAll(images => images.forEach(img => img.loading = 'eager'));
      await page.waitForFunction(() => Array.from(document.querySelectorAll('img[src]:not([src=""])')).every(img => img.complete && img.naturalWidth));
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(screenshotDir, `landing-${width}.png`), fullPage: true });
    }
    console.log(`PASS ${width}px: proporções, navegação, tours, ampliação, marca, preço, movimento, vídeo, FAQ e recursos`);
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  context.setDefaultTimeout(12000);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  for (const number of ['invalid', '123', '1234567890123456']) {
    await page.goto(base + '/personal-vendas.html?zap=' + number);
    assert(await page.locator('[data-zap]').evaluateAll(links => links.every(link => link.href.startsWith('https://wa.me/5521994429198?') && link.rel.includes('noopener') && link.rel.includes('noreferrer'))));
  }
  await page.locator('#story1').evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('[data-scene="1"]').getAttribute('aria-pressed') === 'true');
  await imageReady(page, 'journey-image', 'app-inicio-novo.webp');
  assert(!await page.locator('html').evaluate(el => el.classList.contains('motion-off')));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.documentElement.classList.contains('motion-off'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('motion-off'));
  await page.locator('#motionToggle').click();
  assert.equal(await page.locator('#motionToggle').getAttribute('aria-pressed'), 'true');
  assert(await page.locator('html').evaluate(el => el.classList.contains('motion-off')));
  await page.reload();
  assert(await page.locator('html').evaluate(el => el.classList.contains('motion-off')), 'pausa continua ao recarregar');
  assert.equal(await page.locator('#motionToggle').getAttribute('aria-pressed'), 'true');
  await page.locator('#motionToggle').click();
  assert.equal(await page.locator('#motionToggle').getAttribute('aria-pressed'), 'false');
  assert(!await page.locator('html').evaluate(el => el.classList.contains('motion-off')));
  await context.close();

  const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const fallback = await nojs.newPage();
  await fallback.goto(base + '/personal-vendas.html');
  assert(await fallback.locator('.hero-title').isVisible());
  assert(await fallback.locator('.price').isVisible());
  assert(await fallback.locator('.hero-actions a[href="personal.html"]').isVisible());
  assert(await fallback.locator('a[href="demo-personal.html"]').first().isVisible());
  assert(await fallback.locator('#journey').isVisible());
  assert(await fallback.locator('#productVideo').evaluate(video => video.controls && !video.autoplay));
  await nojs.close();
  assert.deepEqual(errors, []);
  console.log('PASS jornada por rolagem, preferência de movimento em runtime, pausa persistida, WhatsApp inválido, conteúdo sem JavaScript e nenhum erro de execução');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
