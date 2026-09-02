/* Construtor do robô (BotBuilder) — a MESMA regra nos dois módulos.
 *
 * v756: os asserts do robô estavam copiados letra por letra em
 * test-personal.js e test-nutricao.js, com o mesmo texto e a mesma lógica.
 * É o módulo COMPARTILHADO testado duas vezes por copiar-e-colar: quando a
 * regra do robô muda, uma cópia é ajustada e a outra fica mentindo (ou quebra
 * por um motivo que não tem nada a ver com a mudança).
 *
 * Não começa com "test-", então o tests/run.sh (que varre tests/test-*.js) não
 * tenta rodar este arquivo como suíte.
 *
 * Uso:
 *   const { testaBotBuilder } = require("./_bot-builder.js");
 *   await testaBotBuilder(p, ok, { sufixo: "P", fluxo: "__botFluxoP",
 *     ops: [...], nome: "Léo", temPrincipal: true });
 *
 * `sufixo` é a letra que o módulo usa nos ids (P no Personal, N no Nutri).
 */
async function testaBotBuilder(p, ok, cfg) {
  const s = cfg.sufixo;
  const rot = cfg.rotulo || ("módulo " + s);

  const botEd = await p.evaluate((suf) => ({
    temCard: !!document.getElementById("botAtivo" + suf),
    ativo: !!(document.getElementById("botAtivo" + suf) || {}).checked,
    ops: (document.getElementById("botOps" + suf) || {}).value || "",
  }), s);
  ok(botEd.temCard && botEd.ativo, rot + ": tem o editor do robô, ligado por padrão");
  ok(/\|/.test(botEd.ops) && /humano/.test(botEd.ops),
    rot + ": opções padrão no formato Rótulo | Resposta com encaminhamento humano");

  const fluxo = await p.evaluate((arg) => {
    const box = "#botFluxo" + arg.suf;
    const desenho = {
      paths: document.querySelectorAll(box + " svg path").length,
      baloes: document.querySelectorAll(box + " .bb-bloco").length,
      temZap: !!document.getElementById("botZap" + arg.suf),
      temSel: !!document.querySelector(box + " #bbSel"),
      temNova: !!document.querySelector(box + " #bbNova"),
      temPrincipal: !!document.querySelector(box + " #bbPrincipal"),
    };
    const f = window[arg.fluxo]({ ativo: true, oi: "Oi!", ops: arg.ops }, arg.nome);
    return {
      desenho,
      inicio: f.inicio,
      tipos: f.blocos.map((b) => b.tipo),
      menuOps: f.blocos[1].opcoes.length,
      voltaMenu: f.blocos[2].destino,
      opDestino: f.blocos[1].opcoes[0].destino,
      temPos: !!f.blocos[0].pos,
    };
  }, { suf: s, fluxo: cfg.fluxo, ops: cfg.ops, nome: cfg.nome });

  ok(fluxo.desenho.paths >= 5 && fluxo.desenho.baloes >= 6,
    rot + ": construtor desenhado com linhas e balões arrastáveis");
  ok(fluxo.desenho.temZap && fluxo.desenho.temSel && fluxo.desenho.temNova &&
     (!cfg.temPrincipal || fluxo.desenho.temPrincipal),
    rot + ": barra de automações (+ Nova, seletor) e Publicar no WhatsApp");
  ok(fluxo.inicio === "b_oi" && fluxo.tipos.join() === "mensagem,menu,mensagem,equipe",
    rot + ": fluxo no formato do chatbot da academia (mensagem → menu → respostas/equipe)");
  ok(fluxo.menuOps === cfg.ops.length && fluxo.voltaMenu === "b_menu" &&
     fluxo.opDestino === "b_r0" && fluxo.temPos,
    rot + ": destino/pos no formato que o webhook anda de verdade");
}

module.exports = { testaBotBuilder };
