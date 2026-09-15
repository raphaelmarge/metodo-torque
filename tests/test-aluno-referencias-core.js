/* Referências por série: código canônico, dados fictícios e nenhuma rede. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../app/aluno-builder.js'),'utf8');
const code=source.slice(source.indexOf('  function normalizaSeries('),source.indexOf('  // v821: agenda única'));
assert.ok(code.includes('function runtimePlayer()'),'Recorte canônico presente');
let n=0;
function ok(v,m){assert.ok(v,m);n++;console.log('OK '+m);}
function setup(rows=[]){
 const it={e:'Exercício fictício',s:2,r:'8',d:0,seriesDetalhadas:[{reps:'8',carga:30,descanso:0},{reps:'6',carga:0,descanso:0}]};
 const memory={ptdc:{[it.e]:rows}},label={textContent:''};let writes=0;
 const ctx={gv:{f:0,e:0,s:0,formSerie:{fi:0,ei:0,si:0},baseFeitas:{},rascunhos:{},fim:false,sujo:false},GUIA:[{it:[it]}],
  L:(k,d)=>memory[k]||d,Sv:()=>{writes++;return true;},isoHj:()=> '2026-09-15',
  gEl:id=>id==='gOrigemSerie'?label:null,
  esc2:v=>String(v).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])),
  gnum:v=>String(Math.round(v*100)/100).replace('.',','),gRegua:()=>'',GW:{rep:{},kg:{}},acCheckpoint:()=>{}};
 vm.createContext(ctx);vm.runInContext(code+'\nvar SR=runtimeSeries(),GP=runtimePlayer();',ctx);
 function form(si=0){ctx.gv.formSerie={fi:0,ei:0,si};ctx.gv.sel=si;const reg=ctx.SR.registro(it,si),a=ctx.SR.alvo(it,si);return ctx.GP.form(it,si,0,reg,a,reg&&reg.kg!=null?reg.kg:'',reg&&reg.r!=null?reg.r:'',ctx.SR.anterior(it,si));}
 return {it,ctx,memory,label,form,get writes(){return writes;}};
}
const row=(d,kg,r,serie=1,feito=true)=>({d,kg,r,serie,feito,g:2,i:'0:0:'+(serie-1)});
const x=setup([row('2026-09-13',25,7),row('2026-09-10',99,20),row('2026-09-14',100,8,2),row('2026-09-15',90,8),row('2026-09-16',90,8),row('2026-09-14',90,8,1,false)]);
ok(x.ctx.SR.anterior(x.it,0).kg===25,'Anterior usa a data mais recente, não a ordem de chegada, recorde, outra série ou rascunho');
const ui=setup([row('2026-09-13',25,7),row('2026-09-10',99,20)]);
const html=ui.form(),before=JSON.stringify(ui.memory);
ok(html.includes('>Prescrito</dt>')&&html.includes('8 reps · 30 kg'),'Prescrição permanece separada dos campos realizados');
ok(html.includes('Anterior com carga · 13/09')&&html.includes('7 reps · 25 kg'),'Histórico identifica a data e o registro pertinente');
ok(html.includes('Valores sugeridos, ainda não confirmados'),'Sugestão não aparece como execução confirmada');
ui.ctx.GP.pintaOrigem();ok(ui.label.textContent.includes('ainda não confirmados'),'Estado acessível nasce como sugestão');
ok(ui.writes===0&&before===JSON.stringify(ui.memory),'Renderizar e comparar não altera o histórico');
ui.ctx.gv.sujo=true;ui.ctx.GP.pintaOrigem();ok(ui.label.textContent.includes('rascunho'),'Editar distingue rascunho de registro salvo');
const reg=setup([row('2026-09-15',28,7,1,false)]);ok(reg.form().includes('Anotação salva; série ainda pendente'),'Anotação salva não vira conclusão');
const done=setup([row('2026-09-15',28,7)]);ok(done.form().includes('Série concluída.'),'Execução confirmada é identificada');
done.ctx.gv.sujo=true;done.ctx.GP.pintaOrigem();ok(done.label.textContent.includes('Alteração em rascunho'),'Editar série concluída não anuncia a edição como salva');
const empty=setup();empty.it.seriesDetalhadas[0]={reps:'8–12',carga:null,descanso:0};const out=empty.form();
ok(out.includes('carga não definida')&&out.includes('Sem carga anterior anotada'),'Ausência é explicada sem inventar carga zero ou atividade');
ok(empty.form(1).includes('6 reps · 0 kg'),'Prescrição zero é diferente de carga ausente');
const zero=setup([row('2026-09-14',0,0)]);ok(zero.form().includes('0 reps · 0 kg'),'Histórico preserva zeros explícitos');
const mixed=setup([row('2026-09-12',10,1),{d:'2026-09-13',kg:20},row('invalida',999,9),row('2026-99-99',888,9)]);
ok(mixed.ctx.SR.anterior(mixed.it,0).kg===20,'Histórico legado preservado e data inválida ignorada');
ok(mixed.form().includes('reps não anotadas · 20 kg'),'Carga antiga sem reps não inventa repetições');
const tie=setup([row('2026-09-14',15,8),row('2026-09-14',20,8)]);ok(tie.ctx.SR.anterior(tie.it,0).kg===20,'Empate de data preserva a última anotação');
const hostile=setup();hostile.it.seriesDetalhadas[0].reps='<img src=x onerror=alert(1)>';ok(!hostile.form().includes('<img src=x'),'Texto de prescrição não é executado como HTML');
const final=setup();final.ctx.gv.fim=true;ok(final.form().includes('Salvar uma anotação não confirma a execução.'),'Fim do player mantém distinção de anotação e execução');
console.log(n+' verificações do contexto por série passaram.');
