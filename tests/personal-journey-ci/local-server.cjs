'use strict';
// Test transport only: product files remain byte-identical to the stated base.
// No external proxy target, redirects, service-role credential or fake RPC result.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const AUTH = 'http://127.0.0.1:59999', REST = 'http://127.0.0.1:53000';
const RPC = new Set(['criar_personal','personal_sessao_ativa','minha_assinatura',
  'dados_cas','dados_grava','dados_personal_patch','app_aluno_publica_cas',
  'app_aluno_estado','app_aluno_busca','app_alunos_vistos','app_retorno_busca',
  'app_retorno_salva','app_aluno_devolve','app_aluno_treino_reg','app_treino_eventos_lista','app_treino_eventos_grava',
  'app_nutricao_estado','app_nutricao_feedback_lista','app_chat_lista',
  'app_agenda_lista','app_desafio_ranking','app_feed_lista','app_rank_semana']);
const TYPES = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
  '.gif':'image/gif','.woff':'font/woff','.woff2':'font/woff2','.mp3':'audio/mpeg','.ico':'image/x-icon'};
function classify(method, raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\\\0]/.test(raw)) return {kind:'deny'};
  let url, pathname;
  try { url = new URL(raw, 'http://fixture.invalid'); pathname = decodeURIComponent(url.pathname); } catch { return {kind:'deny'}; }
  // Reject encoded traversal before URL normalization; no secret/config filesystem access.
  let decoded; try { decoded=decodeURIComponent(raw.split('?')[0]); } catch { return {kind:'deny'}; }
  if (decoded.split('/').some(part => part === '..' || part.startsWith('.')) || /[\\\0]/.test(decoded)) return {kind:'deny'};
  if (pathname.startsWith('/auth/v1/')) {
    const route=pathname.slice('/auth/v1'.length);
    if ((method==='POST' && ['/token','/logout'].includes(route)) || (method==='GET' && route==='/user'))
      return {kind:'proxy', target:AUTH, route:route+url.search, label:'auth:'+method+':'+route};
    return {kind:'deny'};
  }
  if (pathname.startsWith('/rest/v1/')) {
    const route=pathname.slice('/rest/v1'.length), match=route.match(/^\/rpc\/([a-z_]+)$/);
    if (method==='POST' && match && RPC.has(match[1]))
      return {kind:'proxy',target:REST,route:route+url.search,label:'rest:POST:/rpc/'+match[1]};
    if (['GET','HEAD'].includes(method) && /^\/[a-z_]+$/.test(route))
      return {kind:'proxy',target:REST,route:route+url.search,label:'rest:'+method+':'+route};
    if (method==='POST' && route==='/erros_js')
      return {kind:'proxy',target:REST,route:route,label:'rest:POST:/erros_js'};
    return {kind:'deny'};
  }
  if (pathname.startsWith('/functions/') || pathname.startsWith('/storage/') || pathname.startsWith('/realtime/'))
    return {kind:'unavailable',label:pathname.replace(/[^a-zA-Z0-9_/-]/g,'').slice(0,100)};
  if (!['GET','HEAD'].includes(method)) return {kind:'deny'};
  if (pathname==='/assets/cloud-config.js') return {kind:'config'};
  const relative=pathname.replace(/^\//,'')+(pathname.endsWith('/')?'index.html':'');
  if (!(relative==='personal.html' || /^(assets|app|apps)\//.test(relative)) || !TYPES[path.extname(relative)]) return {kind:'deny'};
  return {kind:'file',relative};
}
async function start({root,anonKey,port=58765}) {
  assert.equal(typeof anonKey,'string'); assert(anonKey.split('.').length===3);
  const resolved=fs.realpathSync(root), events=[];
  let origin;
  function send(res,status,body,type='application/json') {res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);}
  const server=http.createServer((req,res)=>{
    if (req.headers.host!==new URL(origin).host || (req.headers.origin && req.headers.origin!==origin)) return send(res,403,'{"error":"origin_refused"}');
    const action=classify(req.method,req.url);
    if (action.kind==='deny'||action.kind==='unavailable') {
      events.push({kind:action.kind,method:req.method,route:action.label||'redacted',status:action.kind==='deny'?403:503});
      return send(res,action.kind==='deny'?403:503,JSON.stringify({error:action.kind==='deny'?'test_transport_refused':'service_not_installed_in_disposable_test'}));
    }
    if (action.kind==='config') return send(res,200,'self.MT_CLOUD='+JSON.stringify({url:origin,anonKey})+';self.MT_MAPA={cartoKey:"",mapboxToken:""};self.MT_FN_APELIDO={};self.MT_GIFS={bucket:""};self.MT_RC={android:"",ios:""};','application/javascript');
    if (action.kind==='proxy') {
      // Node HTTP does not follow redirects. Copy only headers PostgREST/Auth need.
      const headers={};
      for(const name of ['authorization','apikey','content-type','accept','prefer','range','range-unit','x-client-info','x-supabase-api-version']) if(req.headers[name]) headers[name]=req.headers[name];
      const target=new URL(action.route,action.target);
      if(target.origin!==action.target) return send(res,403,'{"error":"target_refused"}');
      const upstream=http.request(target,{method:req.method,headers,timeout:15000},response=>{
        events.push({kind:'proxy',route:action.label,status:response.statusCode});
        if(response.statusCode>=300 && response.statusCode<400) {response.resume();return send(res,502,'{"error":"upstream_redirect_refused"}');}
        const out={'Cache-Control':'no-store'};
        for(const name of ['content-type','content-range','preference-applied']) if(response.headers[name])out[name]=response.headers[name];
        res.writeHead(response.statusCode,out);response.pipe(res);
      });
      upstream.on('timeout',()=>upstream.destroy());
      upstream.on('error',()=>{events.push({kind:'proxy',route:action.label,status:502});if(!res.headersSent)send(res,502,'{"error":"disposable_upstream_unavailable"}');else res.destroy();});
      req.pipe(upstream);return;
    }
    const file=path.resolve(resolved,action.relative);
    if (!file.startsWith(resolved+path.sep)) return send(res,403,'{"error":"path_refused"}');
    let real;
    try{real=fs.realpathSync(file);if(!real.startsWith(resolved+path.sep)||!fs.statSync(real).isFile())throw new Error('not_file');}
    catch{return send(res,404,'{"error":"local_asset_missing"}');}
    res.writeHead(200,{'Content-Type':TYPES[path.extname(file)],'Cache-Control':'no-store',
      'Content-Security-Policy':"connect-src 'self'; form-action 'self'; object-src 'none'; base-uri 'self'"});
    if(req.method==='HEAD')res.end();else fs.createReadStream(real).pipe(res);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;
  return {origin,events,close:()=>new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();})};
}
module.exports={start,classify,AUTH,REST};
