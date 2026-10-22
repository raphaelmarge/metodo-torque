/* Contrato compartilhado de alimentação. A fábrica é autocontida para o app offline. */
(function (root) {
  'use strict';
  function runtime() {
    'use strict';
    function txt(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
    function numero(v) { if (v == null || typeof v === 'boolean' || !String(v).trim()) return null; var n = Number(String(v).trim().replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : null; }
    function lista(v) { return Array.isArray(v) ? v : []; }
    // Optional measured-food snapshot; this stays inside the offline factory.
    // The same validation is exercised against food-measures.js by its tests.
    function normalizaMedida(raw) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1 || ['g','ml'].indexOf(raw.baseUnit) < 0 || !raw.nutrients || typeof raw.nutrients !== 'object' || Array.isArray(raw.nutrients) || !Array.isArray(raw.measures) || raw.measures.length > 21) return null;
      function num(v) {
        if (v == null || typeof v === 'boolean' || (typeof v !== 'number' && typeof v !== 'string') || (typeof v === 'string' && !/^\s*\d+(?:[.,]\d+)?\s*$/.test(v))) return null;
        var n=Number(String(v).trim().replace(',','.'));return Number.isFinite(n)&&n>=0?n:null;
      }
      var base=num(raw.baseAmount);
      if (base===null || base<=0 || base>100000) return null;
      var keys=['k','pt','cb','g','fb','sugars','saturated','sodiumMg','calciumMg','ironMg','potassiumMg','cholesterolMg','magnesiumMg','phosphorusMg','zincMg','vitaminCMg'],values={},invalid=false;
      keys.forEach(function(key,index){
        if(index>3&&!Object.prototype.hasOwnProperty.call(raw.nutrients,key))return;
        var value=raw.nutrients[key],n=value==null||value===''?null:num(value);
        if((value!=null&&value!==''&&n===null)||(n!==null&&n>100000))invalid=true;
        values[key]=n;
      });
      if(invalid)return null;
      var measures=[{id:raw.baseUnit,label:raw.baseUnit==='g'?'Grama (g)':'Mililitro (ml)',amount:1,unit:raw.baseUnit,source:'Unidade da base nutricional'}],ids=[raw.baseUnit];
      raw.measures.forEach(function(measure){
        if(!measure||typeof measure!=='object'){invalid=true;return;}
        var id=txt(measure.id,100),label=txt(measure.label,100),amount=num(measure.amount);
        if(!id||!label||amount===null||amount<=0||amount>100000||measure.unit!==raw.baseUnit){invalid=true;return;}
        if(id===raw.baseUnit&&amount===1)return;
        if(ids.indexOf(id)>=0){invalid=true;return;}
        ids.push(id);measures.push({id:id,label:label,amount:amount,unit:raw.baseUnit,source:txt(measure.source,400)});
      });
      if(invalid||measures.length>21||ids.indexOf(txt(raw.selectedMeasureId,100))<0)return null;
      var out={v:1,catalogId:txt(raw.catalogId,250),baseAmount:base,baseUnit:raw.baseUnit,nutrients:values,measures:measures,selectedMeasureId:txt(raw.selectedMeasureId,100)};
      ['source','sourceUrl','brand','barcode','retrievedAt','sourceUpdatedAt'].forEach(function(key){if(raw[key]!=null)out[key]=txt(raw[key],key==='sourceUrl'?2000:400);});
      return out;
    }
    function alimentoMedido(it) {
      var measurement=normalizaMedida(it.measurement);if(!measurement)return null;
      var selected=measurement.measures.filter(function(m){return m.id===measurement.selectedMeasureId;})[0],out={measurement:measurement};
      Object.keys(measurement.nutrients).forEach(function(key){var value=measurement.nutrients[key];out[key]=value===null?null:value*(selected.amount/measurement.baseAmount);});
      if(Object.keys(measurement.nutrients).some(function(key){return out[key]!==null&&(!Number.isFinite(out[key])||out[key]>100000);}))return null;
      out.porcao=selected.id===selected.unit&&selected.amount===1?'1 '+selected.unit:(/^1\s/.test(selected.label)?selected.label:'1 '+selected.label)+' ('+String(Number(selected.amount.toPrecision(12))).replace('.',',')+' '+selected.unit+')';
      out.baseGramas=measurement.baseUnit==='g'?selected.amount:null;
      if(measurement.source)out.fonte=measurement.source;
      return out;
    }
    function normalizaItem(it, semAlternativas) {
      if (!it || typeof it !== 'object') return null;
      if (Object.prototype.hasOwnProperty.call(it,'measurement')) {
        if(Object.prototype.hasOwnProperty.call(it,'recipeComposition'))return null;
        var measured=alimentoMedido(it);if(!measured)return null;
        it=Object.assign({},it,measured);
      }
      var qtd = numero(it.qtd), nome = txt(it.nome, 200), k = numero(it.k), pt = numero(it.pt), cb = numero(it.cb), g = numero(it.g);
      var composition = null;
      if (Object.prototype.hasOwnProperty.call(it, 'recipeComposition')) {
        composition = normalizaComposicao(it.recipeComposition);
        if (!composition) return null;
        var macros = {k:0,pt:0,cb:0,g:0};
        var nutrientKeys=['k','pt','cb','g','fb','sugars','saturated','sodiumMg','calciumMg','ironMg','potassiumMg','cholesterolMg','magnesiumMg','phosphorusMg','zincMg','vitaminCMg'];
        nutrientKeys.forEach(function(key,index){
          if(index>3&&!composition.ingredients.some(function(ingredient){return Object.prototype.hasOwnProperty.call(ingredient,key);}))return;
          macros[key]=composition.ingredients.some(function(ingredient){return ingredient[key]==null;})?null:composition.ingredients.reduce(function(sum,ingredient){return sum+ingredient[key]*ingredient.qtd/composition.yield;},0);
        });
        k=macros.k; pt=macros.pt; cb=macros.cb; g=macros.g;
        it=Object.assign({},it,macros);
      }
      if (!nome || qtd === null || qtd <= 0 || qtd > 1000 || k === null || pt === null || cb === null || g === null) return null;
      if ([k, pt, cb, g].some(function (v) { return v > 100000; })) return null;
      var extraNutrients={},invalidExtra=false;
      ['fb','sugars','saturated','sodiumMg','calciumMg','ironMg','potassiumMg','cholesterolMg','magnesiumMg','phosphorusMg','zincMg','vitaminCMg'].forEach(function(key){
        if(!Object.prototype.hasOwnProperty.call(it,key))return;
        var value=it[key],n=numero(value);
        if(value!=null&&value!==''&&(n===null||n>100000||(typeof value!=='number'&&typeof value!=='string')))invalidExtra=true;
        extraNutrients[key]=n;
      });
      if(invalidExtra)return null;
      var out = { id: txt(it.id, 100), alimId: txt(it.alimId, 250), nome: nome, porcao: txt(it.porcao, 100), qtd: qtd, k: k, pt: pt, cb: cb, g: g };
      Object.keys(extraNutrients).forEach(function(key){out[key]=extraNutrients[key];});
      if(it.measurement){out.measurement=it.measurement;Object.keys(it.measurement.nutrients).forEach(function(key){out[key]=it[key];});}
      if (composition) { out.recipeComposition = composition; Object.keys(macros).forEach(function(key){out[key]=macros[key];}); }
      var peso = numero(it.baseGramas);
      if (peso !== null && peso > 0 && peso <= 100000) out.baseGramas = peso;
      ['fonte','preparo','receitaId','categoria'].forEach(function (key) { if (it[key] != null) out[key] = txt(it[key], key === 'fonte' ? 400 : 120); });
      if (Array.isArray(it.medidas)) out.medidas = it.medidas.slice(0, 20).map(function (m) {
        var gramas = m && numero(m.gramas), nome = m && txt(m.nome, 100);
        return nome && gramas !== null && gramas > 0 && gramas <= 100000 ? { nome: nome, gramas: gramas } : null;
      }).filter(Boolean);
      if (semAlternativas !== true && Array.isArray(it.substituicoes)) out.substituicoes = it.substituicoes.slice(0, 12).map(function (alt) { return normalizaItem(alt, true); }).filter(Boolean);
      return out;
    }
    function normalizaComposicao(raw) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1 || tamanhoJSON(raw) > 80000) return null;
      var rendimento = numero(raw.yield), title=txt(raw.title,200), ingredients=lista(raw.ingredients);
      if (!title || rendimento===null || rendimento<=0 || rendimento>1000 || !ingredients.length || ingredients.length>100 || !Array.isArray(raw.steps) || raw.steps.length>40 || (raw.unquantifiedIngredients!=null && (!Array.isArray(raw.unquantifiedIngredients)||raw.unquantifiedIngredients.length))) return null;
      if (ingredients.some(function (it) { return !it || Object.prototype.hasOwnProperty.call(it,'recipeComposition') || !txt(it.porcao,100); })) return null;
      var normalized=ingredients.map(function (it) { return normalizaItem(it,true); });
      if (normalized.some(function (it) { return !it; })) return null;
      var out={v:1,recipeId:txt(raw.recipeId,100),recipeVersion:Number.isInteger(raw.recipeVersion)&&raw.recipeVersion>0?raw.recipeVersion:1,title:title,yield:rendimento,ingredients:normalized,steps:raw.steps.map(function(step){return txt(step,1500);}).filter(Boolean),source:txt(raw.source,400)};
      if(raw.notes)out.notes=txt(raw.notes,4000);
      if (raw.reviewedAt) { if(!Number.isFinite(Date.parse(raw.reviewedAt)))return null;out.reviewedAt=txt(raw.reviewedAt,40); }
      return out;
    }
    function totalItens(itens) {
      var total = { k: 0, pt: 0, cb: 0, g: 0 };
      lista(itens).forEach(function (it) { it = normalizaItem(it); if (!it) return; ['k','pt','cb','g'].forEach(function (key) { total[key] += it[key] * it.qtd; }); });
      return total;
    }
    function hora(v) { v = txt(v, 5); return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : ''; }
    function normalizaPlano(p) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
      var out = { v: 1, ativo: p.ativo !== false, id: txt(p.id, 100), atualizadoEm: txt(p.atualizadoEm, 40), titulo: txt(p.titulo, 160), objetivo: txt(p.objetivo, 300), orientacoes: txt(p.orientacoes, 6000), responsavel: txt(p.responsavel, 160), crn: txt(p.crn, 80),
        refeicoes: lista(p.refeicoes).slice(0, 30).filter(function (r) { return r && typeof r === 'object'; }).map(function (r) {
          var ref = { id: txt(r.id, 100), hora: hora(r.hora), titulo: txt(r.titulo, 120), itens: lista(r.itens).slice(0, 100).map(function (it) { return normalizaItem(it); }).filter(Boolean) };
          if (Array.isArray(r.dias)) ref.dias = r.dias.filter(function (v, i, all) { return Number.isInteger(v) && v >= 0 && v <= 6 && all.indexOf(v) === i; }).sort();
          if (r.receitaId != null) ref.receitaId = txt(r.receitaId, 100);
          return ref;
        }) };
      if (p.metas && typeof p.metas === 'object') {
        out.metas = {}; ['k','pt','cb','g'].forEach(function (key) { var n = numero(p.metas[key]); out.metas[key] = n !== null && n <= 100000 ? n : null; });
      }
      if (p.avaliacao && typeof p.avaliacao === 'object') {
        out.avaliacao = {}; ['alergias','restricoes','preferencias','evita','rotina','orcamento','preparo'].forEach(function (key) { out.avaliacao[key] = txt(p.avaliacao[key], 2000); });
      }
      if (p.inicio != null) out.inicio = dia(p.inicio);
      if (p.fim != null) out.fim = dia(p.fim);
      if (p.versao != null) out.versao = Number.isInteger(+p.versao) && +p.versao >= 1 && +p.versao <= 1000000 ? +p.versao : 1;
      if (Array.isArray(p.catalogo)) out.catalogo = p.catalogo.slice(0, 2000).map(function (it) { return normalizaItem(it, true); }).filter(Boolean);
      if (Array.isArray(p.receitas)) out.receitas = p.receitas.slice(0, 200).map(normalizaReceita).filter(Boolean);
      return out;
    }
    function dia(v) { var s = txt(v, 10), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return ''; var d = new Date(+m[1], +m[2] - 1, +m[3], 12); return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? s : ''; }
    function normalizaRegistro(r) {
      if (!r || typeof r !== 'object' || !/^[A-Za-z0-9:_-]{1,300}$/.test(String(r.id || '')) || ['__proto__','constructor','prototype'].indexOf(r.id) >= 0 || !dia(r.d)) return null;
      var stamp = txt(r.atualizadoEm, 40);
      if (!Number.isFinite(Date.parse(stamp))) return null;
      var foto = String(r.foto || '');
      if (foto.length > 60000 || (foto && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(foto))) return null;
      return { id: txt(r.id, 300), d: dia(r.d), refeicaoId: txt(r.refeicaoId, 100), titulo: txt(r.titulo, 120), hora: hora(r.hora), itens: lista(r.itens).slice(0, 100).map(function (it) { return normalizaItem(it); }).filter(Boolean), origem: ['plano','manual','foto'].indexOf(r.origem) >= 0 ? r.origem : 'manual', foto: txt(r.foto, 60000), atualizadoEm: stamp, apagado: !!r.apagado, estimativa: !!r.estimativa, observacao: txt(r.observacao, 2000) };
    }
    function normalizaReceita(r) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
      var nome = txt(r.nome || r.n, 200); if (!nome) return null;
      var tempo = numero(r.tempo), rende = numero(r.rendimento == null ? r.rende : r.rendimento);
      var out = { id: txt(r.id, 100), nome: nome, categoria: txt(r.categoria || r.cat, 120), tempo: tempo !== null && tempo <= 10080 ? tempo : null,
        rendimento: rende !== null && rende > 0 && rende <= 1000 ? rende : 1,
        ingredientes: lista(r.ingredientes || r.ing).slice(0, 100).map(function (x) { return txt(x, 500); }).filter(Boolean),
        modo: lista(r.modo).slice(0, 40).map(function (x) { return txt(x, 1500); }).filter(Boolean),
        itens: lista(r.itens).slice(0, 100).map(function (it) { return normalizaItem(it, true); }).filter(Boolean), fonte: txt(r.fonte, 400) };
      if(r.notes||r.observacoes)out.notes=txt(r.notes||r.observacoes,4000);
      // Uma composição parcial é somente consultável; nunca prescrever uma receita omitindo ingredientes inválidos.
      if (lista(r.itens).length !== out.itens.length) { out.itens = []; out.composicaoIncompleta = true; }
      // O catálogo legado contém energia/proteína parciais; ausência de carboidrato/gordura não é zero.
      ['k','pt','cb','g'].forEach(function (key) { var n = numero(r[key]); if (n !== null && n <= 100000) out[key] = n; });
      return out;
    }
    function gramasPorcao(it) {
      var n = it && numero(it.baseGramas); if (n !== null && n > 0 && n <= 100000) return n;
      var s = txt(it && it.porcao, 100), m = /^(\d+(?:[.,]\d+)?)\s*(g|kg)$/i.exec(s);
      if (m) { n = numero(m[1]) * (m[2].toLowerCase() === 'kg' ? 1000 : 1); return n > 0 && n <= 100000 ? n : null; }
      m = /\((\d+(?:[.,]\d+)?)\s*g\)/i.exec(s);
      if (m) { n = numero(m[1]); if (n > 0 && n <= 100000) return n; }
      return null;
    }
    function refeicoesDia(p, data) {
      data = dia(data); if (!p || !data || p.ativo === false) return [];
      var ini = dia(p.inicio), fim = dia(p.fim); if ((ini && data < ini) || (fim && data > fim)) return [];
      var sem = new Date(data + 'T12:00:00').getDay();
      return lista(p.refeicoes).filter(function (r) { return r && (!Array.isArray(r.dias) || !r.dias.length || r.dias.indexOf(sem) >= 0); });
    }
    function totalPlano(p, data) {
      var refs = data == null ? lista(p && p.refeicoes) : refeicoesDia(p, data);
      return totalItens(refs.reduce(function (out, r) { return out.concat(lista(r.itens)); }, []));
    }
    function listaCompras(p, inicio, dias) {
      inicio = dia(inicio); dias = Number(dias); if (!inicio || !Number.isInteger(dias) || dias < 1 || dias > 31) return [];
      var map = Object.create(null), out = [];
      for (var i = 0; i < dias; i++) {
        var dt = new Date(inicio + 'T12:00:00'); dt.setDate(dt.getDate() + i);
        var d = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
        refeicoesDia(p, d).forEach(function (r) { lista(r.itens).forEach(function (raw) {
          var it = normalizaItem(raw, true); if (!it) return;
          var peso = gramasPorcao(it), key = JSON.stringify([it.alimId || it.nome.toLocaleLowerCase('pt-BR'), it.porcao, peso]);
          if (!map[key]) { map[key] = { nome: it.nome, porcao: it.porcao, qtd: 0, baseGramas: peso, gramas: peso === null ? null : 0 }; out.push(map[key]); }
          map[key].qtd += it.qtd; if (peso !== null) map[key].gramas += peso * it.qtd;
        }); });
      }
      return out.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    }
    function tamanhoJSON(v) {
      try { var s = JSON.stringify(v); if (typeof s !== 'string') return Infinity;
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
        return encodeURIComponent(s).replace(/%[A-F\d]{2}/g, 'x').length;
      } catch (_) { return Infinity; }
    }
    function validaReceita(r) {
      if (!r || !txt(r.nome || r.n, 200)) return 'Dê um nome à receita.';
      if (tamanhoJSON(r) > 80000) return 'A receita está muito grande. Reduza o texto ou a quantidade de ingredientes antes de salvar.';
      if (lista(r.itens).length > 100 || lista(r.ingredientes || r.ing).length > 100 || lista(r.modo).length > 40) return 'Use até 100 ingredientes e 40 etapas por receita.';
      if (lista(r.itens).some(function (it) { return !normalizaItem(it, true); })) return 'Complete os valores dos ingredientes da receita. Nutriente desconhecido não é zero.';
      if (lista(r.itens).some(function (it) { return lista(it.medidas).length > 20; })) return 'Use até 20 medidas caseiras por alimento.';
      return '';
    }
    function validaPlanoEntrada(p) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return 'Plano inválido.';
      if (tamanhoJSON(p) > 1200000) return 'O plano e a biblioteca estão muito grandes para publicar. Reduza as receitas ou os alimentos personalizados; o rascunho foi mantido.';
      if (lista(p.refeicoes).length > 30 || lista(p.catalogo).length > 2000 || lista(p.receitas).length > 200) return 'O plano aceita até 30 refeições, 2000 alimentos e 200 receitas.';
      var erro = '';
      lista(p.refeicoes).forEach(function (r) {
        if (!r || lista(r.itens).length > 100) { erro = 'Use até 100 alimentos por refeição.'; return; }
        if (tamanhoJSON(r) > 60000) { erro = 'Esta refeição está muito grande. Reduza textos ou alternativas para permitir o registro no app.'; return; }
        lista(r.itens).forEach(function (it) {
          if (!normalizaItem(it) || lista(it.substituicoes).some(function (alt) { return !normalizaItem(alt, true); })) erro = 'Confira os nutrientes e quantidades de todos os alimentos e substituições.';
          else if (lista(it.substituicoes).length > 12 || lista(it.medidas).length > 20) erro = 'Use até 12 substituições e 20 medidas caseiras por alimento.';
        });
      });
      if (!erro && lista(p.catalogo).some(function (it) { return !normalizaItem(it, true); })) erro = 'Confira os valores nutricionais dos alimentos da biblioteca.';
      lista(p.receitas).forEach(function (r) { if (!erro) erro = validaReceita(r); });
      return erro;
    }
    return { normalizaPlano: normalizaPlano, totalItens: totalItens, normalizaRegistro: normalizaRegistro, normalizaItem: normalizaItem,
      normalizaReceita: normalizaReceita, gramasPorcao: gramasPorcao, refeicoesDia: refeicoesDia, totalPlano: totalPlano, listaCompras: listaCompras,
      tamanhoJSON: tamanhoJSON, validaReceita: validaReceita, validaPlanoEntrada: validaPlanoEntrada };
  }
  root.MT_NUTRICAO = runtime();
  root.MT_NUTRICAO.runtime = runtime;
})(typeof self !== 'undefined' ? self : globalThis);
