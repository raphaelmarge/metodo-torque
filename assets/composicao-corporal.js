/* TORQUE ON — motor de composição corporal (laudo completo, estilo bioimpedância).
 *
 * Calcula tudo o que dá pra calcular a partir de peso, altura, idade, sexo,
 * % de gordura (dobras/fita) e circunferências. Quando o profissional digita os
 * valores medidos numa balança de bioimpedância (InBody, Omron etc.), esses
 * valores VENCEM os estimados e o laudo marca "medido".
 *
 * Referências: Watson (água corporal), Lee 2000 (massa muscular esquelética),
 * Siri/Pollock/Guedes (% gordura por dobras), US Navy (% por fita),
 * Katch-McArdle (metabolismo basal), OMS (IMC, cintura, cintura-quadril),
 * AWGS/EWGSOP (índice de massa muscular).
 *
 * Nada aqui substitui avaliação profissional — os valores estimados vêm
 * marcados como estimativa na tela e no laudo.
 */
(function (raiz) {
  var A = {};

  function n(v) { return typeof v === "number" && isFinite(v) && v > 0 ? v : 0; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }

  // ---------- faixas de referência ----------
  A.FAIXA_GORDURA = { M: [10, 20], F: [18, 28] };   // % de gordura saudável
  A.FAIXA_IMC = [18.5, 24.9];
  A.SMI_BAIXO = { M: 7.0, F: 5.7 };                  // kg/m² — corte de baixa massa muscular (AWGS, índice apendicular)
  A.ALVO_GORDURA = { M: 15, F: 23 };                 // % de gordura usado como meta no controle de peso
  A.IMC_PADRAO = { M: 22, F: 21 };                   // IMC de referência do grau de obesidade
  A.APENDICULAR = { M: 0.44, F: 0.40 };              // fração da massa magra que fica nos 4 membros
  A.MME_DA_MAGRA = { M: 0.55, F: 0.52 };             // fração da massa magra que é músculo esquelético
  A.CINTURA_RISCO = { M: [94, 102], F: [80, 88] };   // cm — atenção / alto (OMS)
  A.RCQ_RISCO = { M: [0.90, 1.0], F: [0.80, 0.85] };

  A.classeImc = function (imc) {
    if (!imc) return "";
    if (imc < 18.5) return "abaixo do peso";
    if (imc < 25) return "peso normal";
    if (imc < 30) return "sobrepeso";
    if (imc < 35) return "obesidade grau 1";
    if (imc < 40) return "obesidade grau 2";
    return "obesidade grau 3";
  };

  // "abaixo" | "normal" | "acima" comparando com uma faixa [min, max]
  A.ondeEsta = function (v, faixa) {
    if (!v || !faixa) return "";
    if (v < faixa[0]) return "abaixo";
    if (v > faixa[1]) return "acima";
    return "normal";
  };

  // ---------- gasto calórico por atividade (30 min) ----------
  A.ATIVIDADES = [
    { n: "Caminhada", met: 3.5 }, { n: "Musculação", met: 5.0 },
    { n: "Hidroginástica", met: 5.5 }, { n: "Dança", met: 6.5 },
    { n: "Basquete", met: 6.5 }, { n: "Natação", met: 7.0 },
    { n: "Futebol", met: 7.0 }, { n: "Tênis", met: 7.3 },
    { n: "Boxe (saco)", met: 7.8 }, { n: "Corrida leve", met: 8.0 },
    { n: "Ciclismo", met: 8.0 }, { n: "Funcional", met: 8.0 },
    { n: "Spinning", met: 8.5 }, { n: "Subir escada", met: 8.8 },
    { n: "Pular corda", met: 10.0 }, { n: "Yoga", met: 3.0 },
    { n: "Pilates", met: 3.5 }, { n: "Alongamento", met: 2.3 },
  ];
  A.gastos = function (peso, minutos) {
    var m = (minutos || 30) / 60;
    if (!n(peso)) return [];
    return A.ATIVIDADES.map(function (x) {
      return { nome: x.n, kcal: Math.round(x.met * peso * m) };
    }).sort(function (a, b) { return a.kcal - b.kcal; });
  };

  // ---------- água corporal total (Watson) ----------
  A.agua = function (sexo, idade, altura, peso) {
    if (!n(altura) || !n(peso)) return 0;
    if (sexo === "F") return r1(-2.097 + 0.1069 * altura + 0.2466 * peso);
    return r1(2.447 - 0.09156 * (n(idade) || 30) + 0.1074 * altura + 0.3362 * peso);
  };

  // ---------- massa muscular esquelética ----------
  // Lee 2000 quando há perímetro + dobra do mesmo segmento; senão proporção da massa magra.
  A.mme = function (d, massaMagra) {
    var c = d.circ || {}, db = d.dobras || {};
    var alturaM = n(d.altura) / 100;
    var temLee = n(c.braco) && n(c.coxa) && n(c.panturrilha) &&
      n(db["Tríceps"]) && n(db["Coxa"]) && n(db["Panturrilha"]) && alturaM;
    if (temLee) {
      var cag = c.braco - Math.PI * (db["Tríceps"] / 10);
      var ctg = c.coxa - Math.PI * (db["Coxa"] / 10);
      var ccg = c.panturrilha - Math.PI * (db["Panturrilha"] / 10);
      var sm = alturaM * (0.00744 * cag * cag + 0.00088 * ctg * ctg + 0.00441 * ccg * ccg) +
        2.4 * (d.sexo === "F" ? 0 : 1) - 0.048 * (n(d.idade) || 30) + 7.8;
      if (sm > 0 && sm < massaMagra) return { kg: r1(sm), fonte: "Lee (perímetros + dobras)" };
    }
    if (!massaMagra) return { kg: 0, fonte: "" };
    return { kg: r1(massaMagra * (A.MME_DA_MAGRA[d.sexo] || A.MME_DA_MAGRA.M)), fonte: "proporção da massa magra" };
  };

  // ---------- pontuação TORQUE (0 a 100) ----------
  // Parte de 80 e ajusta pelo que realmente importa: gordura dentro da faixa
  // e massa muscular no índice saudável. Transparente de propósito.
  A.pontuacao = function (o, sexo) {
    if (!o.gordura && !o.smi) return null;
    var p = 80;
    var fg = A.FAIXA_GORDURA[sexo] || A.FAIXA_GORDURA.M;
    if (o.gordura) {
      if (o.gordura < fg[0]) p -= Math.min(10, (fg[0] - o.gordura) * 1.5);
      else if (o.gordura > fg[1]) p -= Math.min(30, (o.gordura - fg[1]) * 1.6);
      else p += 6;
    }
    if (o.smi) {
      var corte = A.SMI_BAIXO[sexo] || A.SMI_BAIXO.M;
      if (o.smi < corte) p -= Math.min(20, (corte - o.smi) * 8);
      else p += Math.min(14, (o.smi - corte) * 6);
    }
    return Math.max(20, Math.min(100, Math.round(p)));
  };

  /* ---------- cálculo completo ----------
   * d = {
   *   sexo:"M"|"F", idade, altura(cm), peso(kg), gordura(%),
   *   circ: {cintura, quadril, braco, coxa, panturrilha, pescoco, torax, abdomen, antebraco},
   *   dobras: {"Tríceps":mm, ...},
   *   bia: {agua, proteina, mineral, massaGordura, mme, visceral, anguloFase,
   *         segmentar:[{nome, magra, gordura}]},
   *   atividade: 1.2 … 1.9
   * }
   */
  A.calcula = function (d) {
    d = d || {};
    var sexo = d.sexo === "F" ? "F" : "M";
    var bia = d.bia || {};
    var o = { sexo: sexo, idade: n(d.idade) || null, altura: n(d.altura) || null, peso: n(d.peso) || null, medido: {} };
    if (!o.peso || !o.altura) { o.ok = false; o.aviso = "Informe pelo menos peso e altura."; return o; }
    o.ok = true;
    var alturaM = o.altura / 100;

    // --- gordura e massa magra
    o.gordura = n(d.gordura) || null;
    if (n(bia.massaGordura)) {
      o.massaGordura = r1(bia.massaGordura);
      o.gordura = r1(bia.massaGordura / o.peso * 100);
      o.medido.gordura = true;
    } else if (o.gordura) {
      o.massaGordura = r1(o.peso * o.gordura / 100);
    }
    o.massaMagra = o.massaGordura ? r1(o.peso - o.massaGordura) : null;
    o.faixaGordura = A.FAIXA_GORDURA[sexo];
    o.classeGordura = A.ondeEsta(o.gordura, o.faixaGordura);

    // --- água, proteína e minerais
    // Com a massa magra na mão, a água sai dela (é ~73% de tudo que não é gordura) —
    // é o que a bioimpedância faz. Sem % de gordura, cai pra fórmula de Watson.
    if (n(bia.agua)) { o.agua = r1(bia.agua); o.medido.agua = true; }
    else if (o.massaMagra) o.agua = r1(o.massaMagra * 0.732);
    else o.agua = A.agua(sexo, o.idade, o.altura, o.peso);

    if (n(bia.mineral)) { o.mineral = r2(bia.mineral); o.medido.mineral = true; }
    else if (o.massaMagra) o.mineral = r2(o.massaMagra * 0.0685);
    if (n(bia.proteina)) { o.proteina = r1(bia.proteina); o.medido.proteina = true; }
    else if (o.massaMagra) {
      var p = o.massaMagra - o.agua - (o.mineral || 0);
      o.proteina = r1(p > 0 ? p : o.massaMagra * 0.195);
    }

    // --- massa muscular esquelética e índice (SMI)
    if (n(bia.mme)) { o.mme = r1(bia.mme); o.mmeFonte = "bioimpedância"; o.medido.mme = true; }
    else if (o.massaMagra) { var m = A.mme(d, o.massaMagra); o.mme = m.kg; o.mmeFonte = m.fonte; }
    // índice de massa muscular apendicular (dos 4 membros) — é esse que tem corte de referência
    var apend = 0;
    if (o.segmentarSoma) apend = o.segmentarSoma;
    else if (bia.segmentar && bia.segmentar.length) {
      apend = bia.segmentar.filter(function (s) { return !/tronco/i.test(s.nome); })
        .reduce(function (t, s) { return t + (n(s.magra) || 0); }, 0);
    } else if (o.massaMagra) apend = o.massaMagra * (A.APENDICULAR[sexo] || A.APENDICULAR.M);
    if (apend) {
      o.massaApendicular = r1(apend);
      o.smi = r1(apend / (alturaM * alturaM));
      o.smiCorte = A.SMI_BAIXO[sexo];
      o.smiBaixo = o.smi < o.smiCorte;
    }

    // --- IMC, peso de referência e peso ideal
    o.imc = r1(o.peso / (alturaM * alturaM));
    o.classeImc = A.classeImc(o.imc);
    o.faixaPeso = [r1(A.FAIXA_IMC[0] * alturaM * alturaM), r1(A.FAIXA_IMC[1] * alturaM * alturaM)];
    o.classePeso = A.ondeEsta(o.peso, o.faixaPeso);
    o.pesoPadrao = r1((A.IMC_PADRAO[sexo] || 22) * alturaM * alturaM);
    o.grauObesidade = Math.round(o.peso / o.pesoPadrao * 100);
    // Peso ideal olhando a COMPOSIÇÃO, não só a balança: quem já tem gordura
    // dentro da faixa saudável não precisa perder peso, mesmo com IMC alto de músculo.
    if (o.massaMagra) {
      o.pesoIdeal = o.gordura <= o.faixaGordura[1]
        ? r1(o.peso)
        : r1(o.massaMagra / (1 - (A.ALVO_GORDURA[sexo] || 15) / 100));
      o.pesoIdealFonte = "mantendo a massa magra atual";
    } else {
      o.pesoIdeal = r1(22 * alturaM * alturaM);
      o.pesoIdealFonte = "IMC 22 (sem % de gordura medido)";
    }

    // --- faixas de referência dos compartimentos (derivadas do peso ideal)
    var magraIdeal = [r1(o.pesoIdeal * (1 - o.faixaGordura[1] / 100)), r1(o.pesoIdeal * (1 - o.faixaGordura[0] / 100))];
    o.faixaMassaGordura = [r1(o.pesoIdeal * o.faixaGordura[0] / 100), r1(o.pesoIdeal * o.faixaGordura[1] / 100)];
    o.faixaAgua = [r1(magraIdeal[0] * 0.712), r1(magraIdeal[1] * 0.752)];
    o.faixaProteina = [r1(magraIdeal[0] * 0.185), r1(magraIdeal[1] * 0.205)];
    o.faixaMineral = [r2(magraIdeal[0] * 0.063), r2(magraIdeal[1] * 0.074)];
    o.faixaMme = [r1(magraIdeal[0] * (sexo === "F" ? 0.48 : 0.52)), r1(magraIdeal[1] * (sexo === "F" ? 0.53 : 0.57))];
    o.classeMme = A.ondeEsta(o.mme, o.faixaMme);
    o.classeMassaGordura = A.ondeEsta(o.massaGordura, o.faixaMassaGordura);

    // --- metas de controle (quanto perder de gordura, quanto ganhar de músculo)
    o.controlePeso = r1(o.pesoIdeal - o.peso);
    if (o.massaGordura) {
      o.controleGordura = o.gordura <= o.faixaGordura[1]
        ? 0
        : r1(o.pesoIdeal * (A.ALVO_GORDURA[sexo] || 15) / 100 - o.massaGordura);
    }
    if (o.mme) o.controleMusculo = o.mme < o.faixaMme[0] ? r1(o.faixaMme[0] - o.mme) : 0;

    // --- metabolismo
    o.tmb = o.massaMagra
      ? Math.round(370 + 21.6 * o.massaMagra)                                  // Katch-McArdle
      : Math.round(10 * o.peso + 6.25 * o.altura - 5 * (o.idade || 30) + (sexo === "F" ? -161 : 5)); // Mifflin
    o.tmbFonte = o.massaMagra ? "Katch-McArdle (usa a massa magra)" : "Mifflin-St Jeor";
    o.fatorAtividade = n(d.atividade) || 1.55;
    o.ingestao = Math.round(o.tmb * o.fatorAtividade);

    // --- cintura e cintura-quadril
    var c = d.circ || {};
    if (n(c.cintura)) {
      o.cintura = r1(c.cintura);
      var fc = A.CINTURA_RISCO[sexo];
      o.riscoCintura = o.cintura >= fc[1] ? "alto" : o.cintura >= fc[0] ? "moderado" : "baixo";
      if (n(c.quadril)) {
        o.quadril = r1(c.quadril);
        o.rcq = r2(o.cintura / o.quadril);
        var fr = A.RCQ_RISCO[sexo];
        o.riscoRcq = o.rcq >= fr[1] ? "alto" : o.rcq >= fr[0] ? "moderado" : "baixo";
      }
    }

    // --- extras que só existem com aparelho
    if (n(bia.visceral)) { o.visceral = bia.visceral; o.medido.visceral = true; }
    if (n(bia.anguloFase)) { o.anguloFase = bia.anguloFase; o.medido.anguloFase = true; }
    if (bia.segmentar && bia.segmentar.length) { o.segmentar = bia.segmentar; o.medido.segmentar = true; }

    o.pontuacao = A.pontuacao(o, sexo);
    o.gastos = A.gastos(o.peso, 30);
    o.estimado = !o.medido.gordura && !o.medido.mme; // laudo avisa quando é estimativa
    return o;
  };

  // ---------- laudo imprimível ----------
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function vg(v, casas) {
    if (v == null || v === "" || !isFinite(v)) return "—";
    var c = casas == null ? 1 : casas;
    return (c === 0 ? String(Math.round(v)) : Number(v).toFixed(c)).replace(".", ",");
  }
  function dataBr(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
    return iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
  }

  // barra horizontal com a faixa saudável destacada, no espírito do laudo de bioimpedância
  function barra(valor, faixa, unidade, casas) {
    if (valor == null || !faixa) return "";
    var lo = faixa[0], hi = faixa[1];
    var min = Math.min(valor, lo) * 0.75, max = Math.max(valor, hi) * 1.25;
    var pos = function (v) { return Math.max(0, Math.min(100, (v - min) / (max - min) * 100)); };
    var classe = A.ondeEsta(valor, faixa);
    return "<div class='barra'>" +
      "<div class='trilho'><div class='ok' style='left:" + pos(lo) + "%;width:" + (pos(hi) - pos(lo)) + "%'></div>" +
      "<div class='pino " + classe + "' style='left:" + pos(valor) + "%'></div></div>" +
      "<div class='barra-leg'><span>" + vg(lo, casas) + "</span><span class='cls " + classe + "'>" + classe + "</span><span>" + vg(hi, casas) + (unidade ? " " + unidade : "") + "</span></div>" +
      "</div>";
  }

  function linha(rot, valor, unidade, faixa, casas, obs) {
    return "<tr><th>" + esc(rot) + "</th><td class='v'>" + vg(valor, casas) + (unidade ? " <small>" + unidade + "</small>" : "") +
      (obs ? "<div class='obs'>" + esc(obs) + "</div>" : "") + "</td><td class='b'>" + (faixa ? barra(valor, faixa, "", casas) : "") + "</td></tr>";
  }

  /* op = { nome, quando, altura, idade, sexo, profissional, marca, cor, historico:[{data,peso,gordura,mme}] } */
  A.laudoHtml = function (o, op) {
    op = op || {};
    var cor = op.cor || "#7c3aed";
    var sexoRot = o.sexo === "F" ? "Feminino" : "Masculino";
    var hist = (op.historico || []).slice(-8);

    var comp = "<table class='bloco'>" +
      linha("Água corporal total", o.agua, "L", o.faixaAgua) +
      linha("Proteína", o.proteina, "kg", o.faixaProteina) +
      linha("Minerais", o.mineral, "kg", o.faixaMineral, 2) +
      linha("Massa de gordura", o.massaGordura, "kg", o.faixaMassaGordura) +
      linha("Peso", o.peso, "kg", o.faixaPeso) +
      "</table>";

    var musc = "<table class='bloco'>" +
      linha("Massa muscular esquelética", o.mme, "kg", o.faixaMme, 1, o.mmeFonte ? "por " + o.mmeFonte : "") +
      linha("Massa livre de gordura", o.massaMagra, "kg") +
      linha("IMC", o.imc, "kg/m²", A.FAIXA_IMC, 1, o.classeImc) +
      linha("Percentual de gordura", o.gordura, "%", o.faixaGordura) +
      "</table>";

    var ctrl = "<table class='bloco simples'>" +
      "<tr><th>Peso ideal</th><td>" + vg(o.pesoIdeal) + " kg" + (o.pesoIdealFonte ? " <small>(" + esc(o.pesoIdealFonte) + ")</small>" : "") + "</td></tr>" +
      "<tr><th>Ajuste de peso</th><td class='" + (Math.abs(o.controlePeso) < 0.5 ? "zero" : "") + "'>" + (Math.abs(o.controlePeso) < 0.5 ? "está no peso" : (o.controlePeso > 0 ? "+" : "") + vg(o.controlePeso) + " kg") + "</td></tr>" +
      (o.controleGordura != null ? "<tr><th>Ajuste de gordura</th><td class='" + (Math.abs(o.controleGordura) < 0.5 ? "zero" : "") + "'>" + (Math.abs(o.controleGordura) < 0.5 ? "está na faixa" : (o.controleGordura > 0 ? "+" : "") + vg(o.controleGordura) + " kg") + "</td></tr>" : "") +
      (o.controleMusculo != null ? "<tr><th>Ganho de músculo sugerido</th><td class='" + (o.controleMusculo < 0.5 ? "zero" : "") + "'>" + (o.controleMusculo < 0.5 ? "está na faixa" : "+" + vg(o.controleMusculo) + " kg") + "</td></tr>" : "") +
      "<tr><th>Grau de obesidade</th><td>" + o.grauObesidade + " % <small>(normal 90–110)</small></td></tr>" +
      "</table>";

    var extra = "<table class='bloco simples'>" +
      "<tr><th>Metabolismo basal</th><td>" + o.tmb + " kcal <small>" + esc(o.tmbFonte || "") + "</small></td></tr>" +
      "<tr><th>Gasto estimado no dia</th><td>" + o.ingestao + " kcal <small>(fator " + String(o.fatorAtividade).replace(".", ",") + ")</small></td></tr>" +
      (o.smi ? "<tr><th>Índice de massa muscular</th><td>" + vg(o.smi) + " kg/m² <small>(baixo abaixo de " + String(o.smiCorte).replace(".", ",") + ")</small></td></tr>" : "") +
      (o.cintura ? "<tr><th>Cintura</th><td>" + vg(o.cintura) + " cm <small>risco " + o.riscoCintura + "</small></td></tr>" : "") +
      (o.rcq ? "<tr><th>Cintura-quadril</th><td>" + vg(o.rcq, 2) + " <small>risco " + o.riscoRcq + "</small></td></tr>" : "") +
      (o.visceral ? "<tr><th>Gordura visceral</th><td>nível " + o.visceral + " <small>(saudável até 9)</small></td></tr>" : "") +
      (o.anguloFase ? "<tr><th>Ângulo de fase</th><td>" + vg(o.anguloFase) + "°</td></tr>" : "") +
      "</table>";

    var seg = "";
    if (o.segmentar && o.segmentar.length) {
      seg = "<h3>Análise segmentar</h3><table class='bloco simples'><tr><th>Segmento</th><td><b>Massa magra</b></td><td><b>Gordura</b></td></tr>" +
        o.segmentar.map(function (s) {
          return "<tr><th>" + esc(s.nome) + "</th><td>" + vg(s.magra) + " kg</td><td>" + (s.gordura != null ? vg(s.gordura) + " kg" : "—") + "</td></tr>";
        }).join("") + "</table>";
    }

    var gastos = "<h3>Gasto calórico em 30 minutos</h3><div class='gastos'>" +
      o.gastos.map(function (g) { return "<div><span>" + esc(g.nome) + "</span><b>" + g.kcal + " kcal</b></div>"; }).join("") +
      "</div>";

    var histHtml = "";
    if (hist.length >= 2) {
      histHtml = "<h3>Histórico</h3><table class='bloco simples hist'><tr><th>Data</th><td><b>Peso</b></td><td><b>Gordura</b></td><td><b>Músculo</b></td></tr>" +
        hist.map(function (h) {
          return "<tr><th>" + dataBr(h.data) + "</th><td>" + vg(h.peso) + " kg</td><td>" + (h.gordura ? vg(h.gordura) + " %" : "—") + "</td><td>" + (h.mme ? vg(h.mme) + " kg" : "—") + "</td></tr>";
        }).join("") + "</table>";
    }

    var nota = o.estimado
      ? "Os valores de composição corporal desta página foram <b>estimados</b> a partir de peso, altura, idade, sexo e do percentual de gordura medido por dobras ou fita. Não substituem exame de bioimpedância."
      : "Composição corporal com valores <b>medidos em bioimpedância</b>, complementados por cálculos do sistema.";

    return "<!DOCTYPE html><html lang='pt-BR'><head><meta charset='utf-8'>" +
      "<title>Avaliação física — " + esc(op.nome || "") + "</title><style>" +
      "*{box-sizing:border-box;margin:0}body{font-family:system-ui,-apple-system,sans-serif;color:#1c1826;max-width:820px;margin:0 auto;padding:26px 22px 40px;}" +
      ".k{font-size:11px;letter-spacing:.2em;color:" + cor + ";font-weight:800;text-transform:uppercase;}" +
      "h1{font-size:26px;margin:6px 0 2px;letter-spacing:-.01em;}" +
      ".sub{color:#666;font-size:13px;margin-bottom:6px;}" +
      "h3{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:" + cor + ";margin:26px 0 8px;padding-bottom:5px;border-bottom:2px solid " + cor + "22;}" +
      "table.bloco{width:100%;border-collapse:collapse;font-size:13.5px;}" +
      "table.bloco th{text-align:left;font-weight:600;color:#4a4657;padding:9px 8px 9px 0;border-bottom:1px solid #ececf2;width:38%;}" +
      "table.bloco td{padding:9px 0;border-bottom:1px solid #ececf2;vertical-align:middle;}" +
      "table.bloco td.v{font-weight:800;font-size:15px;width:26%;} table.bloco td.b{width:36%;}" +
      "table.bloco small{font-weight:600;color:#8a8695;font-size:11px;}" +
      ".obs{font-size:10.5px;color:#8a8695;font-weight:600;margin-top:2px;}" +
      "table.simples td{font-weight:700;} table.simples td.zero{color:#16a34a;}" +
      ".barra .trilho{position:relative;height:9px;background:#eeecf3;border-radius:99px;}" +
      ".barra .ok{position:absolute;top:0;height:9px;background:" + cor + "33;border-radius:99px;}" +
      ".barra .pino{position:absolute;top:-3px;width:5px;height:15px;border-radius:3px;background:" + cor + ";transform:translateX(-2px);}" +
      ".barra .pino.abaixo{background:#2563eb;} .barra .pino.acima{background:#dc2626;}" +
      ".barra-leg{display:flex;justify-content:space-between;font-size:10px;color:#8a8695;margin-top:3px;font-weight:700;}" +
      ".barra-leg .cls{text-transform:uppercase;letter-spacing:.06em;} .cls.normal{color:#16a34a;} .cls.abaixo{color:#2563eb;} .cls.acima{color:#dc2626;}" +
      ".topo-kpis{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 4px;}" +
      ".kpi{flex:1;min-width:120px;border:1px solid #ececf2;border-radius:12px;padding:12px 14px;}" +
      ".kpi b{display:block;font-size:24px;letter-spacing:-.02em;} .kpi span{font-size:10.5px;color:#8a8695;font-weight:700;text-transform:uppercase;letter-spacing:.08em;}" +
      ".pont{background:" + cor + ";color:#fff;border-color:" + cor + ";} .pont span{color:#ffffffcc;}" +
      ".gastos{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px 18px;font-size:12.5px;}" +
      ".gastos div{display:flex;justify-content:space-between;border-bottom:1px dotted #e4e1ec;padding:4px 0;}" +
      ".gastos b{font-variant-numeric:tabular-nums;}" +
      ".nota{margin-top:22px;background:#f6f5fa;border-left:3px solid " + cor + ";padding:11px 14px;font-size:11.5px;color:#4a4657;line-height:1.6;border-radius:0 8px 8px 0;}" +
      ".rodape{margin-top:16px;color:#9b97a6;font-size:11px;}" +
      ".no-print{background:" + cor + ";color:#fff;border:none;border-radius:10px;padding:12px 22px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:18px;}" +
      "@media print{.no-print{display:none;} body{padding:0;} h3{page-break-after:avoid;}}" +
      "</style></head><body>" +
      "<button class='no-print' onclick='window.print()'>Imprimir / salvar em PDF</button>" +
      "<div class='k'>" + esc((op.marca || "TORQUE ON").toUpperCase()) + " · AVALIAÇÃO FÍSICA</div>" +
      "<h1>" + esc(op.nome || "") + "</h1>" +
      "<div class='sub'>" + sexoRot + (o.idade ? " · " + o.idade + " anos" : "") + " · " + vg(o.altura, 0) + " cm" +
      (op.quando ? " · " + dataBr(op.quando) : "") + (op.profissional ? " · " + esc(op.profissional) : "") + "</div>" +
      "<div class='topo-kpis'>" +
      (o.pontuacao ? "<div class='kpi pont'><b>" + o.pontuacao + "/100</b><span>Pontuação</span></div>" : "") +
      "<div class='kpi'><b>" + vg(o.peso) + " kg</b><span>Peso</span></div>" +
      "<div class='kpi'><b>" + vg(o.gordura) + " %</b><span>Gordura</span></div>" +
      "<div class='kpi'><b>" + vg(o.mme) + " kg</b><span>Músculo</span></div>" +
      "<div class='kpi'><b>" + vg(o.imc) + "</b><span>IMC</span></div>" +
      "</div>" +
      "<h3>Composição corporal</h3>" + comp +
      "<h3>Músculo e gordura</h3>" + musc +
      seg +
      "<h3>Controle de peso</h3>" + ctrl +
      "<h3>Dados adicionais</h3>" + extra +
      gastos +
      histHtml +
      "<div class='nota'>" + nota + " A faixa em destaque em cada barra é a referência saudável para o sexo e a altura informados.</div>" +
      "<div class='rodape'>Gerado pelo " + esc(op.marca || "TORQUE ON") + " · www.torqueon.com.br</div>" +
      "</body></html>";
  };

  raiz.MT_CORPO = A;
})(typeof self !== "undefined" ? self : this);
