/* A Home escolhe uma sessão útil sem transformar horários antigos em próximos.
 * Relógio fixo protege a virada do dia e torna os testes independentes da hora do CI.
 */
const assert = require('assert/strict');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser;

(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
  await context.route('**://*.supabase.co/**', route => route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-09-06T19:40:00-03:00'));
  await page.goto(BASE + '/demo-personal.html');
  await page.locator('#btnDemo').click();
  await page.waitForURL(/\/personal\.html/);
  await page.waitForFunction(() => window.__dashPT && window.__resolverChat);

  async function render(sessions) {
    await page.evaluate(sessions => {
      const S = window.MTStore, st = S.read('ptStudio', {});
      S.cloud = () => null;
      st.alunos = [
        { id: 'dash-ana', nome: 'Ana Primeiro', ativo: true },
        { id: 'dash-bruno', nome: 'Bruno Seguinte', ativo: true },
      ];
      st.sessoes = sessions;
      st.pagamentos = [];
      st.treinosV2 = {};
      st.config.zapFilaOff = true;
      st.config.dia1Off = true;
      S.write('ptStudio', st);
      window.__resolverChat.cache.porAluno = {};
      window.__resolverChat.cache.em = Date.now();
      window.__dashPT.render(st);
      document.querySelector('#abas [data-a="dash"]').click();
    }, sessions);
  }
  const session = (id, data, hora, extra = {}) => ({ id, data, hora, alunoId: 'dash-ana', ...extra });
  const old = [session('yesterday', '2026-09-05', '16:00'), session('boundary', '2026-09-06', '18:40')];
  const future = [session('later', '2026-09-07', '09:00'), session('tomorrow', '2026-09-07', '06:00', { alunoId: 'dash-bruno' })];

  await render([...old, ...future,
    session('ongoing', '2026-09-06', '18:41'),
    session('today', '2026-09-06', '20:10'),
    session('done', '2026-09-06', '19:41', { feita: true }),
    session('absent', '2026-09-06', '19:42', { faltou: true }),
    session('orphan', '2026-09-06', '19:43', { alunoId: 'missing-student' }),
  ]);
  assert.equal(await page.locator('#bHojeP [data-feita]').getAttribute('data-feita'), 'ongoing');
  assert.equal(await page.locator('#bHojeP .dh-session').count(), 1);
  assert.match(await page.locator('#bHojeP .dh-pending').innerText(), /2 sessões anteriores sem registro/);
  assert.equal(await page.locator('#vDash .dlinha').count(), 0);
  console.log('OK: só a próxima sessão, janela de 60 min e resumo das anteriores');

  await render([...old, ...future,
    session('done', '2026-09-06', '20:00', { feita: true }),
    session('absent', '2026-09-06', '20:10', { faltou: true }),
    session('bad-time', '2026-09-06', '25:99'),
    session('no-time', '2026-09-06', ''),
    session('orphan', '2026-09-06', '20:20', { alunoId: 'missing-student' }),
  ]);
  assert.equal(await page.locator('#bHojeP time').getAttribute('datetime'), '2026-09-07T06:00');
  assert.match(await page.locator('#bHojeP').innerText(), /Bruno Seguinte/);
  assert.equal(await page.locator('#bHojeP [data-feita],#bHojeP [data-faltou]').count(), 0);
  assert.equal(await page.locator('#dashMes .dh-kpi').count(), 4);
  console.log('OK: fim do dia mostra o próximo agendamento, sem registrar presença futura');

  await page.clock.setFixedTime(new Date('2026-09-07T00:05:00-03:00'));
  await render(future);
  assert.equal(await page.locator('#bHojeP [data-feita]').getAttribute('data-feita'), 'tomorrow');
  assert.match(await page.locator('#bHojeP .dh-session-date').innerText(), /Hoje/);
  console.log('OK: ao virar o dia, a sessão passa a admitir registro');

  await render([]);
  assert.match(await page.locator('#bHojeP').innerText(), /Nenhuma próxima sessão agendada/);
  assert.equal(await page.locator('#bHojeP time,#bHojeP [data-feita]').count(), 0);
  assert.equal(await page.locator('#dashZap').evaluate(el => el.open), false);
  assert.equal(await page.locator('#dashRadar').evaluate(el => el.open), false);
  await page.locator('#dashRadar > summary').click();
  await render([]);
  assert.equal(await page.locator('#dashRadar').evaluate(el => el.open), true);
  console.log('OK: estado vazio limpo e acompanhamento mantém a escolha de abrir');

  // Clique no texto interno do atalho: a delegação também precisa funcionar.
  await page.locator('#dMarcaSes span').click();
  assert.equal(await page.locator('#vAgenda').isVisible(), true);
  assert.equal(await page.locator('[data-agsec="agendar"]').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log('OK: Agendar abre o formulário diretamente, sem erros JavaScript');
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); });
