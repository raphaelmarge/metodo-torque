/* Primeiro uso: fixture isolada, sem clientes ou chamadas de produção. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let playwright;
try { playwright = require('./ci/node_modules/playwright'); }
catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; playwright = require(process.env.TORQUE_PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright'); }
const { comMockNuvem } = require('./_nuvem.js');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
let browser, checks = 0;
const ok = (v, label) => { assert.ok(v, label); checks++; console.log('OK ' + label); };
const eq = (v, expected, label) => { assert.deepEqual(v, expected, label); checks++; console.log('OK ' + label); };
(async () => {
  browser = comMockNuvem(await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'pt-BR' });
  await ctx.route('**/*', route => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.abort('blockedbyclient'));
  await ctx.addInitScript(() => {
    localStorage.setItem('mtapp:ptSemConta', '1');
    localStorage.setItem('mtapp:perfil', JSON.stringify({ nome: 'Teste isolado' }));
  });
  const p = await ctx.newPage(), errors = [], messages = [];
  p.on('request', r => { if (/push-envia|envia-email|wa\.me/.test(r.url())) messages.push(r.url()); });
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => d.dismiss());
  await p.goto(BASE + '/personal.html');
  await p.waitForFunction(() => window.__ptStudio && window.__dia1Estado);
  await p.fill('#obNome', 'Personal fictício'); await p.click('#obOk');
  ok(await p.locator('#obP4').isVisible() && await p.locator('#obP2').isHidden(), 'Aluno é a primeira ação, antes de cobrança e Pix');
  await p.evaluate(() => {
    window.__primeiroCalls = [];
    const cloud = window.mockNuvem({ aid: 'academia-ficticia', auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'fixture-sem-credencial-real' } } }) }, rpc: (name, args) => {
      window.__primeiroCalls.push({ name, args }); return Promise.resolve({ data: { ok: true }, error: null });
    } });
    window.MTStore.cloud = () => cloud; window.mockPublicacaoCas(cloud);
    window.MT_FUNCAO.chama = (client, name) => { window.__primeiroCalls.push({ name }); return Promise.resolve({ ok: true }); };
    const st = window.MTStore.read('ptStudio', {});
    st.config.onboardingConsultoria = { ativo: true, contratoAtivo: true };
    window.MTStore.write('ptStudio', st);
  });
  await p.click('#obP4Aluno');
  ok(await p.locator('#naDadosComerciais').evaluate(e => !e.open), 'CPF e endereço permanecem disponíveis em área opcional');
  await p.waitForFunction(() => !document.getElementById('naOnboardingBox').hidden);
  ok(!await p.locator('#naOnboarding').isChecked(), 'Contrato ativo na configuração não bloqueia automaticamente o aluno novo');
  await p.fill('#aNome', 'Aluno fictício'); await p.fill('#aEmail', 'aluno@example.invalid');
  await p.evaluate(() => { window.__primeiroWrite = window.MTStore.write; window.MTStore.write = (key, v) => key === 'ptStudio' ? false : window.__primeiroWrite(key, v); });
  await p.click('#aAdd');
  ok(await p.locator('#naCadastroStatus').innerText().then(t => /Não foi possível salvar/.test(t)), 'Falha local mantém o cadastro pendente e visível');
  eq(await p.locator('#aNome').inputValue(), 'Aluno fictício', 'Falha mantém os campos preenchidos');
  eq(await p.evaluate(() => window.__dia1Estado(window.MTStore.read('ptStudio', {})).cadastro), false, 'Falha não conclui o checklist');
  await p.evaluate(() => { window.MTStore.write = window.__primeiroWrite; });
  await p.click('#aAdd');
  ok(await p.locator('#naTreino').isVisible() && await p.locator('#naComercial').evaluate(e => !e.open), 'Após salvar, treino é a ação principal e comércio fica recolhido');
  eq(await p.evaluate(() => {
    const s = window.MTStore.read('ptStudio', {}), a = s.alunos[0]; window.__primeiroAluno = a.id;
    return { alunos: s.alunos.length, cpf: a.cpf, contratos: s.contratosPT.length, pagamentos: s.pagamentos.length, token: !!a.appTokenP, acesso: !!a.acessoEm, convite: window.__primeiroCalls.some(x => /aluno_define_login|envia-email|app_aluno_publica_cas/.test(x.name)) };
  }), { alunos: 1, cpf: '', contratos: 0, pagamentos: 0, token: false, acesso: false, convite: false }, 'Cadastro com e-mail não cria acesso, publica, cobra ou envia convite');
  await p.click('#naTreino');
  eq(await p.locator('#tAluno').inputValue(), await p.evaluate(() => window.__primeiroAluno), 'Montar treino abre o aluno cadastrado');
  const states = await p.evaluate(() => {
    const s = window.MTStore.read('ptStudio', {}), id = s.alunos[0].id, exId = s.exercicios[0].id, read = () => { const e = window.__dia1Estado(s); return [e.cadastro, e.treino, e.publicado, e.aberto]; };
    s.config.dia1AppVisto = true;
    s.treinosV2[id] = { fichas: [{ id: 'vazia', titulo: 'A', itens: [] }] };
    const vazio = read();
    s.treinosV2[id] = { fichas: [{ id: 'ficha', titulo: 'A', itens: [{ exId, series: 3, reps: '10', descanso: 60 }] }] };
    const musculacao = read();
    s.treinosV2[id] = { fichas: [], wods: [{ id: 'wod', nome: 'Circuito', tipo: 'amrap', min: 5, mov: ['10 Agachamentos'] }] };
    const circuito = read();
    s.treinosV2[id] = { fichas: [], cardio: [{ id: 'corrida', nome: 'Corrida', tipo: 'continuo', mod: 'corrida', dist: 2 }] };
    const corrida = read();
    window.MTStore.write('ptStudio', s); return { vazio, musculacao, circuito, corrida };
  });
  eq(states.vazio, [true, false, false, false], 'Ficha vazia e flag legada não concluem treino, publicação ou abertura');
  for (const modalidade of ['musculacao', 'circuito', 'corrida']) eq(states[modalidade], [true, true, false, false], modalidade + ': prescrição salva ainda não é publicação');
  async function publicarPelaTela() {
    await p.click('#tdPublica'); await p.click('#acPublicar');
    await p.waitForFunction(() => !document.getElementById('tEnviaApp').disabled);
  }
  await p.evaluate(() => { window.__primeiroCrypto=window.crypto.getRandomValues; window.crypto.getRandomValues=undefined; });
  await publicarPelaTela();
  ok(/Não foi possível preparar um link seguro/.test(await p.locator('#tEnvioStatus').innerText()), 'Sem gerador criptográfico, a publicação pede recuperação em vez de gerar credencial fraca');
  eq(await p.evaluate(() => ({ token:!!window.MTStore.read('ptStudio', {}).alunos[0].appTokenP, calls:window.__primeiroCalls.filter(x=>x.name==='app_aluno_publica_cas').length })), { token:false, calls:0 }, 'Ausência de crypto não persiste token nem publica');
  const cryptoPaths = await p.evaluate(async () => {
    const S=window.MTStore,s=S.read('ptStudio', {}),id=s.alunos[0].id;
    s.questPerguntas=[{id:'fixture-pergunta',sigla:'BEM',titulo:'Bem-estar',texto:'Como foi?',tipo:'texto'}];
    s.questionarios=[{id:'fixture-questionario',nome:'Check-in fictício',perguntas:['fixture-pergunta']}];
    S.write('ptStudio',s); window.__questPT.render();
    document.getElementById('qeAluno').value=id;document.getElementById('qeQuest').value='fixture-questionario';
    const alerts=[],original=window.alert;window.alert=message=>alerts.push(message);
    try {
      document.getElementById('qeGerar').click();document.getElementById('qeApp').click();
      document.querySelector('#listaAlunos [data-alquick="'+id+'"]').click();
      document.querySelector('#listaAlunos [data-app="'+id+'"]').click();
      const access=await new Promise(resolve=>window.__acessoAluno.cria(id,resolve));
      const a=S.read('ptStudio', {}).alunos[0];
      return { alerts:alerts.length, secureErrors:alerts.every(x=>/link seguro/.test(x)), accessError:/link seguro/.test(access.erro||''), token:!!a.appTokenP, quest:!!a.questApp, acesso:!!a.acessoEm, calls:window.__primeiroCalls.filter(x=>/app_aluno_publica_cas|aluno_define_login|envia-email/.test(x.name)).length, output:!document.getElementById('qeSaida').hidden };
    } finally { window.alert=original; }
  });
  eq(cryptoPaths, { alerts:3,secureErrors:true,accessError:true,token:false,quest:false,acesso:false,calls:0,output:false }, 'Questionário por link/app, Publicar app e Enviar acesso também param sem crypto, sem efeitos colaterais');
  await p.evaluate(() => { window.crypto.getRandomValues=window.__primeiroCrypto; });
  await p.evaluate(() => { window.MTStore.write = (key, v) => key === 'ptStudio' ? false : window.__primeiroWrite(key, v); });
  await publicarPelaTela();
  ok(/Não foi possível salvar/.test(await p.locator('#tEnvioStatus').innerText()), 'Falha ao salvar o primeiro token impede publicação e permite tentar novamente');
  eq(await p.evaluate(() => ({ token: !!window.MTStore.read('ptStudio', {}).alunos[0].appTokenP, calls: window.__primeiroCalls.filter(x => x.name === 'app_aluno_publica_cas').length })), { token: false, calls: 0 }, 'Token não persistido nunca é enviado ao servidor');
  await p.evaluate(() => {
    const S = window.MTStore; S.write = window.__primeiroWrite;
    window.__primeiroPublica = S.publicaAppsSeguros;
    S.publicaAppsSeguros = linhas => { window.__primeiroTentativas = (window.__primeiroTentativas || []).concat(linhas.map(l => l.token)); return Promise.reject(new Error('Falha de rede da fixture')); };
  });
  await publicarPelaTela();
  ok(/Não deu pra publicar agora.*sem conexao/.test(await p.locator('#tEnvioStatus').innerText()), 'Falha de rede no botão real deixa publicação pendente');
  const firstToken = await p.evaluate(() => window.MTStore.read('ptStudio', {}).alunos[0].appTokenP);
  ok(/^[0-9a-f]{32}$/.test(firstToken), 'Publicar explicitamente prepara token de 128 bits pelo gerador criptográfico');
  eq(await p.evaluate(() => {
    const s = window.MTStore.read('ptStudio', {}), a = s.alunos[0], e = window.__dia1Estado(s);
    return { publicado:e.publicado, aberto:e.aberto, acesso:!!a.acessoEm, carimbo:!!a.appPubEm, pendente:a.appPublicacaoPendente, automatico:window.__appsPendentes.pendente(s,a,true) };
  }), { publicado:false, aberto:false, acesso:false, carimbo:false, pendente:true, automatico:false }, 'Falha não confirma acesso/publicação nem agenda publicação automática do rascunho');
  ok(await p.evaluate(() => { const s=window.MTStore.read('ptStudio', {}),legado={...s.alunos[0],appTokenP:'token-legado-preservado',appVer:'mt-v001'};delete legado.appPublicacaoPendente;delete legado.appPubEm;return window.__appsPendentes.pendente(s,legado,true); }), 'App legado com token e versão antiga continua elegível à atualização automática sem appPubEm');
  await publicarPelaTela();
  eq(await p.evaluate(() => window.__primeiroTentativas), [firstToken, firstToken], 'Retry após rede usa exatamente o mesmo token');
  await p.evaluate(() => { const S=window.MTStore; window.__primeiroPrepara=S.preparaAppsSeguros; S.preparaAppsSeguros=()=>Promise.reject(new Error('Rede caiu antes do CAS')); });
  await publicarPelaTela();
  ok(/sem conexao ao preparar/.test(await p.locator('#tEnvioStatus').innerText()), 'Falha ao preparar CAS devolve erro e destrava o botão para retry');
  eq(await p.evaluate(() => window.__primeiroTentativas.length), 2, 'Falha no preparo não chega à publicação');
  await p.evaluate(() => { window.MTStore.preparaAppsSeguros=()=>{ throw new Error('Falha síncrona no preparo'); }; });
  await publicarPelaTela();
  ok(/sem conexao ao preparar/.test(await p.locator('#tEnvioStatus').innerText()), 'Exceção síncrona no preparo também destrava o botão sem publicar');
  await p.evaluate(() => { window.MTStore.preparaAppsSeguros=window.__primeiroPrepara; });
  await p.evaluate(() => { window.MTStore.publicaAppsSeguros = window.__primeiroPublica; window.crypto.getRandomValues=undefined; });
  await publicarPelaTela();
  await p.evaluate(() => { window.crypto.getRandomValues=window.__primeiroCrypto; });
  eq(await p.evaluate(() => window.MTStore.read('ptStudio', {}).alunos[0].appTokenP), firstToken, 'Token existente é reutilizado sem rotação, mesmo com gerador indisponível no retry');
  ok(await p.evaluate(() => window.__dia1Estado(window.MTStore.read('ptStudio', {})).publicado), 'Botão real confirma a primeira publicação sem contrato ou cobrança');
  eq(await p.evaluate(() => { const a=window.MTStore.read('ptStudio', {}).alunos[0]; return { token:a.appTokenP, pendente:!!a.appPublicacaoPendente, acesso:!!a.acessoEm, aberto:window.__dia1Estado(window.MTStore.read('ptStudio', {})).aberto }; }), { token:firstToken, pendente:false, acesso:false, aberto:false }, 'Publicar limpa apenas a preparação pendente, sem criar login nem fingir abertura do aluno');
  eq(messages, [], 'Primeira publicação não dispara push, e-mail ou WhatsApp');
  const revoked = await p.evaluate(async () => {
    const S=window.MTStore, s=S.read('ptStudio', {}), a=s.alunos[0], before=window.__primeiroCalls.length;
    a.appRevogadoEm=new Date().toISOString(); delete a.appTokenP; S.write('ptStudio',s);
    const r=await new Promise(resolve=>window.__appsPendentes.publicaUm(a.id,resolve));
    const after=S.read('ptStudio', {}), tokenCriado=!!after.alunos[0].appTokenP;
    after.alunos[0].appTokenP=window.__primeiroTentativas[0]; delete after.alunos[0].appRevogadoEm; S.write('ptStudio',after);
    return { bloqueado:/acesso.*cortado/.test(r.erro||''), tokenCriado, calls:window.__primeiroCalls.slice(before).filter(x=>x.name==='app_aluno_publica_cas').length };
  });
  eq(revoked, { bloqueado:true, tokenCriado:false, calls:0 }, 'Aluno revogado sem token não ganha outro token nem publicação');
  const revokedDuring = await p.evaluate(async () => {
    const S=window.MTStore, before=window.__primeiroCalls.length, id=S.read('ptStudio', {}).alunos[0].id;
    S.preparaAppsSeguros=async()=>{ const s=S.read('ptStudio', {}); s.alunos[0].appRevogadoEm=new Date().toISOString(); S.write('ptStudio',s); return window.__primeiroPrepara(); };
    const r=await new Promise(resolve=>window.__appsPendentes.publicaUm(id,resolve));
    S.preparaAppsSeguros=window.__primeiroPrepara;
    const s=S.read('ptStudio', {}); delete s.alunos[0].appRevogadoEm; S.write('ptStudio',s);
    return { bloqueado:/acesso.*cortado/.test(r.erro||''), calls:window.__primeiroCalls.slice(before).filter(x=>x.name==='app_aluno_publica_cas').length };
  });
  eq(revokedDuring, { bloqueado:true, calls:0 }, 'Revogação confirmada durante o preparo também bloqueia o pacote');
  ok(await p.evaluate(() => {
    const S = window.MTStore, s = S.read('ptStudio', {});
    const reorder = v => Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map(k => [k, reorder(v[k])])) : v;
    s.alunos[0].acompPublicado = reorder(s.alunos[0].acompPublicado); S.write('ptStudio', s);
    return window.__dia1Estado(S.read('ptStudio', {})).publicado;
  }), 'Ordem de chaves devolvida pelo JSONB não invalida uma publicação confirmada');
  eq(await p.evaluate(() => window.__primeiroCalls.filter(x => /aluno_define_login|envia-email/.test(x.name)).length), 0, 'Publicar não envia convite de acesso');
  await p.evaluate(() => {
    document.querySelector('#abas [data-a="dash"]').click();
    window.__dia1(window.MTStore.read('ptStudio', {}));
    window.__primeiroOpen = window.open; window.open = () => null;
  });
  await p.click('#dia1Card [data-d1="app"]');
  ok(/bloqueou/.test(await p.locator('#dia1Status').innerText()), 'Popup bloqueado oferece recuperação');
  eq(await p.evaluate(() => window.__dia1Estado(window.MTStore.read('ptStudio', {})).aberto), false, 'Popup bloqueado não registra sucesso');
  await p.evaluate(() => { window.open = () => ({ closed: true }); });
  await p.click('#dia1Card [data-d1="app"]');
  eq(await p.evaluate(() => window.__dia1Estado(window.MTStore.read('ptStudio', {})).aberto), false, 'Janela fechada antes do app não registra sucesso');
  // Popup real em rota interceptada: o primeiro documento é somente o loader.
  await ctx.route('**/app/?t=' + firstToken, route => route.fulfill({ contentType: 'text/html', body: '<p id="loading">Carregando fixture</p>' }));
  await p.evaluate(() => { window.open = window.__primeiroOpen; });
  const popupPromise = ctx.waitForEvent('page'); await p.click('#dia1Card [data-d1="app"]'); const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  eq(await p.evaluate(() => window.__dia1Estado(window.MTStore.read('ptStudio', {})).aberto), false, 'Abrir somente o carregador não equivale ao app pronto');
  await popup.evaluate(() => { const e = document.createElement('div'); e.id = 'diasSem'; document.body.appendChild(e); });
  await p.waitForFunction(() => window.__dia1Estado(window.MTStore.read('ptStudio', {})).aberto);
  ok(await p.locator('#dia1Card').isHidden(), 'App carregado confirma a quarta etapa e encerra o guia');
  await popup.close();
  const revisions = await p.evaluate(() => {
    const s = window.MTStore.read('ptStudio', {}), id = s.alunos[0].id;
    s.treinosV2[id].cardio[0].dist = 3;
    const editado = window.__dia1Estado(s); s.alunos[0].appRevogadoEm = new Date().toISOString();
    const revogado = window.__dia1Estado(s); return { editado: [editado.publicado, editado.aberto], revogado: [revogado.publicado, revogado.aberto] };
  });
  eq(revisions, { editado: [false, false], revogado: [false, false] }, 'Prescrição alterada ou aluno revogado não herda abertura/publicação antiga');
  ok(await p.evaluate(() => { const s = window.MTStore.read('ptStudio', {}); s.treinosV2[s.alunos[0].id].cardio[0].dist = 3; window.__dia1(s); return document.getElementById('dia1Card').hidden; }), 'Guia já concluído não reaparece a cada edição posterior');
  const out = path.join(__dirname, 'out', 'personal-primeiro-uso'); fs.mkdirSync(out, { recursive: true });
  for (const width of [320, 390, 768, 1440]) for (const tema of ['escuro', 'claro']) {
    await p.setViewportSize({ width, height: 900 });
    await p.evaluate(tema => { if ((document.documentElement.dataset.tema === 'claro') !== (tema === 'claro')) document.getElementById('btnTemaPt').click(); document.getElementById('btnNovoAluno').click(); }, tema);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('dlgNovoAluno').getBoundingClientRect().right <= innerWidth + 1), width + '/' + tema + ': cadastro cabe na tela');
    if (width === 390) await p.screenshot({ path: path.join(out, tema + '.png'), animations: 'disabled' });
    await p.click('#naCancela');
  }
  await p.evaluate(() => document.getElementById('btnNovoAluno').click());
  await p.fill('#aNome', 'Segundo aluno fictício'); await p.fill('#aEmail', 'segundo@example.invalid');
  await p.click('#aAdd'); await p.locator('#naComercial > summary').click();
  await p.fill('#naValor', '123'); await p.locator('#naPagar').check();
  await p.click('#naPerfil');
  eq(await p.evaluate(() => window.MTStore.read('ptStudio', {}).pagamentos.length), 0, 'Abrir perfil não salva uma venda apenas preenchida no disclosure');
  eq(await p.evaluate(() => window.__primeiroCalls.filter(x => x.name === 'envia-email').length), 0, 'Visitar perfil também não envia convite');
  // A ação manual existente mantém a publicação e o envio explícitos, inteiramente mockados.
  await p.evaluate(() => document.getElementById('pfAcesso').click());
  await p.waitForFunction(() => window.__primeiroCalls.some(x => x.name === 'envia-email'));
  eq(await p.evaluate(() => ({ logins: window.__primeiroCalls.filter(x => x.name === 'aluno_define_login').length, emails: window.__primeiroCalls.filter(x => x.name === 'envia-email').length })), { logins: 1, emails: 1 }, 'Enviar acesso conscientemente cria um login e solicita um e-mail, uma vez');
  eq(errors, [], 'Nenhum erro JavaScript no fluxo');
  await ctx.close(); console.log(checks + ' verificações de primeiro uso aprovadas');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
