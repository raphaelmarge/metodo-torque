from pathlib import Path
import hashlib,json
ROOT=Path('.')
D=ROOT/'.github/torque-template-v837'
for name,digest in {'app/aluno-builder.js':'4b92987b472ca0266e57313e501d2624f2da6b3193fe569a097b926957ba9c11','app/aluno-skin.js':'3ec0325c8470b99509a6e474484ff40da3e55895cdbaea0199340c00d623c02e'}.items():
    assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,'Base diferente: '+name
b=ROOT/'app/aluno-builder.js';s=ROOT/'app/aluno-skin.js'
text=b.read_text()
def rep(old,new):
 global text
 assert text.count(old)==1,(old[:100],text.count(old))
 text=text.replace(old,new)
rep("{ kg: kg.value, reps: rp ? rp.value : '', sugeridos:","{ kg: kg.value, reps: rp ? rp.value : '', rpe: gEl('gRpe') ? gEl('gRpe').value : '', sugeridos:")
rep("return { kg: sug.kg ? '' : d.kg, reps: sug.reps ? '' : d.reps };", "return { kg: sug.kg ? '' : d.kg, reps: sug.reps ? '' : d.reps, rpe: d.rpe == null ? '' : d.rpe };")
rep('return gGrava(ex, v.kg, v.reps, id);','return gGrava(ex, v.kg, v.reps, id, v.rpe);')
rep("gGrava(gv.reg, kg.value, rp ? rp.value : '', gv.regi)","gGrava(gv.reg, kg.value, rp ? rp.value : '', gv.regi, gEl('gRpe') ? gEl('gRpe').value : '')")
rep("String(manuais.kg).trim() || String(manuais.reps).trim()", "String(manuais.kg).trim() || String(manuais.reps).trim() || String(manuais.rpe || '').trim()")
rep("(r && (r.kg != null || r.r))", "(r && (r.kg != null || r.r || r.rpe != null))")
old='aria-label="Carga desta série em quilos" aria-describedby="gOrigemSerie"></label></div>\' +'
new='aria-label="Carga desta série em quilos" aria-describedby="gOrigemSerie"></label>\' +\n        \'<label for="gRpe">RPE <span>opcional</span><input id="gRpe" inputmode="decimal" autocomplete="off" value="\' + atributo(draft && draft.rpe != null ? draft.rpe : reg && reg.rpe != null ? reg.rpe : \'\') + \'" placeholder="—" aria-label="Esforço percebido desta série, de 1 a 10, opcional" aria-describedby="gOrigemSerie"></label></div>\' +'
rep(old,new)
rep('function gGrava(ex,kg,reps,slot){if(!ex)return false;', 'function gGrava(ex,kg,reps,slot,rpe){if(!ex)return false;var informouRpe=arguments.length>=5,semRpe=rpe==null||String(rpe).trim()===\'\';if(informouRpe&&!semRpe){if(typeof rpe===\'boolean\')return false;rpe=Number(String(rpe).replace(\',\',\'.\'));if(!isFinite(rpe)||rpe<1||rpe>10)return false;}')
rep('if(porSerie)reg.feito=(i>=0&&!!l[i].feito)', 'if(porSerie){if(informouRpe&&!semRpe)reg.rpe=rpe;else if(!informouRpe&&i>=0&&l[i].rpe!=null)reg.rpe=l[i].rpe;}if(porSerie)reg.feito=(i>=0&&!!l[i].feito)')
rep('var ok=gGrava(it.e,kg.value,rp.value,gv.regi);', "var ok=gGrava(it.e,kg.value,rp.value,gv.regi,gEl('gRpe')?gEl('gRpe').value:'');")
rep('kg.oninput=GP.entrada;rp.oninput=GP.entrada;', "kg.oninput=GP.entrada;rp.oninput=GP.entrada;var rpeCampo=gEl('gRpe');if(rpeCampo)rpeCampo.oninput=GP.entrada;")
rep('seriesDetalhadas: it.seriesDetalhadas, carga: it.carga };', 'seriesDetalhadas: it.seriesDetalhadas, carga: it.carga, rpe: it.rpe };')
rep('seriesDetalhadas: it.seriesDetalhadas || x.seriesDetalhadas };', 'seriesDetalhadas: it.seriesDetalhadas || x.seriesDetalhadas, rpe: it.rpe != null ? it.rpe : x.rpe };\n            item.rpePorSerie = (item.seriesDetalhadas || []).map(function(s){return s && s.rpe != null ? s.rpe : null;});')
text=text.replace('Toque em Série feita', 'Toque em Registrar série')
rep('Confira as repetições e a carga para confirmar.', 'Confira carga, repetições e RPE (opcional, de 1 a 10) para confirmar.')
b.write_text(text)
skin=s.read_text();assert skin.count('  var js = "";')==1
runtime=(D/'player-layout.js').read_text();css=(D/'player-layout.css').read_text()
skin=skin.replace('  var js = "";', '  css += '+json.dumps(css,ensure_ascii=False)+';\n'+runtime+'\n  var js = "(" + playerTemplate.toString() + ")();";')
s.write_text(skin)
for f in ['assets/versao.js','sw.js','app/app-sw.js']:
 p=ROOT/f;v=p.read_text();assert 'mt-v836' in v;p.write_text(v.replace('mt-v836','mt-v837'))
for name,digest in {'app/aluno-builder.js':'4d0e7b79fe83e6a2ded00ca5a037df6610608eb3ed68fe26e675d21bd5571c65','app/aluno-skin.js':'25386cda47db803d5ca70ce0c9b6a9715ab94f8838ce26eee6b7b7fce19bb4d7'}.items():
    actual=hashlib.sha256((ROOT/name).read_bytes()).hexdigest()
    assert actual==digest,'Resultado diferente: '+name+' '+actual
    print(actual,name)
