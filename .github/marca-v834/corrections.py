from pathlib import Path
import hashlib
before={'app/aluno-builder.js':'30ac9b697d98310e144ea1be6bd08fa76592c95bc62a9bfb1e1f81d43a59e25b','personal.html':'2e0165e98858cc6bd51032324fe1b60ccb13a29d281957540eb276cf4b6cb87a','tests/test-identidade-marca-ui.js':'aa4d44befc19f84643955b925d5caa105195a1ed8042ec6b75ad452726387562'}
for f,h in before.items():
 assert hashlib.sha256(Path(f).read_bytes()).hexdigest()==h, 'Base mudou: '+f

def rep(f,a,b):
 p=Path(f);s=p.read_text();assert s.count(a)==1,(f,a[:70],s.count(a));p.write_text(s.replace(a,b))
rep('app/aluno-builder.js','#heroTopo .al-brand-logo{width:30px;height:30px}', '#heroTopo .al-brand-logo{width:30px;height:30px}body.aluno-v793 #heroTopo .al-brand :is(.al-brand-primary,.al-brand-secondary,.al-brand-slogan){color:#fff!important;text-shadow:0 1px 12px rgba(0,0,0,.4)}')
# O total principal permanece líquido. O rótulo antigo identifica ENTRADAS,
# separado de saídas, sem chamar uma devolução de recebimento.
a='      var totH = doDia.reduce(function (t, x) { return t + (+x.valor || 0); }, 0);'
rep('personal.html',a,a+'''\n      var entrouH = doDia.filter(function (x) { return !x.movimentoEstorno; }).reduce(function (t, x) { return t + (+x.valor || 0); }, 0);
      var devolvidoH = doDia.filter(function (x) { return x.movimentoEstorno; }).reduce(function (t, x) { return t - (+x.valor || 0); }, 0);''')
a='        (totH ? "var(--tk-ok)" : "var(--tk-tx5)") + \';">\' + (totH ? (totH>0?"+":"") + S.fmtBRL(totH) : "saldo zero") + "</span></h3>" +'
rep('personal.html',a,'''        (totH > 0 ? "var(--tk-ok)" : totH < 0 ? "var(--tk-warn)" : "var(--tk-tx5)") + ';">' + (totH ? (totH>0?"+":"") + S.fmtBRL(totH) : "saldo zero") + "</span></h3>" +
        '<p class="muted" style="font-size:12px;margin:0 0 10px;">Entrou hoje: <b>' + S.fmtBRL(entrouH) + '</b> · Devolvido hoje: <b>' + S.fmtBRL(devolvidoH) + '</b> · Saldo líquido: <b>' + S.fmtBRL(totH) + '</b></p>' +''')
# Captura da tela real sem o tour introdutório sobreposto.
a=" if(process.env.TORQUE_EVIDENCE_DIR){fs.mkdirSync(process.env.TORQUE_EVIDENCE_DIR,{recursive:true});"
rep('tests/test-identidade-marca-ui.js',a," if(await student.locator('#tourPular').isVisible())await student.locator('#tourPular').click();\n await student.evaluate(()=>window.scrollTo(0,0));\n"+a)
a=" // A marca é cabeçalho comercial; assinatura do recibo continua sendo a pessoa."
rep('tests/test-identidade-marca-ui.js',a,a+"\n await p.setViewportSize({width:1280,height:1000});")
a=" await p.locator('#listaPagamentos [data-recibo=\"marca-recibo-ficticio\"]').click();"
rep('tests/test-identidade-marca-ui.js',a,a+"\n ok((await p.locator('#pgHoje').innerText()).includes('Entrou hoje:')&&(await p.locator('#pgHoje').innerText()).includes('Devolvido hoje:'),'movimento diário mantém entradas e devoluções separadas');")
after={'app/aluno-builder.js':'3de8fe680ce924f53d5bfad7b717e3ff5be21f5a24fb63d5d3a49f84ad01bb1c','personal.html':'d43bb99245f238a7bc3863eb98c620d9a02f967b9ce0908dbb3a6f9a82e7e161','tests/test-identidade-marca-ui.js':'1c192217fd874b1ba93c958d81d7c3ec5806df316420e9263227da8224c79396'}
for f,h in after.items():
 actual=hashlib.sha256(Path(f).read_bytes()).hexdigest();assert actual==h,f+' '+actual;print(actual,f)
