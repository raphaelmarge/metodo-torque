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
const currentScreens = '/assets/vendas/atual-20261006/';
let browser;

async function imageReady(page, id, file) {
  await page.waitForFunction(({ id, file }) => {
    const image = document.getElementById(id);
    return image.complete && image.naturalWidth > 0 && (!file || image.src.endsWith(file));
  }, { id, file });
}

async function currentScreen(page, id, file, width) {
  await imageReady(page, id, file);
  const screen = await page.locator(`#${id}`).evaluate(img => {
    return {
      path: new URL(img.currentSrc || img.src).pathname,
      naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
      width: img.clientWidth, height: img.clientHeight,
      fit: getComputedStyle(img).objectFit,
      alt: img.alt
    };
  });
  assert.equal(screen.path, currentScreens + file, `captura atual de ${id}`);
  assert(screen.naturalWidth >= 390 && screen.naturalHeight >= 600, `resolução real de ${id}`);
  assert(screen.width > 0 && screen.height > 0, `captura ${id} visível em ${width}px`);
  assert(Math.abs(screen.width / screen.height - screen.naturalWidth / screen.naturalHeight) < .003, `proporção de ${id} em ${width}px`);
  assert.equal(screen.fit, 'contain', `captura completa sem corte: ${id}`);
  assert(screen.alt.trim().length > 15, `descrição acessível de ${id}`);
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
  await page.waitForFunction(visible => {
    const cta = document.getElementById('mobileCta');
    const links = Array.from(cta.querySelectorAll('a'));
    return cta.getAttribute('aria-hidden') === String(!visible) &&
      cta.inert === !visible && links.length > 0 &&
      links.every(link => link.getAttribute('tabindex') === (visible ? '0' : '-1'));
  }, visible);
  assert.equal(await page.locator('#mobileCta').evaluate(el => el.inert), !visible);
  assert(await page.locator('#mobileCta a').evaluateAll((links, visible) => links.length > 0 && links.every(link => link.getAttribute('tabindex') === (visible ? '0' : '-1')), visible));
}

