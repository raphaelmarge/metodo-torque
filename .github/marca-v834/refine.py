from pathlib import Path
import hashlib
before={'app/aluno-builder.js':'4510cf916c251181564e96b7652ec900999cc9d78531cb1be01446eae75cd65f','personal.html':'38f32500bccaa4e2a7df386df86c96269ba50cf10299432c7eac7a665eb73135','tests/test-identidade-marca-ui.js':'5afbac47a687dffcaf195d438e3244b6efba40949d7a98247cff90d5b21c547f'}
for f,h in before.items():
 assert hashlib.sha256(Path(f).read_bytes()).hexdigest()==h, 'Base mudou: '+f
def rep(f,a,b):
 p=Path(f);s=p.read_text();assert s.count(a)==1,(f,a[:70],s.count(a));p.write_text(s.replace(a,b))
rep('app/aluno-builder.js','      "<nav id=\'navApp\' aria-label=\'Menu do app\' style=', '      "<nav id=\'navApp\'" + (MARCA.personalizado ? " data-al-brand=\'" + esc(studio) + "\'" : "") + " aria-label=\'Menu do app\' style=')
rep('app/aluno-builder.js','.mgstudio{overflow-wrap:anywhere}', '.mgstudio{overflow-wrap:anywhere}@media(min-width:801px){body.aluno-v793 #navApp[data-al-brand]::before{content:attr(data-al-brand);font-size:22px;line-height:1.15;overflow-wrap:anywhere;text-transform:none;letter-spacing:-.025em}}')
p=Path('app/aluno-builder.js');line=[x for x in p.read_text().splitlines() if 'var man={name:' in x];assert len(line)==1
rep('app/aluno-builder.js',line[0], '      "var man={name:" + jsonApp(MARCA.personalizado ? studio : "TORQUE FIT — Meu app") + ",short_name:" + jsonApp(MARCA.personalizado ? MARCA.curto : "TORQUE FIT") + ",display:\'standalone\',background_color:CV(\'bg\'),theme_color:CV(\'cor\')," +')
rep('personal.html','    var quem = (cfg.nome || cfg.identidadeMarca) ? nomeStudio() : "Personal trainer";', '''    var identidadeRecibo = self.MT_IDENTIDADE_MARCA && self.MT_IDENTIDADE_MARCA.resolve(cfg);
    var quem = identidadeRecibo && identidadeRecibo.personalizado ? (cfg.professor || cfg.nome || "Personal trainer") : (cfg.nome ? nomeStudio() : "Personal trainer");''')
a='      "<h2>RECIBO — " + S.fmtBRL(+p.valor) + "</h2>" +'
rep('personal.html',a,a+'''\n      (identidadeRecibo && identidadeRecibo.personalizado ? "<p>" + esc(identidadeRecibo.principal) + "</p>" : "") +''')
a=" ok((await student.title()).includes('Studio Horizonte'),'título do navegador usa identidade');"
rep('tests/test-identidade-marca-ui.js',a,a+"\n eq(await student.evaluate(()=>window.__manApp.name),'Studio Horizonte','manifest público recebe a marca escolhida');\n eq(await student.evaluate(()=>window.__manApp.short_name),'Horizonte','manifest conserva o nome curto explícito');\n ok(await student.locator('#navApp').evaluate(e=>getComputedStyle(e,'::before').content.includes('Studio Horizonte')),'menu lateral de desktop usa a mesma marca');\n await student.evaluate(()=>document.documentElement.classList.add('claro'));\n ok(await student.locator('#heroTopo .al-brand-primary').evaluate(e=>getComputedStyle(e).color.includes('255, 255, 255')),'marca sobre foto continua legível no tema claro');\n await student.evaluate(()=>document.documentElement.classList.remove('claro'));")
a=" eq(await p.evaluate(()=>localStorage.getItem('mtapp:ptStudio')),before,'digitar não grava nem publica');"
rep('tests/test-identidade-marca-ui.js',a,a+"\n const bloqueou=await p.evaluate(()=>{window.__marcaTentouPublicar=false;const b=document.getElementById('persPublica');b.addEventListener('click',()=>{__marcaTentouPublicar=true;},{once:true});const permitido=b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));return !permitido&&!__marcaTentouPublicar;});\n ok(bloqueou,'Publicar é bloqueado enquanto a identidade está apenas na prévia');")
a=" eq(errors,[],'nenhuma exceção JavaScript no Personal/aluno');"
rep('tests/test-identidade-marca-ui.js',a,''' // A marca é cabeçalho comercial; assinatura do recibo continua sendo a pessoa.
 await p.evaluate(()=>{const s=MTStore.read('ptStudio',{});s.pagamentos.push({id:'marca-recibo-ficticio',alunoId:s.alunos[0].id,data:'2026-09-14',valor:25,forma:'Dinheiro',tipoRecebimento:'aulas'});localStorage.setItem('mtapp:ptStudio',JSON.stringify(s));window.__marcaRecibo='';window.open=()=>({document:{write:x=>{__marcaRecibo+=x;},close(){}}});__renderPT();document.querySelector('#abas [data-a="pagamentos"]').click();});
 await p.locator('#listaPagamentos [data-recibo="marca-recibo-ficticio"]').click();
 ok(await p.evaluate(()=>__marcaRecibo.includes('<p>Studio Horizonte</p>')&&__marcaRecibo.includes('<br>Ana Silva</p>')),'recibo separa marca comercial e profissional responsável');
 // O loader só usa a identidade pertencente ao token atual, inclusive offline.
 const pacote=await p.evaluate(()=>({dados:__dadosApp(__loadPT().alunos[0],new Date().toISOString())}));
 await p.evaluate(pac=>{localStorage.setItem('tq_app_token','token-marca-ficticio');localStorage.setItem('tq_app_pacote',JSON.stringify(pac));},pacote);
 const opening=await context.newPage();opening.on('pageerror',e=>errors.push(e.message));
 await opening.goto(BASE+'/app/index.html?t=token-marca-ficticio');
 await opening.waitForSelector('#heroTopo .al-brand-primary');
 eq(await opening.locator('#heroTopo .al-brand-primary').innerText(),'Studio Horizonte','loader abre o pacote local com a marca certa');
 await opening.goto(BASE+'/app/index.html?t=outro-token-ficticio');
 await opening.waitForSelector('#tentar');
 ok(!(await opening.locator('body').innerText()).includes('Studio Horizonte'),'troca de token não mostra marca anterior');
 eq(await opening.evaluate(()=>localStorage.getItem('tq_app_pacote')),null,'pacote de outro aluno não é reutilizado');
 await opening.close();
'''+a)
after={'app/aluno-builder.js':'30ac9b697d98310e144ea1be6bd08fa76592c95bc62a9bfb1e1f81d43a59e25b','personal.html':'2e0165e98858cc6bd51032324fe1b60ccb13a29d281957540eb276cf4b6cb87a','tests/test-identidade-marca-ui.js':'aa4d44befc19f84643955b925d5caa105195a1ed8042ec6b75ad452726387562'}
for f,h in after.items():
 actual=hashlib.sha256(Path(f).read_bytes()).hexdigest();assert actual==h, f+' '+actual;print(actual,f)
