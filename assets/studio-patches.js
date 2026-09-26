/* Operações pequenas, com comparação do conteúdo anterior. Sem rede/armazenamento. */
(function (root) {
  'use strict';
  var has = function (o,k) { return o != null && Object.prototype.hasOwnProperty.call(o,k); };
  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };
  function equal(a,b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    var keys=Object.keys(a); return keys.length===Object.keys(b).length && keys.every(function(k){return has(b,k)&&equal(a[k],b[k]);});
  }
  function safe(path) {
    return Array.isArray(path) && path.length>0 && path.length<=6 && path.every(function(k){return typeof k==='string'&&k.length>0&&k.length<200&&!['__proto__','constructor','prototype'].includes(k);});
  }
  function at(doc,path) {
    var v=doc;
    for(var k of path) {
      if(Array.isArray(v)) { var found=v.filter(function(x){return x&&String(x.id)===k;});if(found.length!==1)return {existe:false};v=found[0]; }
      else if(v&&typeof v==='object'&&has(v,k))v=v[k];
      else return {existe:false};
    }
    return {existe:true,valor:v};
  }
  function set(doc,path,next) {
    var parent=doc;
    for(var k of path.slice(0,-1)) {
      if(Array.isArray(parent))parent=parent.find(function(x){return x&&String(x.id)===k;});
      else parent=parent&&parent[k];
      if(!parent||typeof parent!=='object')throw Error('O item pai foi alterado.');
    }
    var key=path[path.length-1];
    if(Array.isArray(parent)) {
      var i=parent.findIndex(function(x){return x&&String(x.id)===key;});
      if(next.existe) {
        if(!next.valor||String(next.valor.id)!==key)throw Error('Identificador incompatível.');
        if(i<0)parent.push(clone(next.valor));else parent[i]=clone(next.valor);
      } else if(i>=0)parent.splice(i,1);
    } else if(next.existe)parent[key]=clone(next.valor);else delete parent[key];
  }
  function keyed(v) {return Array.isArray(v)&&v.every(function(x){return x&&typeof x==='object'&&typeof x.id==='string'&&safe([x.id]);})&&new Set(v.map(function(x){return x.id;})).size===v.length;}
  function diff(before,after) {
    if(!before||!after||Array.isArray(before)||Array.isArray(after)||typeof before!=='object'||typeof after!=='object')return null;
    var ops=[];
    function atomic(path) {var a=at(before,path),b=at(after,path);if(!equal(a,b))ops.push({caminho:path,antes:a,depois:b});}
    function array(path,a,b) {
      if(!keyed(a)||!keyed(b))return atomic(path);
      var ai=a.map(function(x){return x.id;}),bi=b.map(function(x){return x.id;});
      // Reordenação é uma operação única: não altera silenciosamente a ordem.
      if(!equal(ai.concat(bi.filter(function(id){return !ai.includes(id);})),bi))return atomic(path);
      Array.from(new Set(ai.concat(bi))).forEach(function(id){atomic(path.concat(id));});
    }
    Array.from(new Set(Object.keys(before).concat(Object.keys(after)))).forEach(function(key){
      var a=before[key],b=after[key];
      if(key==='alunos'&&has(before,key)&&has(after,key))return array([key],a,b);
      if(key==='treinosV2'&&a&&b&&!Array.isArray(a)&&!Array.isArray(b)&&typeof a==='object'&&typeof b==='object') {
        Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).forEach(function(id){
          if(!a[id]||!b[id]||typeof a[id]!=='object'||typeof b[id]!=='object'||Array.isArray(a[id])||Array.isArray(b[id]))return atomic([key,id]);
          Array.from(new Set(Object.keys(a[id]).concat(Object.keys(b[id])))).forEach(function(field){
            var path=[key,id,field];
            if(field==='fichas'&&has(a[id],field)&&has(b[id],field))array(path,a[id][field],b[id][field]);else atomic(path);
          });
        });return;
      }
      atomic([key]);
    });
    return ops.every(function(op){return safe(op.caminho);})?ops:null;
  }
  function apply(doc,ops) {
    var out=clone(doc);
    for(var op of ops) {
      if(!safe(op.caminho))throw Error('Caminho inválido.');
      var current=at(out,op.caminho);
      if(equal(current,op.depois))continue; // confirmação perdida: repetir é seguro
      if(!equal(current,op.antes))throw Error('O mesmo item foi alterado em outro aparelho.');
      set(out,op.caminho,op.depois);
    }
    return out;
  }
  var api={diff:diff,apply:apply,at:at,equal:equal};root.MT_STUDIO_PATCHES=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
