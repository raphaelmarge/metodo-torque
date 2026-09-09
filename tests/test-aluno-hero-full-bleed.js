/* Foto no topo: demo e builder reais, com dados sintéticos e sem rede externa. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({chromium} = require('playwright')); }
catch (_) { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
const ROOT = path.join(__dirname, '..');
global.self = global;
require('../app/aluno-skin.js');
require('../app/aluno-builder.js');
const photo = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(ROOT, 'tools/demo-aluno/capa-treino.jpg')).toString('base64');
const D = {
  a: {nome: 'Aluno de teste', id: 'hero-layout'}, studio: 'Studio de teste',
  COR: '#7c3aed', COR2: '#5925ba', CORC: '#b395ff', CORE: '#33155c', CORCL1: '#d6c4ff', CORCL2: '#e8ddff',
  PAL: ['#0d0c10','#111015','#15131b','#191621','#211d2a','#272231','#2c2639','#342d42','#3b334b','#443a54','#4d425f','#574b6c','#62557a'],
  cfg: {capaTreino: photo}, metaSemana: 3,
  fichasApp: [{titulo: 'A — Treino de teste', itens: [{nome: 'Movimento de teste', series: 3, reps: '8', descanso: 60}]}],
  guiaFichasP: [{n: 'A — Treino de teste', it: [{e: 'Movimento de teste', s: 3, r: '8', d: 60}]}],
  fexs: [{n: 'Movimento de teste', s: 3}], sessApp: [], wodsApp: [], cardiosApp: []
};
function mount(dados) {
  // Somente a página de teste usa memória. Nenhuma conta ou registro real.
  const seed = '<script>var __heroTestLS=(function(){var d={pttour:\'{"como":"teste"}\',ptonb:\'{"feito":true}\'};return {getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]}}})();</script>';
  return global.MT_APP_ALUNO.monta(dados).replace(/localStorage/g, '__heroTestLS').replace(/(<body[^>]*>)/, '$1' + seed);
}
const demoOriginal = fs.readFileSync(path.join(ROOT, 'demo-aluno.html'), 'utf8');
// Simula apenas o Alex que já concluiu a entrada, como na tela solicitada.
const demo = demoOriginal.replace('var __demoOnboardingAceite=null;', "var __demoOnboardingAceite={id:'teste-demo',aceito_em:'2026-09-09T12:00:00Z',documento_hash:'demo'};");
let browser, count = 0;
function ok(value, label) { assert.ok(value, label); count++; console.log('OK ' + label); }
async function open(html, width = 390, height = 844) {
  const ctx = await browser.newContext({viewport: {width, height}, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block', reducedMotion: 'reduce'});
  await ctx.route('**/*', r => r.abort());
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent(html, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.__inicioAtualiza);
  const entrar = page.getByRole('button', {name: 'Entrar no meu app', exact: true});
  if (html === demo) { await entrar.waitFor({state: 'visible'}); await entrar.click(); }
  await page.evaluate(() => { window.__trocaSec('inicio'); window.scrollTo(0, 0); });
  return {ctx, page, errors};
}
async function geometry(page) {
  return page.evaluate(() => {
    const el = id => document.getElementById(id), rect = e => { const r = e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}; };
    const c = el('heroCarr'), h = Array.from(c.children).find(e => !e.hidden && getComputedStyle(e).display !== 'none');
    return {body: rect(document.body), bloco: rect(el('blocoHoje')), carr: rect(c), card: rect(h),
      radius: getComputedStyle(h).borderRadius, top: rect(el('heroTopo')), title: rect(el('htTitulo')),
      greeting: getComputedStyle(el('heroSauda')).color, photo: rect(el('htFoto')), fit: getComputedStyle(el('htFoto')).objectFit,
      button: rect(el('htVer')), bell: rect(el('sinoBtn')), avatar: rect(el('avBtn2')),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      controlsClickable: ['sinoBtn','avBtn2'].every(id => {const e=el(id),r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})};
  });
}
(async () => {
  browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox']});
  for (const [name, html] of [['builder', mount(D)], ['demo', demo]]) {
    const {ctx,page,errors} = await open(html);
    try {
      for (const [width,height] of [[320,568],[360,740],[390,844],[430,932],[640,360],[800,600]]) {
        await page.setViewportSize({width,height}); await page.evaluate(() => window.scrollTo(0,0));
        await page.waitForTimeout(80);
        const g = await geometry(page), tag = name + ' ' + width + 'x' + height;
        ok(Math.abs(g.carr.x-g.body.x)<1 && Math.abs(g.carr.w-g.body.w)<1 && Math.abs(g.carr.y-g.bloco.y)<1, tag + ': foto de ponta a ponta e no topo');
        ok(g.radius==='0px' && g.card.h>=469 && g.card.h<=571 && g.fit==='cover', tag + ': altura original, sem moldura ou deformação');
        ok(g.greeting==='rgb(255, 255, 255)' && g.top.bottom<g.title.y && g.button.bottom<=g.card.bottom+1, tag + ': saudação e conteúdo não se sobrepõem');
        ok(g.bell.w>=43.5 && g.bell.h>=43.5 && g.avatar.w>=43.5 && g.avatar.h>=43.5 && g.controlsClickable && !g.overflow, tag + ': controles acessíveis e sem rolagem lateral');
      }
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(() => {document.documentElement.classList.add('claro'); window.scrollTo(0,0);});
      ok((await geometry(page)).greeting==='rgb(255, 255, 255)', name + ': saudação continua clara sobre a foto no tema claro');
      ok(await page.locator('#htTitulo').evaluate(e => getComputedStyle(e).color==='rgb(33, 27, 45)'), name + ': título com contraste no degradê claro');
      await page.evaluate(() => document.documentElement.classList.remove('claro'));
      await page.locator('#sinoBtn').click();
      ok(await page.locator('#sinoCx').isVisible(), name + ': sino funciona sobre a foto');
      await page.locator('#sinoFundo').click({position:{x:5,y:800}});
      for (const width of [801,1024,1280]) {
        await page.setViewportSize({width,height:900}); await page.evaluate(() => window.scrollTo(0,0));
        const g=await geometry(page);
        ok(g.radius==='16px' && Math.abs(g.card.h-400)<1 && g.carr.y>g.top.bottom && !g.overflow, name + ': layout desktop preservado em '+width+'px');
      }
      assert.deepEqual(errors, []); ok(true,name + ': sem erros JavaScript');
    } finally {await ctx.close();}
  }
  const noPhoto=await open(mount({...D,cfg:{}}));
  ok(!await noPhoto.page.locator('#htFoto').isVisible() && await noPhoto.page.locator('#htVer').isVisible(),'sem foto: fundo e ação de treino preservados');
  assert.deepEqual(noPhoto.errors,[]); await noPhoto.ctx.close();
  const first=await open(mount({...D,fichasApp:null,guiaFichasP:[],fexs:[]}));
  ok(await first.page.locator('#heroCarr').count()===0 && await first.page.locator('#primeiroDia').isVisible(),'primeiro dia sem treino mantém sua tela, sem carrossel vazio');
  assert.deepEqual(first.errors,[]); await first.ctx.close();
  console.log('Hero full-bleed: '+count+' verificações passaram.');
})().catch(e => {console.error(e);process.exitCode=1;}).finally(async () => {if(browser) await browser.close();});
