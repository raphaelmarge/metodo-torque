  // O simulador e os dados de acompanhamento são os mesmos nas duas entradas.
  const bloco = fs.readFileSync(path.join(__dirname, "demo-bloco.html"), "utf8").replace("/* NUTRICAO_DEMO_FIXTURE */", "var __demoNutriPlano = " + JSON.stringify(NUTRICAO_DEMO).replace(/</g, "\\u003c") + ";");
  function prepara(html) {
    if (!html || html.length < 50000) throw new Error("Builder retornou uma demo incompleta.");
    let out = html.replace(/localStorage/g, "__demoLS");
    const ib = out.indexOf("<body"), ib2 = out.indexOf(">", ib);
    if (ib < 0 || ib2 < 0) throw new Error("Builder retornou HTML sem body.");
    return out.slice(0, ib2 + 1) + bloco + out.slice(ib2 + 1);
  }
  const { gerarVariantes } = require("./regen-demos.js");
  const demos = gerarVariantes({ comCadastro: prepara(apps.comCadastro), semCadastro: prepara(apps.semCadastro) });
  for (const [arquivo, out] of [["demo-aluno.html", demos.semCadastro], ["demo-aluno-sem-cadastro.html", demos.semCadastro], ["demo-aluno-cadastro.html", demos.comCadastro]]) {
    fs.writeFileSync(path.join(RAIZ, arquivo), out);
    console.log(arquivo + ": " + out.length + " caracteres; builder canônico; armazenamento simulado");
  }
})().catch(function (e) { console.error(e); process.exitCode = 1; });