async function editStudioName(page, value, preview) {
  const input = page.locator('#studioName');
  // Usa a edição por teclado: fill() deixou texto parcial ou não limpou no Chromium do CI.
  await input.click();
  await input.press('ControlOrMeta+A');
  await input.press('Backspace');
  if (value) await input.pressSequentially(value);
  await page.waitForFunction(({ value, preview }) =>
    document.getElementById('studioName').value === value &&
    document.getElementById('studioPreview').textContent === preview,
  { value, preview });
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

async function salesClarity(page, width, initialViewport = true) {
  const actions = page.locator('.hero-actions a, .hero-actions button');
  assert.equal(await actions.count(), 2, 'o topo oferece somente teste grátis e demonstração');
  const trial = page.locator('.hero-actions [data-personal-trial]');
  assert.equal(await trial.count(), 1, 'o teste grátis é uma ação única no topo');
  assert.match(await trial.innerText(), /14 dias grátis/i);
  assert(await trial.evaluate(link => {
    const url = new URL(link.href);
    return url.pathname.endsWith('/personal.html') && url.searchParams.get('entrada') === 'criar';
  }), 'o teste grátis abre o cadastro existente');
  const demo = page.locator('.hero-actions a:not([data-personal-trial])');
  assert.equal(await demo.count(), 1, 'a segunda ação apresenta a demonstração');
  assert.match(await demo.innerText(), /demonstração|ver o sistema/i);
  assert(await demo.evaluate(link => {
    const url = new URL(link.href);
    return url.pathname.endsWith('/demo-personal.html') ||
      (url.pathname === location.pathname && url.hash === '#filme');
  }), 'a demonstração leva ao painel ou ao vídeo existente');
  assert.equal(await page.locator('.hero-actions a[data-sales-link]').count(), 0, 'a assinatura permanece fora da escolha inicial');

  const heroText = await page.locator('.hero-copy').innerText();
  assert.match(heroText, /14 dias grátis/i);
  assert.match(heroText, /sem cartão/i);
  const offer = await page.locator('.hero-copy').evaluate(root => {
    const price = /R\$\s*49,90\s*(?:\/\s*mês|por mês|mensais)/i;
    const candidates = Array.from(root.querySelectorAll('*')).filter(el => price.test(el.textContent));
    const el = candidates.find(el => !Array.from(el.children).some(child => price.test(child.textContent)));
    if (!el) return null;
    const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
    return {
      rendered: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
      top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left,
      viewportHeight: innerHeight
    };
  });
  assert(offer && offer.rendered, `a mensalidade está apresentada no topo em ${width}px`);
  assert(offer.left >= -1 && offer.right <= width + 1, `o preço do topo cabe na largura de ${width}px`);
  if (initialViewport) {
    assert(offer.top >= 0 && offer.bottom <= offer.viewportHeight, `o preço aparece sem rolar em ${width}px`);
    assert(await actions.evaluateAll(items => items.every(el => {
      const r = el.getBoundingClientRect();
      return r.width >= 44 && r.height >= 44 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight;
    })), `as duas ações cabem na primeira tela e têm área de toque em ${width}px`);
  }

  assert(await page.evaluate(() => {
    const video = document.getElementById('filme'), brand = document.getElementById('sua-marca'), system = document.getElementById('sistema');
    return !!(video && brand && system &&
      (video.compareDocumentPosition(system) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (brand.compareDocumentPosition(system) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      video.getBoundingClientRect().top < system.getBoundingClientRect().top &&
      brand.getBoundingClientRect().top < system.getBoundingClientRect().top);
  }), 'vídeo e personalização aparecem antes do tour detalhado do sistema');
  const about = page.locator('section#sobre');
  assert.equal(await about.count(), 1, 'Sobre é uma seção de conteúdo, não uma âncora vazia');
  assert(await about.isVisible(), 'a seção Sobre está disponível');
  assert(await about.locator('h2').count(), 'Sobre tem título próprio');
  assert.match(await about.innerText(), /TORQUE PERSONAL/);
  assert.match(await about.innerText(), /suporte|equipe|atendimento/i);
  assert.match(await about.innerText(), /14 dias|sem fidelidade|cancel/i);
  assert(await about.locator('a[data-zap]').isVisible(), 'Sobre oferece contato com a equipe');
  assert(await about.locator('a[href="privacidade.html"]').isVisible(), 'Sobre permite consultar a política de privacidade');
  const comparison = page.getByText(/O que você deixa para trás/i);
  assert.equal(await comparison.count(), 1, 'a comparação explica o que o profissional deixa para trás');
  assert(await comparison.isVisible());
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
    await salesClarity(page, width);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
    const ratios = await page.locator('.phone-shell img, .dashboard-device img, #journey-image').evaluateAll(images => images.filter(img => img.clientWidth && img.clientHeight).map(img => Math.abs(img.clientWidth / img.clientHeight - img.naturalWidth / img.naturalHeight)));
    assert(ratios.length >= 3, 'as telas reais continuam presentes');
    assert(ratios.every(error => error < .003), `screen proportion at ${width}`);
    assert(await page.locator('[data-zap]').evaluateAll(items => items.length > 0 && items.every(a => a.href.startsWith('https://wa.me/5531999990000?text=') && a.rel.includes('noopener') && a.rel.includes('noreferrer'))));
    assert(await page.locator('a[href^="#"]').evaluateAll(items => items.every(a => document.getElementById(a.getAttribute('href').slice(1)))));
    for (const href of ['personal.html', 'demo-personal.html', 'demo-aluno.html', 'privacidade.html', 'torqueon.html']) {
      assert(await page.locator(`a[href="${href}"]`).count(), href);
    }
    for (const id of ['app', 'recursos', 'sobre', 'duvidas', 'sua-marca', 'journey', 'nutricao']) assert.equal(await page.locator(`[id="${id}"]`).count(), 1, `âncora preservada ou adicionada ${id}`);
    assert(await page.locator('a[href="demo-personal.html"], a[href="demo-aluno.html"]').evaluateAll(links => links.every(link => link.target === '_blank' && link.rel.includes('noopener') && link.rel.includes('noreferrer'))));
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://www.torqueon.com.br/personal-vendas.html');
    assert.equal(await page.locator('.price strong').textContent(), '49,90');
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

    const featureFiles = ['painel-inicio.webp', 'painel-treinos.webp', 'painel-financeiro.webp', 'painel-alunos.webp', 'painel-chat.webp', 'painel-avaliacao.webp', 'painel-agenda.webp', 'painel-nutricao.webp'];
    assert.equal(await page.locator('[data-feature]').count(), featureFiles.length);
    for (let i = 0; i < featureFiles.length; i++) {
      await page.locator(`[data-feature="${i}"]`).click();
      await page.waitForFunction(index => {
        const button = document.querySelector(`[data-feature="${index}"]`);
        const tag = document.getElementById('feature-tag');
        const image = document.getElementById('feature-image');
        const names = ['Seu dia', 'Treinos', 'Financeiro', 'Alunos', 'Atendimento', 'Avaliação', 'Agenda', 'Nutrição'];
        return button.getAttribute('aria-selected') === 'true' && tag.textContent === names[index] && image.complete && image.naturalWidth;
      }, i);
      await currentScreen(page, 'feature-image', featureFiles[i], width);
    }
    await page.locator('[data-feature="7"]').focus();
    await page.keyboard.press('Home');
    assert.equal(await page.locator('[data-feature="0"]').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-feature="1"]').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await page.locator('[data-feature="7"]').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-feature="0"]').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('[data-feature="7"]').getAttribute('aria-selected'), 'true');
    await inspectScreen(page, 'feature-image', true);

    const studentFiles = ['app-fichas.webp', 'app-treino.webp', 'app-corrida.webp', 'app-conquistas.webp', 'app-wod.webp', 'app-alimentacao.webp'];
    assert.equal(await page.locator('[data-student]').count(), studentFiles.length);
    for (let i = 0; i < studentFiles.length; i++) {
      await page.locator(`[data-student="${i}"]`).click();
      await currentScreen(page, 'student-image', studentFiles[i], width);
      assert.equal(await page.locator(`[data-student="${i}"]`).getAttribute('aria-selected'), 'true');
      assert.match(await page.locator('#tourNumber').innerText(), new RegExp(`0${i + 1}\\s*/\\s*06`));
      await inspectScreen(page, 'student-image');
    }
    await page.locator('#tourNext').click();
    await imageReady(page, 'student-image', studentFiles[0]);
    assert.match(await page.locator('#tourNumber').innerText(), /01\s*\/\s*06/);
    await page.locator('#tourPrev').click();
    await imageReady(page, 'student-image', studentFiles[5]);
    assert.match(await page.locator('#tourNumber').innerText(), /06\s*\/\s*06/);
    await page.locator('[data-student="5"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-student="0"]').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await page.locator('[data-student="5"]').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await page.locator('[data-student="0"]').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-student="1"]').getAttribute('aria-selected'), 'true');

    const journeyFiles = ['painel-treinos.webp', 'app-inicio-pernas.webp', 'painel-inicio.webp'];
    for (let i = 0; i < journeyFiles.length; i++) {
      await page.locator(`[data-scene="${i}"]`).click();
      await currentScreen(page, 'journey-image', journeyFiles[i], width);
      assert(await page.locator(`#story${i}`).isVisible());
      assert(await page.locator(`#scene${i}`).evaluate(el => el.classList.contains('active')));
      assert.equal(await page.locator(`[data-scene="${i}"]`).getAttribute('aria-pressed'), 'true');
    }
    await inspectScreen(page, 'journey-image');
    await currentScreen(page, 'hero-image', 'app-inicio-pernas.webp', width);
    await inspectScreen(page, 'hero-image');

    const nutrition = page.locator('#nutricao');
    assert(await nutrition.isVisible(), `nutrição visível em ${width}px`);
    assert.match(await nutrition.innerText(), /plano alimentar/i);
    assert.match(await nutrition.innerText(), /receitas/i);
    assert.match(await nutrition.innerText(), /compras/i);
    for (const href of ['demo-personal.html', 'demo-aluno.html']) {
      assert(await nutrition.locator(`a[href="${href}"]`).isVisible(), `demonstração da nutrição: ${href}`);
    }
    for (const [id, file] of [['nutrition-panel-image', 'painel-nutricao.webp'], ['nutrition-student-image', 'app-alimentacao.webp']]) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await currentScreen(page, id, file, width);
      const geometry = await page.locator(`#${id}`).boundingBox();
      assert(geometry.width >= 240 && geometry.height >= 240, `nutrição com imagem legível: ${id} em ${width}px`);
      assert(geometry.x >= -1 && geometry.x + geometry.width <= width + 1, `nutrição dentro da tela: ${id} em ${width}px`);
      assert.equal(await nutrition.locator(`[data-inspect="${id}"]`).count(), 1);
      await inspectScreen(page, id, id === 'nutrition-panel-image');
    }

    await editStudioName(page, 'TORQUE STUDIO', 'TORQUE STUDIO');
    assert.equal(await page.locator('#studioPreview').textContent(), 'TORQUE STUDIO');
    assert.equal(await page.locator('#studioName').getAttribute('maxlength'), '32');
    const unsafeName = '<img src=x onerror=alert(1)>';
    await editStudioName(page, unsafeName, unsafeName);
    assert.equal(await page.locator('#studioPreview').textContent(), unsafeName);
    assert.equal(await page.locator('#studioPreview img').count(), 0);
    await editStudioName(page, '', 'Seu nome');
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
    assert.match(await page.locator('#sliderCaption').innerText(), /R\$\s*49,90\/mês/);
    assert.equal(await page.locator('.price strong').textContent(), '49,90');
    await page.keyboard.press('Home');
    assert.match(await page.locator('#studentCount').innerText(), /\b5\b/);
    assert.match(await page.locator('#sliderCaption').innerText(), /R\$\s*49,90\/mês/);

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
    const nutritionFaq = page.locator('.faq details').filter({ has: page.locator('summary').filter({ hasText: /nutrição|alimentação/i }) });
    assert.equal(await nutritionFaq.count(), 1, 'FAQ específico da nutrição');
    await nutritionFaq.locator('summary').click();
    await page.waitForFunction(() => document.querySelectorAll('.faq details[open]').length === 1);
    assert.notEqual(await nutritionFaq.getAttribute('open'), null);
    assert.match(await nutritionFaq.innerText(), /profissional|responsável/i);
    assert.match(await nutritionFaq.innerText(), /plano|refeições|registros/i);

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
    console.log(`PASS ${width}px: capturas atuais, proporções, navegação, tours, nutrição, ampliação, marca, preço, movimento, vídeo, FAQ e recursos`);
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
  await imageReady(page, 'journey-image', 'app-inicio-pernas.webp');
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
  await salesClarity(fallback, 390, false);
  assert(await fallback.locator('.hero-title').isVisible());
  assert(await fallback.locator('.price').isVisible());
  assert(await fallback.locator('.hero-actions a[href="personal.html?entrada=criar"]').isVisible());
  assert(await fallback.locator('a[href="demo-personal.html"]').first().isVisible());
  assert(await fallback.locator('#journey').isVisible());
  assert(await fallback.locator('#nutricao').isVisible());
  assert.match(await fallback.locator('#nutricao').innerText(), /plano alimentar/i);
  for (const href of ['demo-personal.html', 'demo-aluno.html']) assert(await fallback.locator(`#nutricao a[href="${href}"]`).isVisible());
  for (const [id, file] of [['nutrition-panel-image', 'painel-nutricao.webp'], ['nutrition-student-image', 'app-alimentacao.webp']]) {
    await fallback.locator(`#${id}`).scrollIntoViewIfNeeded();
    await currentScreen(fallback, id, file, 390);
  }
  assert(await fallback.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'nutrição sem JavaScript não cria rolagem lateral');
  assert(await fallback.locator('#productVideo').evaluate(video => video.controls && !video.autoplay));
  await nojs.close();
  assert.deepEqual(errors, []);
  console.log('PASS jornada por rolagem, preferência de movimento em runtime, pausa persistida, WhatsApp inválido, conteúdo sem JavaScript e nenhum erro de execução');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
