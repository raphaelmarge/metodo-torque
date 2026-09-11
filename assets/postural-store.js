/* Fotos fora de ptStudio, dos backups globais e de app_aluno.
 * Cada salvamento é um snapshot IMUTÁVEL. Não existe upsert de avaliação. */
(function (root) {
  'use strict';
  var dbPromise, TABLE='personal_postural';
  function db() {
    if (!dbPromise) dbPromise=new Promise(function(resolve,reject){
      var req=indexedDB.open('torque-postural-v1',1);
      req.onupgradeneeded=function(){
        req.result.createObjectStore('records',{keyPath:'key'});
        var index=req.result.createObjectStore('summaries',{keyPath:'key'});
        index.createIndex('scopeAluno',['scope','alunoId']);
      };
      req.onsuccess=function(){var d=req.result;d.onversionchange=function(){d.close();dbPromise=null;};resolve(d);};
      req.onerror=function(){dbPromise=null;reject(new Error('Não foi possível abrir o armazenamento das fotos neste navegador.'));};
      req.onblocked=function(){dbPromise=null;reject(new Error('Feche outras abas do app e tente novamente.'));};
    });
    return dbPromise;
  }
  function summary(rec) {return {key:rec.key,id:rec.id,scope:rec.scope,alunoId:rec.alunoId,data:rec.data,vista:rec.vista,
    criadoEm:rec.criadoEm,synced:!!rec.synced,parentId:rec.parentId||null};}
  function localPut(rec) {
    return db().then(function(d){return new Promise(function(resolve,reject){
      var tx=d.transaction(['records','summaries'],'readwrite');
      rec.key=rec.scope+'|'+rec.id;
      tx.objectStore('records').put(rec);tx.objectStore('summaries').put(summary(rec));
      tx.oncomplete=function(){resolve(rec);};
      tx.onerror=tx.onabort=function(){reject(new Error('Não foi possível salvar a foto neste aparelho. Libere espaço e tente novamente.'));};
    });});
  }
  function localGet(scope,id) {return db().then(function(d){return new Promise(function(resolve,reject){
    var r=d.transaction('records').objectStore('records').get(scope+'|'+id);
    r.onsuccess=function(){resolve(r.result||null);};r.onerror=function(){reject(new Error('Não foi possível ler esta avaliação.'));};
  });});}
  function localList(scope,alunoId) {return db().then(function(d){return new Promise(function(resolve,reject){
    var r=d.transaction('summaries').objectStore('summaries').index('scopeAluno').getAll(IDBKeyRange.only([scope,alunoId]));
    r.onsuccess=function(){resolve(r.result||[]);};r.onerror=function(){reject(new Error('Não foi possível ler o histórico local.'));};
  });});}
  function localDelete(scope,id) {return db().then(function(d){return new Promise(function(resolve,reject){
    var tx=d.transaction(['records','summaries'],'readwrite');
    tx.objectStore('records').delete(scope+'|'+id);tx.objectStore('summaries').delete(scope+'|'+id);
    tx.oncomplete=function(){resolve();};tx.onerror=tx.onabort=function(){reject(new Error('Não foi possível excluir a cópia local.'));};
  });});}
  async function context() {
    if (localStorage.getItem('mtapp:ptDemo')==='1') return {scope:'demo',demo:true};
    var cloud=root.MTStore && root.MTStore.cloud();
    if (!cloud || !cloud.client || !cloud.aid) return {scope:'local'};
    try {
      var session=await cloud.client.auth.getSession();
      var user=session.data && session.data.session && session.data.session.user;
      if (!user || !user.id || session.error) return {scope:'local'};
      return {scope:'account:'+cloud.aid+':'+user.id,aid:cloud.aid,uid:user.id,client:cloud.client};
    } catch (_) {return {scope:'local'};}
  }
  function cloudError(error) {
    if (error && /42P01|PGRST205/.test(error.code||'')) return new Error('O armazenamento postural na nuvem ainda precisa ser ativado. A cópia local foi mantida.');
    return new Error('Não foi possível confirmar a operação na nuvem. Confira a conexão e o login; a cópia local foi mantida.');
  }
  function query(ctx) {
    if (!ctx.client) throw new Error('Entre na conta para usar a nuvem.');
    return ctx.client.from(TABLE);
  }
  function own(q,ctx) {return q.eq('academia_id',ctx.aid).eq('autor_id',ctx.uid);}
  function fromRow(row,ctx) {return {id:row.id,scope:ctx.scope,alunoId:row.aluno_id,data:row.data,vista:row.vista,
    criadoEm:row.criado_em,documento:row.documento,parentId:row.parent_id||null,synced:true};}
  async function remoteList(ctx,alunoId,offset) {
    var r=await own(query(ctx).select('id,aluno_id,data,vista,criado_em,parent_id'),ctx).eq('aluno_id',alunoId)
      .order('criado_em',{ascending:false}).order('id',{ascending:false}).range(offset||0,(offset||0)+49);
    if(r.error)throw cloudError(r.error);
    return (r.data||[]).map(function(x){return fromRow(x,ctx);});
  }
  async function remoteGet(ctx,id) {
    var r=await own(query(ctx).select('*'),ctx).eq('id',id).single();
    if(r.error || !r.data)throw cloudError(r.error);
    root.MT_POSTURAL_CORE.validate(r.data.documento);
    return fromRow(r.data,ctx);
  }
  async function remotePut(ctx,rec) {
    if(rec.scope!==ctx.scope)throw new Error('A conta mudou. Reabra a avaliação na conta correta.');
    root.MT_POSTURAL_CORE.validate(rec.documento);
    var row={id:rec.id,academia_id:ctx.aid,autor_id:ctx.uid,aluno_id:rec.alunoId,data:rec.data,vista:rec.vista,
      documento:rec.documento,parent_id:rec.parentId||null,consentimento:true};
    var r=await query(ctx).insert(row).select('id').single();
    if (r.error && r.error.code==='23505') {
      // Retentativa após resposta perdida: só confirma o MESMO snapshot; nunca sobrescreve.
      var old=await remoteGet(ctx,rec.id);
      if(old.alunoId===rec.alunoId && old.data===rec.data && old.vista===rec.vista &&
        root.MT_POSTURAL_CORE.equal(old.documento,rec.documento))return true;
      throw new Error('Já existe outro conteúdo com este identificador. Salve uma nova versão.');
    }
    if(r.error || !r.data)throw cloudError(r.error);
    return true;
  }
  async function remoteDelete(ctx,id) {
    var r=await own(query(ctx).delete(),ctx).eq('id',id).select('id');
    if(r.error)throw cloudError(r.error);
    if(!r.data || !r.data.length)throw new Error('A exclusão na nuvem não foi confirmada. Atualize o histórico.');
  }
  root.MT_POSTURAL_STORE={context:context,localPut:localPut,localGet:localGet,localList:localList,localDelete:localDelete,
    remotePut:remotePut,remoteGet:remoteGet,remoteList:remoteList,remoteDelete:remoteDelete,summary:summary};
})(typeof self !== 'undefined' ? self : globalThis);
