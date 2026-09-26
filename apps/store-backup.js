/* Backup versionado do aparelho. Nunca inclui sessões, credenciais do Supabase
 * ou fotos de outra conta. Mídias referenciadas são verificadas antes de restaurar. */
(function (root) {
  'use strict';
  var MAX = 150 * 1024 * 1024, IMAGE_MAX = 16 * 1024 * 1024;
  var LOCK = 'mtbackup:restauracao', DB = 'mt-backup-v2';
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function fail(t) { throw new Error(t); }
  function clean(o, depth) {
    if ((depth || 0) > 50) fail('O arquivo contém uma estrutura muito profunda.');
    if (o && typeof o === 'object') Object.keys(o).forEach(function (k) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') fail('O arquivo contém uma chave inválida.');
      clean(o[k], (depth || 0) + 1);
    });
    return o;
  }
  function imageOK(s) { return typeof s === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= IMAGE_MAX * 1.4; }
  function strings(v, fn) {
    if (typeof v === 'string') return fn(v);
    if (Array.isArray(v)) return v.map(function (x) { return strings(x, fn); });
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = strings(v[k], fn); }); return o; }
    return v;
  }
  async function digest(value) {
    if (!root.crypto || !root.crypto.subtle) fail('Abra pelo endereço HTTPS para verificar o backup.');
    var bytes = new TextEncoder().encode(JSON.stringify(value));
    if (bytes.length > MAX) fail('O backup ultrapassa 150 MB. Exporte as avaliações separadamente.');
    var hash = await root.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }
  function database(name, stores) {
    return new Promise(function (resolve, reject) {
      var q = indexedDB.open(name, 1);
      q.onupgradeneeded = function () { stores.forEach(function (s) { if (!q.result.objectStoreNames.contains(s)) q.result.createObjectStore(s); }); };
      q.onerror = function () { reject(q.error); };
      q.onblocked = function () { reject(new Error('Feche outras abas antes de continuar com o backup.')); };
      q.onsuccess = function () { resolve(q.result); };
    });
  }
  async function scan(dbName, storeName) {
    var db = await database(dbName, [storeName]);
    try { return await new Promise(function (resolve, reject) {
      if (!db.objectStoreNames.contains(storeName)) return reject(new Error('Armazenamento de fotos incompleto.'));
      var out = [], tx = db.transaction(storeName), q = tx.objectStore(storeName).openCursor();
      q.onsuccess = function () { var c = q.result; if (c) { out.push({ key: c.key, value: c.value }); c.continue(); } };
      tx.oncomplete = function () { resolve(out); }; tx.onerror = tx.onabort = function () { reject(tx.error || new Error('Não foi possível ler as fotos.')); };
    }); } finally { db.close(); }
  }
  async function puts(dbName, storeName, rows) {
    var db = await database(dbName, [storeName]);
    try { await new Promise(function (resolve, reject) {
      var tx = db.transaction(storeName, 'readwrite'), s = tx.objectStore(storeName);
      rows.forEach(function (x) { x.remove ? s.delete(x.key) : s.put(x.value, x.key); });
      tx.oncomplete = resolve; tx.onerror = tx.onabort = function () { reject(tx.error || new Error('Não foi possível guardar a cópia de segurança.')); };
    }); } finally { db.close(); }
  }
  function scope(api) {
    var c = api.cloud(), id;
    try { id = JSON.parse(localStorage.getItem('mtsync:identidade') || 'null'); } catch (_) {}
    return { academia: c && c.aid || id && id.academia_id || '', usuario: id && id.user_id || '', demo: localStorage.getItem('mtapp:ptDemo') === '1' };
  }
  function scopeKey(s) { return JSON.stringify(s); }
  function same(api, initial) { if (scopeKey(scope(api)) !== scopeKey(initial)) fail('A conta mudou. Reabra o backup na conta correta.'); }
  function dataURL(blob) { return new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = reject; r.readAsDataURL(blob); }); }
  function blobOf(data) { var m = /^data:([^;]+);base64,(.+)$/.exec(data), b = atob(m[2]), a = new Uint8Array(b.length); for (var i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return new Blob([a], {type:m[1]}); }
  function mediaRef(value, s) {
    var cfg = root.MT_CLOUD;
    if (!cfg || !cfg.url || !s.academia) return null;
    var prefix = cfg.url.replace(/\/$/, '') + '/storage/v1/object/public/';
    if (value.indexOf(prefix) === 0) {
      var rest = value.slice(prefix.length), slash = rest.indexOf('/'), bucket = rest.slice(0,slash), path;
      try { path = decodeURIComponent(rest.slice(slash+1)); } catch (_) { return null; }
      if (['galeria','exercicios'].indexOf(bucket) >= 0 && path.indexOf(s.academia + '/') === 0 && !/[\\?#]/.test(path) && !path.split('/').some(function(p){return !p||p==='.'||p==='..';}) && !/[?#]/.test(rest)) return {original:value,url:value,bucket:bucket};
    }
    if (value.indexOf(s.academia + '/') === 0 && /\.gif$/i.test(value) && !/[\\?#]/.test(value) && !value.split('/').some(function(p){return !p||p==='.'||p==='..';})) return {original:value,url:prefix+'exercicios/'+value.split('/').map(encodeURIComponent).join('/'),bucket:'exercicios',pathOnly:true};
    return null;
  }
  async function capture(api) {
    var initial = scope(api), raw = api.snapshot(), values = {}, refs = new Set(), cloudRefs = new Map();
    Object.keys(raw).forEach(function (k) { values[k] = JSON.parse(raw[k]); });
    strings(values, function (s) { refs.add(s); var ref=mediaRef(s,initial); if(ref)cloudRefs.set(s,ref); return s; });
    var photos = (await scan('mt-fotos','fotos')).filter(function (x) { return refs.has(x.key); });
    if (photos.some(function (x) { return !imageOK(x.value); })) fail('Uma foto local está inválida. O backup não foi concluído.');
    var postural = [];
    // Abrir a base postural apenas se já existe; não criar uma base sem os índices do módulo.
    var databases = indexedDB.databases ? await indexedDB.databases() : null;
    if (databases && databases.some(function (x) { return x.name === 'torque-postural-v1'; })) {
      var expected = initial.demo ? 'demo' : initial.academia && initial.usuario ? 'account:'+initial.academia+':'+initial.usuario : 'local';
      postural = (await scan('torque-postural-v1','records')).filter(function (x) { return x.value && x.value.scope === expected; });
    } else if (!databases) fail('Este navegador não permite conferir as bases de fotos. Atualize o navegador antes de exportar o backup completo.');
    if(postural.length){await api.loadPostural();postural.forEach(function(x){root.MT_POSTURAL_CORE.validate(x.value.documento);});}
    var c=api.cloud();
    if(c && initial.academia && initial.usuario && !initial.demo) {
      await api.loadPostural();
      var seen=new Map(postural.map(function(x){return [x.value.id,x];}));
      for(var offset=0;;offset+=50){
        same(api,initial);
        var res=await c.client.from('personal_postural').select('*').eq('academia_id',initial.academia).eq('autor_id',initial.usuario).order('id').range(offset,offset+49);
        if(res.error||!Array.isArray(res.data))fail('Não foi possível conferir as avaliações posturais na nuvem. O backup não foi concluído.');
        for(var row of res.data){
          root.MT_POSTURAL_CORE.validate(row.documento);
          var rec={id:row.id,scope:'account:'+initial.academia+':'+initial.usuario,alunoId:row.aluno_id,data:row.data,vista:row.vista,criadoEm:row.criado_em,documento:row.documento,parentId:row.parent_id||null,synced:true};
          var local=seen.get(rec.id);
          if(local&&!root.MT_POSTURAL_CORE.equal(local.value.documento,rec.documento))fail('Uma avaliação tem versões diferentes no aparelho e na nuvem. Confira antes de exportar.');
          if(!local)seen.set(rec.id,{key:rec.scope+'|'+rec.id,value:rec});
        }
        if(res.data.length<50)break;
        if(offset>20000)fail('Muitas avaliações para um único arquivo. Exporte por aluno.');
      }
      postural=Array.from(seen.values());
    }
    var media = [], total = JSON.stringify(values).length + JSON.stringify(photos).length + JSON.stringify(postural).length;
    for (var ref of cloudRefs.values()) {
      same(api,initial);
      var response = await fetch(ref.url, {credentials:'omit',signal:AbortSignal.timeout(20000)});
      if (!response.ok) fail('Não foi possível baixar uma imagem da nuvem. Tente o backup novamente com conexão.');
      var blob = await response.blob();
      if (blob.size > IMAGE_MAX) fail('Uma imagem ultrapassa 16 MB. O backup não foi concluído.');
      var encoded = await dataURL(blob);
      if (!imageOK(encoded)) fail('Uma imagem da nuvem não tem formato permitido.');
      total += encoded.length; if (total > MAX) fail('O backup ultrapassa 150 MB.');
      media.push({original:ref.original,bucket:ref.bucket,pathOnly:!!ref.pathOnly,data:encoded});
    }
    same(api,initial);
    if (JSON.stringify(api.snapshot()) !== JSON.stringify(raw)) fail('Os dados mudaram durante a exportação. Gere o backup novamente.');
    var result = {formato:'metodo-torque-backup',versao:2,exportado:new Date().toISOString(),escopo:initial,dados:values,fotos:photos,postural:postural,midias:media};
    result.integridade = await digest(result);
    return result;
  }
  async function inspect(file, api) {
    if (file.size > MAX * 1.4) fail('Arquivo maior que o limite de 150 MB.');
    var text = await file.text(); if (text.length > MAX * 1.4) fail('Arquivo muito grande.');
    var data = clean(JSON.parse(text));
    // Os arquivos anteriores à v845 não tinham o campo de versão.
    if(data&&data.formato==='metodo-torque-backup'&&!own(data,'versao')&&!own(data,'dados')&&!own(data,'integridade'))data.versao=1;
    if (!data || data.formato !== 'metodo-torque-backup' || [1,2].indexOf(data.versao) < 0) fail('Arquivo não é um backup compatível do TORQUE ON.');
    if (data.versao === 1) {
      var vals={}; api.keys().forEach(function(k){if(data[k]!=null)vals['mtapp:'+k]=data[k];});
      Object.keys(data._preenchiveis||{}).forEach(function(k){if(!/^[a-zA-Z0-9_-]+$/.test(k))fail('Documento inválido.');vals['mtpf:'+k]=data._preenchiveis[k];});
      data={formato:data.formato,versao:1,exportado:data.exportado,dados:vals,fotos:[],postural:[],midias:[]};
    } else {
      var hash=data.integridade;delete data.integridade;
      if(!hash || hash!==await digest(data))fail('A integridade do backup não confere. Nada foi restaurado.');
      data.integridade=hash;
    }
    if(!data.dados || Array.isArray(data.dados) || !Array.isArray(data.fotos) || !Array.isArray(data.postural) || !Array.isArray(data.midias))fail('Backup incompleto.');
    Object.keys(data.dados).forEach(function(k){if(!api.allowed(k))fail('O backup contém dados fora do escopo permitido.');});
    if(data.fotos.some(function(x){return typeof x.key!=='string'||!imageOK(x.value);}) || data.midias.some(function(x){return typeof x.original!=='string'||!imageOK(x.data)||['galeria','exercicios'].indexOf(x.bucket)<0;}))fail('Mídia inválida no backup.');
    var current=scope(api);
    if(data.escopo && (data.escopo.academia!==current.academia || data.escopo.demo!==current.demo || (data.postural.length && data.escopo.usuario!==current.usuario)))fail('Este backup pertence a outra conta ou ambiente. Abra-o na conta de origem.');
    return data;
  }
  function download(data) {
    var url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})), a=document.createElement('a');
    a.href=url;a.download='torque-backup-'+data.exportado.slice(0,10)+'.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},60000);
  }
  async function restore(file, api, options) {
    var initial=scope(api), data=await inspect(file,api);same(api,initial);
    if(options && options.preview)return {versao:data.versao,fotos:data.fotos.length,posturais:data.postural.length,midias:data.midias.length,exportado:data.exportado};
    if(!confirm('Restaurar o backup de '+String(data.exportado||'data não informada').slice(0,10)+'?\n\n'+data.fotos.length+' foto(s), '+data.postural.length+' avaliação(ões) postural(is) e '+data.midias.length+' imagem(ns) da nuvem.\nOs dados atuais serão preservados numa cópia de recuperação.'+(data.versao===1?'\nEste backup antigo não contém fotos.':'')))return {cancelado:true};
    if(localStorage.getItem(LOCK))fail('Existe uma restauração pendente. Recupere-a antes de continuar.');
    if(!api.canRestore())fail('Aguarde a sincronização e resolva as pendências antes de restaurar.');
    var id=crypto.randomUUID(), before=api.snapshot(), renamed={}, uploads=[], newPhotos=[], newPostural=[], committed=false;
    // A cópia anterior contém as próprias imagens, não apenas referências.
    var previous=await capture(api);same(api,initial);
    if(JSON.stringify(api.snapshot())!==JSON.stringify(before)||!api.canRestore())fail('Os dados mudaram durante a preparação. Tente novamente.');
    // IDs novos impedem substituir uma foto ainda usada pelo estado anterior.
    data.fotos.forEach(function(x){var key='bk-'+crypto.randomUUID();renamed[x.key]=key;newPhotos.push({key:key,value:x.value});});
    try {
      for(var m of data.midias){
        same(api,initial);var c=api.cloud();if(!c||c.aid!==initial.academia||!c.client.storage)fail('Entre na nuvem para restaurar as imagens.');
        var blob=blobOf(m.data),ext=blob.type.split('/')[1],path=c.aid+'/backup-'+crypto.randomUUID()+'.'+ext;
        var bucket=c.client.storage.from(m.bucket),r=await bucket.upload(path,blob,{contentType:blob.type,upsert:false});
        if(r.error)fail('A nuvem não confirmou a restauração das imagens. Os dados atuais foram mantidos.');
        uploads.push({bucket:m.bucket,path:path,client:c.client});
        renamed[m.original]=m.pathOnly?path:bucket.getPublicUrl(path).data.publicUrl;
      }
      same(api,initial);
      if(JSON.stringify(api.snapshot())!==JSON.stringify(before)||!api.canRestore())fail('Os dados mudaram durante a restauração. Tente novamente.');
      var values=strings(data.dados,function(s){return own(renamed,s)?renamed[s]:s;}), after={};
      Object.keys(values).forEach(function(k){after[k]=JSON.stringify(values[k]);});
      await puts(DB,'journal',[{key:id,value:{id:id,scope:initial,before:before,after:after,em:new Date().toISOString(),backup:previous}}]);
      await puts('mt-fotos','fotos',newPhotos);
      // Posturais mantêm o contrato imutável: colisão de conteúdo é recusada.
      if(data.postural.length){
        if(!root.MT_POSTURAL_STORE)await api.loadPostural();
        var ps=root.MT_POSTURAL_STORE;
        for(var item of data.postural){var rec=item.value; if(!rec||typeof rec.id!=='string'||!rec.alunoId||rec.scope!==(initial.demo?'demo':initial.academia&&initial.usuario?'account:'+initial.academia+':'+initial.usuario:'local'))fail('Avaliação postural de outra conta.');root.MT_POSTURAL_CORE.validate(rec.documento);}
        newPostural=await posturalInsert(data.postural.map(function(x){return x.value;}),ps);
      }
      same(api,initial);if(JSON.stringify(api.snapshot())!==JSON.stringify(before)||!api.canRestore())fail('Os dados mudaram. A restauração foi interrompida.');
      localStorage.setItem(LOCK,JSON.stringify({id:id,scope:initial}));
      try { api.commit(after); committed=true; localStorage.removeItem(LOCK); api.completed(Object.keys(after)); }
      catch(e){api.rollback(before,after);localStorage.removeItem(LOCK);throw e;}
      return {ok:true,copiaAnterior:id,fotos:newPhotos.length,midias:uploads.length};
    } finally {
      if(!committed&&!localStorage.getItem(LOCK)){
        await puts('mt-fotos','fotos',newPhotos.map(function(x){return {key:x.key,remove:true};})).catch(function(){});
        for(var added of newPostural)await root.MT_POSTURAL_STORE.localDelete(added.scope,added.id).catch(function(){});
        for(var uploaded of uploads)await uploaded.client.storage.from(uploaded.bucket).remove([uploaded.path]).catch(function(){});
      }
    }
  }
  async function posturalInsert(records,ps) {
    // Inicializa com os índices canônicos antes da transação de importação.
    await ps.localGet(records[0].scope,records[0].id);
    var db=await database('torque-postural-v1',[]);
    try {return await new Promise(function(resolve,reject){
      var tx=db.transaction(['records','summaries'],'readwrite'),rs=tx.objectStore('records'),ss=tx.objectStore('summaries'),added=[],error;
      records.forEach(function(rec){
        var value=JSON.parse(JSON.stringify(rec));value.key=value.scope+'|'+value.id;value.synced=false;
        var q=rs.get(value.key);q.onsuccess=function(){
          var old=q.result;
          if(old){if(old.alunoId!==value.alunoId||old.data!==value.data||old.vista!==value.vista||!root.MT_POSTURAL_CORE.equal(old.documento,value.documento)){error=new Error('Há outra versão desta avaliação postural. Nada foi substituído.');tx.abort();}return;}
          rs.add(value);ss.add(ps.summary(value));added.push(value);
        };
      });
      tx.oncomplete=function(){resolve(added);};tx.onerror=tx.onabort=function(){reject(error||tx.error||new Error('Não foi possível restaurar as avaliações.'));};
    });}finally{db.close();}
  }
  async function previousCopies(api,id) {
    var current=scope(api),rows=(await scan(DB,'journal')).filter(function(x){return scopeKey(x.value.scope)===scopeKey(current)&&x.value.backup;});
    same(api,current);
    if(id){var row=rows.find(function(x){return x.key===id;});if(!row)fail('Cópia indisponível para esta conta.');download(row.value.backup);return true;}
    return rows.map(function(x){return {id:x.key,em:x.value.em};}).sort(function(a,b){return b.em.localeCompare(a.em);});
  }
  async function recover(api) {
    var marker=localStorage.getItem(LOCK);if(!marker)return;
    var lock=JSON.parse(marker);if(scopeKey(lock.scope)!==scopeKey(scope(api)))fail('Restauração pendente de outra conta. Entre na conta de origem.');
    var rows=await scan(DB,'journal'),entry=rows.find(function(x){return x.key===lock.id;});
    if(!entry)fail('A cópia anterior não foi encontrada. Não continue editando neste aparelho.');
    api.rollback(entry.value.before,entry.value.after);localStorage.removeItem(LOCK);
    return {recuperado:true};
  }
  root.MT_BACKUP={capture:capture,inspect:inspect,restore:restore,recover:recover,download:download,previousCopies:previousCopies,scope:scope,lockKey:LOCK};
})(typeof self!=='undefined'?self:globalThis);
