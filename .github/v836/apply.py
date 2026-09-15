from pathlib import Path
import hashlib,json
expected={
'app/aluno-builder.js':('3de8fe680ce924f53d5bfad7b717e3ff5be21f5a24fb63d5d3a49f84ad01bb1c','8e0a6de14c4db07d4dbc3174acb3acee1dfc7367575ec5dbe42e681aefbcaa3c'),
'app/aluno-skin.js':('ed6cdbea317073ec617517e7e4969730e52418ee66b59ebcd74cb5807627e035','3ec0325c8470b99509a6e474484ff40da3e55895cdbaea0199340c00d623c02e'),
'assets/versao.js':('6e1ea1f3ad2734ec8ae10b68e479025db1435177792d054889a87edb8917d335','573a3142d8969d5d170e9572f55453415ffa7d5cf70efc8e80ac93e45334f567'),
'sw.js':('fa80b5e88c5e25365b7634347613a44945cdd20cd32f4819706aab848ee13aa8','1efff80df2e43c279009369a343ee878c7499eeef434a5af5d7ae16ae046552e'),
'app/app-sw.js':('5606611dca586d32e8c9c381e0de4f569b2b9460d7feef5bad4f0612faf4a19f','c1e827309f31d5a6182689b6a9e13f7c24a76edbc636bcf21b2a41b3d0718670')}
for f,(h,_) in expected.items():assert hashlib.sha256(Path(f).read_bytes()).hexdigest()==h,'Base mudou: '+f

def replace(f,a,b):
 p=Path(f);s=p.read_text();assert s.count(a)==1,(f,a[:80]);p.write_text(s.replace(a,b))
f='app/aluno-builder.js'
replace(f,'      var l = (L("ptdc", {})[it.e] || []).filter(function (r) { return cargaConcluida(r) && r.d < isoHj() && (r.g !== 2 || r.serie === si + 1); });\n      return l.length ? l[l.length - 1] : null;',Path('.github/v836/anterior.js').read_text().rstrip('\n'))
anchor='    function form(it, si, ei, reg, a, v, r, u) {'
replace(f,anchor,Path('.github/v836/contexto.js').read_text()+anchor)
replace(f,'      gv.sujo = true; guarda(); acCheckpoint();','      gv.sujo = true; guarda(); acCheckpoint(); pintaOrigem();')
replace(f,'        \'<div class="gserie-fields"><label for="gReps">Repetições<input','        referencias(a, u) + \'<div class="gserie-fields"><label for="gReps">Repetições<input')
replace(f,'aria-label="Repetições desta série"></label>','aria-label="Repetições desta série" aria-describedby="gOrigemSerie"></label>')
replace(f,'aria-label="Carga desta série em quilos"></label></div>','aria-label="Carga desta série em quilos" aria-describedby="gOrigemSerie"></label></div>')
replace(f,'        \'<small class="gserie-help">\' + (done || gv.fim ? \'Salve a alteração para atualizar o registro.\' : \'Toque em Série feita para confirmar estes valores.\') + \'</small></div>\';','        \'<small id="gOrigemSerie" class="gserie-help" role="status">\' + textoOrigem(done, reg, sug, !!draft) + \'</small></div>\';')
replace(f,'salvaDraft: salvaDraft };','salvaDraft: salvaDraft, pintaOrigem: pintaOrigem };')
replace(f,'"lab.textContent=\'Anotado ✓\';lab.style.color=\'#16a34a\';" +','"GP.pintaOrigem();lab.textContent=\'Anotado ✓\';lab.style.color=\'#16a34a\';" +')
replace(f,'"var lab=gEl(\'gCgLab\');if(lab){lab.textContent=\'Sem carga ✓\';lab.style.color=\'#16a34a\';}};}" +','"GP.pintaOrigem();var lab=gEl(\'gCgLab\');if(lab){lab.textContent=\'Sem carga ✓\';lab.style.color=\'#16a34a\';}};}" +')
css='#guiaBox .gserie-referencias{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 12px;padding:0 0 10px;border-bottom:1px solid var(--gline);text-align:left}#guiaBox .gserie-referencias>div{min-width:0}#guiaBox .gserie-referencias dt{color:var(--gmuted);font-size:11.5px;font-weight:600;line-height:1.4;margin:0 0 3px}#guiaBox .gserie-referencias dd{color:var(--gfg);font-size:13px;font-weight:650;line-height:1.4;margin:0;overflow-wrap:anywhere}#guiaBox #gOrigemSerie{margin-top:5px}'
replace('app/aluno-skin.js','  var js = "";','  // Referências compactas; reutiliza o espaço de ajuda e as cores do player.\n  css += '+json.dumps(css)+';\n  var js = "";')
for f in ['assets/versao.js','sw.js','app/app-sw.js']:replace(f,'mt-v835','mt-v836')
for f,(_,h) in expected.items():
 actual=hashlib.sha256(Path(f).read_bytes()).hexdigest();assert actual==h,(f,'Divergiu do código revisado',actual);print(f,actual)
