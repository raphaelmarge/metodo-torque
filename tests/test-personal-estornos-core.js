/* Fixtures fictícias; nenhuma conexão ou movimentação financeira. */
const assert=require('node:assert/strict');
const C=require('../assets/personal-estornos-core');
const R=require('../assets/relatorio-0809');
let checks=0;
function ok(v,m){assert.ok(v,m);checks++;console.log('OK '+m);}
function eq(a,b,m){assert.deepEqual(a,b,m);checks++;console.log('OK '+m);}
function fails(fn,re,m){assert.throws(fn,re,m);checks++;console.log('OK '+m);}
const copy=x=>JSON.parse(JSON.stringify(x));
const meta=id=>({id,por:'["academia-teste","teste@example.invalid"]',hoje:'2026-09-14',hora:'13:00',em:'2026-09-14T16:00:00Z'});
const fixture=()=>({alunos:[{id:'a',nome:'Aluno fictício',ativo:true,valor:600,modo:'mes',pacote:{total:10,usadas:3,renova:true}},{id:'b',nome:'Outro aluno fictício',ativo:true}],pagamentos:[{id:'p',alunoId:'a',valor:600,data:'2026-09-01',forma:'Pix',tipoRecebimento:'aulas'},{id:'q',alunoId:'b',valor:100,data:'2026-09-01',forma:'Dinheiro'}],contratosPT:[{id:'ct',alunoId:'a',status:'ativo',planoId:'mensal'},{id:'ctb',alunoId:'b',status:'ativo'}],sessoes:[{id:'feita',alunoId:'a',data:'2026-09-10',hora:'10:00',feita:true},{id:'falta',alunoId:'a',data:'2026-09-20',faltou:true},{id:'passada',alunoId:'a',data:'2026-09-14',hora:'10:00'},{id:'futura',alunoId:'a',data:'2026-09-14',hora:'17:00'},{id:'amanha',alunoId:'a',data:'2026-09-15',hora:'10:00'},{id:'outra',alunoId:'b',data:'2026-09-15'}],treinosV2:{a:{fichas:[{id:'treino-original'}]}},avaliacoes:[{id:'avaliacao-original',alunoId:'a'}]});
function request(s,n=300,id='r',p='p'){return C.criaSolicitacao(s,p,C.snapshot(s,p),{valor:n,motivo:'Cancelamento solicitado pelo cliente'},meta(id));}
function confirm(s,id='r',p='p',extra={}){return C.mudaSolicitacao(s,id,C.snapshot(s,p),'confirmar_manual',{data:'2026-09-14',meio:'pix',comprovanteRef:'comprovante-sintetico',confirmo:true,...extra},meta(id+'-confirm'));}
for(const [input,n] of [['0.01',1],['0,30',30],[600,60000],['12345.67',1234567]])eq(C.centavos(input),n,'centavos exatos '+input);
for(const v of ['','0','-1','1e3','1.000','1,234.50','abc',NaN,Infinity,'10.001','90071992547409.93'])fails(()=>C.centavos(v),/valor|limite/,'valor inválido recusado '+v);
let s=fixture(),original=copy(s.pagamentos), r=request(s);
eq(C.resumo(s,s.pagamentos[0]),{bruto:60000,pendente:30000,devolvido:0,disponivel:30000,liquido:60000},'pendente reserva saldo sem alterar receita');
eq(C.totais(s,'2026-09-01','2026-09-30'),{bruto:700,devolvido:0,liquido:700},'caixa não deduz promessa de devolução');
fails(()=>request(s,300.01,'r2'),/excede/,'saldo considera pendentes');
let snap=C.snapshot(s,'p');request(s,50,'r2');fails(()=>C.criaSolicitacao(s,'p',snap,{valor:1,motivo:'Outro pedido'},meta('r3')),/outra sessão/,'duas sessões não reservam saldo desatualizado');
confirm(s);
eq(C.resumo(s,s.pagamentos[0]).liquido,30000,'parcial diminui apenas valor devolvido');
eq(s.pagamentos,original,'original intacto após solicitar e confirmar');
eq(s.estornosPT[0].pagamentoOriginal,original[0],'snapshot de origem preservado');
eq(s.estornosPT[0].eventos.map(x=>x.acao),['solicitar','confirmar_manual'],'trilha append-only');
fails(()=>confirm(s),/não está mais pendente/,'segunda confirmação recusada');
fails(()=>R.alteraRecebimento(s,'p',JSON.stringify(s.pagamentos[0]),{motivo:'Apagar'},{...meta('a'),acao:'anular'}),/histórico de devolução/,'anulação não apaga o contexto do estorno');
fails(()=>R.alteraRecebimento(s,'p',JSON.stringify(s.pagamentos[0]),{data:'2026-09-01',valor:1},{...meta('b'),acao:'editar'}),/histórico de devolução/,'valor original protegido de edição');
const pendingBase=C.snapshot(s,'p');C.mudaSolicitacao(s,'r2',pendingBase,'cancelar_solicitacao',{motivo:'Cliente optou por continuar'},meta('desistiu'));
eq(C.resumo(s,s.pagamentos[0]).disponivel,30000,'desistência libera reserva sem apagar solicitação');
request(s,300,'r3');confirm(s,'r3');eq(C.resumo(s,s.pagamentos[0]).devolvido,60000,'dois parciais completam a devolução total');
eq(C.resumo(s,s.pagamentos[0]).disponivel,0,'não permite exceder total recebido');
fails(()=>request(s,0.01,'r4'),/excede/,'um centavo além do total é recusado');
eq(R.recebimentosAtivos(s).length,2,'devolução não é anulação nem reabre quitação');
eq(C.totais(s,'2026-09-01','2026-09-30'),{bruto:700,devolvido:600,liquido:100},'bruto, devolvido e líquido conciliam');
s=fixture();s.pagamentos[0].data='2026-08-30';request(s,150);confirm(s);
eq(C.totais(s,'2026-08-01','2026-08-31','a'),{bruto:600,devolvido:0,liquido:600},'entrada histórica não é reescrita no mês anterior');
eq(C.totais(s,'2026-09-01','2026-09-30','a'),{bruto:0,devolvido:150,liquido:-150},'saída entra no mês efetivo da devolução');
eq(R.recebimentoLiquido(s,s.pagamentos[0]),450,'carteira calcula saldo do pagamento original');
s=fixture();s.pagamentos[0].eventoId='asaas:pagamento-ficticio:pago';request(s);
fails(()=>confirm(s),/gateway/,'pagamento integrado exige conferência de devolução duplicada');
confirm(s,'r','p',{confereGateway:true});eq(s.estornosPT[0].status,'devolvido_manual','conferência humana nunca vira status de gateway confirmado');
s=fixture();request(s);for(const fields of [{confirmo:false},{data:'2026-09-15'},{data:'2026-08-31'},{data:'2026-02-30'},{comprovanteRef:''},{meio:'cartao_automatico'}]){
 const before=JSON.stringify(s);fails(()=>confirm(s,'r','p',fields),/Confirme|data|Referência|forma/,'confirmação inválida recusada '+JSON.stringify(fields));eq(JSON.stringify(s),before,'falha não altera histórico');
}
s=fixture();s.pagamentos[0].anulacao={motivo:'Duplicado'};fails(()=>request(s),/anulado/,'não devolve recebimento anulado');
s=fixture();s.pagamentos.push(copy(s.pagamentos[0]));fails(()=>request(s),/duplicado/,'ID duplicado da origem não é aceito');
s=fixture();s.alunos[0].ativo=false;request(s);confirm(s);eq(C.resumo(s,s.pagamentos[0]).devolvido,30000,'cliente encerrado ainda recebe registro de devolução');
s=fixture();const before=copy(s),base=C.snapshotCancelamento(s,'a');const canceled=C.cancelaAtendimento(s,'a',base,{motivo:'Cliente encerrou o acompanhamento',confereExterno:true},meta('cancel'));
eq(s.alunos[0].ativo,false,'cancelamento encerra acompanhamento');eq(s.contratosPT[0].status,'encerrado','contrato ativo é encerrado');eq(s.contratosPT[1],before.contratosPT[1],'contrato de outro aluno preservado');
eq(s.alunos[0].pacote.renova,false,'cancelamento desliga renovação local do pacote');eq(s.alunos[0].pacote.total,10,'quantidade histórica do pacote não é falsificada');
eq(s.sessoes.map(x=>x.id),['feita','falta','passada','outra'],'só sessões realmente futuras não realizadas saem da agenda ativa');
eq(canceled.sessoesCanceladas.map(x=>x.id),['futura','amanha'],'sessões retiradas ficam arquivadas integralmente');eq(canceled.contratosAnteriores[0],before.contratosPT[0],'contrato original arquivado');
eq(s.pagamentos,before.pagamentos,'cancelamento nunca apaga pagamentos');eq(s.treinosV2,before.treinosV2,'treinos preservados');eq(s.avaliacoes,before.avaliacoes,'avaliações preservadas');
fails(()=>C.cancelaAtendimento(s,'a',C.snapshotCancelamento(s,'a'),{motivo:'Repetir',confereExterno:true},meta('x')),/já está encerrado/,'segundo cancelamento recusado');
for(const assinatura of ['assinaturaAs','assinaturaRec']){s=fixture();s.alunos[0][assinatura]={id:'externa-ficticia'};const before=JSON.stringify(s);fails(()=>C.cancelaAtendimento(s,'a',C.snapshotCancelamento(s,'a'),{motivo:'Quero cancelar',confereExterno:true},meta('c')),/assinatura automática/,'não finge cancelar '+assinatura);eq(JSON.stringify(s),before,'bloqueio mantém cadastro');}
s=fixture();let oldBase=C.snapshotCancelamento(s,'a');s.sessoes.push({id:'nova',alunoId:'a',data:'2026-09-15'});fails(()=>C.cancelaAtendimento(s,'a',oldBase,{motivo:'Quero cancelar',confereExterno:true},meta('c')),/mudou/,'cancela com base somente na agenda conferida');
s=fixture();oldBase=C.snapshotCancelamento(s,'a');s.pagamentos.push({id:'outro',alunoId:'b',valor:2,data:'2026-09-14'});C.cancelaAtendimento(s,'a',oldBase,{motivo:'Quero cancelar',confereExterno:true},meta('c'));ok(s.pagamentos.some(p=>p.id==='outro'),'cancelar não perde recebimento concorrente de outro aluno');
s=fixture();s.estornosPT={};fails(()=>request(s),/inválido/,'histórico malformado não é substituído por uma lista vazia');
// Toda gravação usa somente centavos válidos; a fórmula respeita os limites em sequências.
for(let i=1;i<=40;i++){s=fixture();let left=60000;for(let j=0;j<5;j++){let n=Math.max(1,Math.floor(left/(j+2)));request(s,(n/100).toFixed(2),'r'+j);confirm(s,'r'+j);left-=n;}eq(C.resumo(s,s.pagamentos[0]).disponivel,left,'soma exata em sequência '+i);}
console.log(checks+' verificações de cancelamento e devolução passaram.');
