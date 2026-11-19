/* Exercita a marca salva no painel e consumida pelo documento real do aluno. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { ({ chromium } = require('./ci/node_modules/playwright')); }

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const personalIcons = {
  dash: 'inicio', alunos: 'alunos', agenda: 'agenda', pagamentos: 'financeiro',
  treinos: 'treinos', chat: 'chat', nutricao: 'nutricao', avaliacoes: 'avaliacoes',
  quest: 'questionarios', desafio: 'desafio', relatorios: 'relatorios',
  assessoria: 'assessoria', sitepro: 'minha-pagina', config: 'configuracoes',
  pers: 'personalizacao', imagens: 'imagens', conta: 'sua-ilha', ajuda: 'ajuda',
};

function luminance(rgb) {
  const values = rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
}

async function readIcon(locator) {
  return locator.evaluate(svg => {
    const rgb = s => s.match(/[\d.]+/g).map(Number);
    const paints = Array.from(svg.children, layer => rgb(getComputedStyle(layer).stroke).slice(0, 3));
    const layers = [];
    for (let e = svg.parentElement; e; e = e.parentElement) {
      layers.push(rgb(getComputedStyle(e).backgroundColor));
    }
    const background = layers.reverse().reduce((under, [r, g, b, alpha = 1]) =>
      [r, g, b].map((c, i) => c * alpha + under[i] * (1 - alpha)), [255, 255, 255]);
    return { paints, background };
  });
}

function assertColors({ paints, background }, label) {
  assert.equal(paints.length, 2, label);
  assert.notDeepEqual(paints[0], paints[1], label + ' tem duas tintas distintas');
  const bg = luminance(background);
  for (const color of paints) {
    const fg = luminance(color);
    const contrast = (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
    assert.ok(contrast >= 3, label + ' tem contraste de ' + contrast.toFixed(2));
  }
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined),
    args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(BASE).origin
      ? route.continue() : route.abort());
    const personal = await context.newPage();
    await personal.goto(BASE + '/demo-personal.html');
    await personal.locator('#btnDemo').click();
    await personal.waitForURL(/personal\.html/);
    await personal.waitForSelector('#abas .torque-one-icon');

    const mismatches = await personal.evaluate(expected => {
      return Array.from(document.querySelectorAll('#abas button[data-a]')).filter(button => {
        const reference = document.createElement('div');
        reference.innerHTML = TorqueOneIcons.render(expected[button.dataset.a], 16);
        return button.querySelector('svg')?.innerHTML !== reference.querySelector('svg')?.innerHTML;
      }).map(button => button.dataset.a);
    }, personalIcons);
    assert.deepEqual(mismatches, [], 'as rotas do painel usam os símbolos correspondentes');
    assert.equal(await personal.locator('#abas [data-a] svg.torque-one-icon[aria-hidden=true]').count(), 18);
    assert.equal(await personal.locator('#navPt button svg.torque-one-icon[aria-hidden=true]').count(), 5);

    const student = await context.newPage();
    let generated;
    await student.route('**/__aluno-icones', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: generated }));
    await student.addInitScript(() => {
      localStorage.setItem('ptonb', JSON.stringify({ feito: true }));
      localStorage.setItem('pttour', JSON.stringify({ como: 'teste' }));
      localStorage.removeItem('pttema');
    });
    await student.setViewportSize({ width: 390, height: 844 });
    for (const brand of ['#137b71', '#cf3864', '#ffffff', '#000000']) {
      // O mesmo evento do seletor de cores salva a marca e recalcula as paletas.
      await personal.locator('#cfgCor').evaluate((input, value) => {
        input.value = value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, brand);
      await personal.waitForFunction(value => __loadPT().config.cor === value, brand);
      generated = await personal.evaluate(() => MT_APP_ALUNO.monta(__dadosApp(__loadPT().alunos[0], new Date().toISOString())));
      await student.goto(BASE + '/__aluno-icones');
      const nav = student.locator('#navApp [data-msec=treino] .torque-one-icon');
      await nav.waitFor();
      const result = await student.locator('#navApp button').evaluateAll(buttons =>
        buttons.every(button => button.querySelector('svg.torque-one-icon[aria-hidden=true]')));
      assert.ok(result, 'cada botão visível do aluno possui um ícone decorativo');
      for (const light of [false, true]) {
        const currentLight = await personal.evaluate(() => document.documentElement.dataset.tema === 'claro');
        if (currentLight !== light) await personal.locator('#btnTemaPt').click();
        if (light) {
          await student.locator('#navMenuApp').click();
          await student.locator('#btnTemaApp').click();
          assert.ok(await student.locator('html').evaluate(el => el.classList.contains('claro')));
        }
        const trainerColors = await readIcon(personal.locator('#abas [data-a=alunos] .torque-one-icon'));
        const studentColors = await readIcon(nav);
        const theme = light ? 'claro' : 'escuro';
        for (const [where, colors] of [['painel', trainerColors], ['aluno', studentColors]]) {
          const label = where + ', ' + brand + ', ' + theme;
          assertColors(colors, label);
          const [r, g, b] = colors.paints[1];
          if (brand === '#137b71') assert.ok(g > r && g > b, label + ' conserva a marca verde');
          if (brand === '#cf3864') assert.ok(r > g && r > b, label + ' conserva a marca rosa');
        }
      }
    }
    await personal.setViewportSize({ width: 390, height: 844 });
    await personal.locator('#navPt [data-nav=agenda]').click();
    assert.ok(await personal.locator('#vAgenda').isVisible(), 'a navegação móvel preserva a rota Agenda');
    console.log('Ícones conferidos no painel e no app do aluno, em quatro marcas e dois temas.');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
