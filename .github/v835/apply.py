from pathlib import Path
import hashlib
expected = {
 'assets/personal-questionarios.js':'39bc7165691dd0e0e647d7d7ee1b95b697317c92883b81f347d096e5d24932ad',
 'tests/test-questionarios-usabilidade.js':'4ce9b3b7a209180b8ef2b883dc64ab062c28f64defe2b330015de051377bab98',
 'tools/demo-aluno/regen-demo.js':'a546c08e7a3e4c3436528fe455c241c22175c8db8d1c03806fb4ec8b85427c20',
 'assets/versao.js':'854f9c3e278d4179cac36fba78215079da66d56d0ddc2311153987f9ec8022ae',
 'sw.js':'7284d7ebaeec8b9c1961685785fb82cea2f1b4684cf4820a534828cd066401d7',
 'app/app-sw.js':'985c0c90b5a946a7c2beca2315f74a5c80a3ac5a77fefb66e895cde805a44894'
}
for f,h in expected.items():
 assert hashlib.sha256(Path(f).read_bytes()).hexdigest()==h, 'Base mudou: '+f

def replace(f,a,b):
 p=Path(f); s=p.read_text(); assert s.count(a)==1,(f,a[:80]);p.write_text(s.replace(a,b))
f='assets/personal-questionarios.js';s=Path(f).read_text();a=s.index("    qsave.addEventListener('click', function (event) {");z=s.index('    function decorateQuestions()',a);old=s[a:z]
b=old.replace('      setTimeout(function () {','      finishQuestionnaireSave = function () {',1)
b=b.replace("      });\n    }, true);", "      };\n    }, true);\n    // O handler canônico salva de forma síncrona. Este listener foi instalado\n    // depois dele: finaliza a interface no MESMO clique, antes de outro rascunho.\n    // Não deixa um timer antigo fechar/limpar o editor reaberto pelo professor.\n    qsave.addEventListener('click', function () {\n      var finish = finishQuestionnaireSave; finishQuestionnaireSave = null;\n      if (finish) finish();\n    });",1)
replace(f,old,'    var finishQuestionnaireSave = null;\n'+b)
f='tests/test-questionarios-usabilidade.js';anchor=" const ids=await p.evaluate(()=>Array.from(document.querySelectorAll('[id]')).map(e=>e.id));"
replace(f,anchor,Path('.github/v835/regression.js').read_text()+anchor)
f='tools/demo-aluno/regen-demo.js'
replace(f,'/* Regenera demo-aluno.html: app novo (redesenho) + bloco de dados fake antigo.','/* Regenera as três demos do aluno pelo builder canônico; a principal abre direto.')
replace(f,'  const html = await p.evaluate(({ CAPAS, NUTRICAO_DEMO }) => {','  const apps = await p.evaluate(({ CAPAS, NUTRICAO_DEMO }) => {')
replace(f,'  const p = await (await br.newContext()).newPage();\n  p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));\n  await p.goto((process.env.BASE_URL || "http://127.0.0.1:8765") + "/personal.html");','  const base = new URL(process.env.BASE_URL || "http://127.0.0.1:8765");\n  if (![\'127.0.0.1\', \'localhost\', \'[::1]\'].includes(base.hostname)) { await br.close(); throw new Error("Geração de demo exige servidor local de teste."); }\n  const context = await br.newContext({ serviceWorkers: \'block\' });\n  await context.route(\'**/*\', function (route) {\n    return new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort();\n  });\n  const p = await context.newPage();\n  p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));\n  await p.goto(base.origin + "/personal.html");')
replace(f,'    const out = window.__montaAppAluno(alex, new Date().toISOString());\n    window.MTStore.write("ptStudio", JSON.parse(snap));\n    return out;','    const stamp = new Date().toISOString();\n    const comCadastro = window.__montaAppAluno(alex, stamp);\n    // Apenas o aluno FICTÍCIO da demonstração dispensa a entrada inicial.\n    // Cada HTML vem do mesmo builder. Não forja aceite, não oculta overlay\n    // por CSS e não acrescenta uma opção de bypass ao aplicativo real.\n    const direto = Object.assign({}, alex, {\n      onboardingConsultoria: Object.assign({}, alex.onboardingConsultoria, { requerido: false })\n    });\n    const semCadastro = window.__montaAppAluno(direto, stamp);\n    window.MTStore.write("ptStudio", JSON.parse(snap));\n    return { comCadastro, semCadastro };')
s=Path(f).read_text();a=s.index('  if (!html || html.length < 50000)');replace(f,s[a:],Path('.github/v835/generator-tail.js').read_text())
for f in ['assets/versao.js','sw.js','app/app-sw.js']:replace(f,'mt-v834','mt-v835')
result={
 'assets/personal-questionarios.js':'a094e7dddaee3866b8e2d04c8124a837bb008130754e8473b96ce371c866c908',
 'tests/test-questionarios-usabilidade.js':'f1be83cee86cc33dbd06598594bfbe3702ef3eaa6d0ef9ac7f73d34cd6a59243',
 'tools/demo-aluno/regen-demo.js':'519ea156790ebc5b30ace4566034fe21d4d77c18f0f922bfc3f79dc62a78a77e',
 'tools/demo-aluno/regen-demos.js':'09d9c5bb91efa5185700aa679454cc47e3cea76c6d300b3edf84dda2ce6a23fc',
 'tests/test-demo-aluno-variantes.js':'35f4eb69cae7f4d5cb3f6140d138a5299a7946b11c7899488e14c6fbdde42963',
 'tests/test-demo-entrada-direta.js':'74f8bcc2339dbfc1ad4ae8bad54e345b63f991e4092edbc22d67b79bcc4b08c2',
 'assets/versao.js':'6e1ea1f3ad2734ec8ae10b68e479025db1435177792d054889a87edb8917d335',
 'sw.js':'fa80b5e88c5e25365b7634347613a44945cdd20cd32f4819706aab848ee13aa8',
 'app/app-sw.js':'5606611dca586d32e8c9c381e0de4f569b2b9460d7feef5bad4f0612faf4a19f'
}
for f,h in result.items():
 actual=hashlib.sha256(Path(f).read_bytes()).hexdigest();assert actual==h,(f,'Resultado diferente',actual);print(f,actual)
