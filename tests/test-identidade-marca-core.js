/* Contrato público da marca; nenhuma chamada de rede nem informação real. */
const assert = require('node:assert/strict');
global.self = global;
require('../assets/identidade-marca.js');
require('../app/aluno-builder.js');
const C = MT_IDENTIDADE_MARCA; let n = 0;
function eq(a,b,s) { assert.deepEqual(a,b,s); n++; console.log('OK '+s); }
function ok(a,s) { assert.ok(a,s); n++; console.log('OK '+s); }
function fail(fn,s) { assert.throws(fn); n++; console.log('OK '+s); }
const old = {nome:'Studio Horizonte',professor:'Ana Silva',pixNome:'ANA LEGAL',outro:{semAlteracao:true}};
const input = {modo:'ambos',destaque:'estudio',profissional:'Ana Silva',nomeEstudio:'Studio Horizonte',nomeCurto:'Horizonte',slogan:'Movimento com cuidado'};
const cfg = Object.assign({}, old, C.valida(input));
eq(C.resolve(old).principal,'Studio Horizonte','legado conserva nome integral');
eq(C.resolve(old).personalizado,false,'não migra contas por adivinhação');
eq(C.resolve({}).principal,'Meu Personal','estado vazio com nome neutro');
eq(C.resolve({nome:'Ana Maria dos Santos'}).principal,'Ana Maria dos Santos','não reduz nome antigo à primeira palavra');
eq(C.resolve(cfg).principal,'Studio Horizonte','marca como identidade principal');
eq(C.resolve(cfg).secundario,'Treinamento por Ana Silva','pessoa aparece separada da empresa');
eq(C.resolve(cfg).curto,'Horizonte','apelido só nos espaços reduzidos');
eq(C.resolve(cfg).profissional,'Ana Silva','profissional não vira marca');
eq(C.resolve({...cfg, identidadeMarca:{...cfg.identidadeMarca,destaque:'profissional'}}).principal,'Ana Silva','destaque do profissional na opção combinada');
eq(C.resolve({...cfg, identidadeMarca:{...cfg.identidadeMarca,destaque:'profissional'}}).secundario,'Studio Horizonte','marca continua na segunda linha');
for (const mode of ['estudio','profissional']) {
 const m=C.resolve({...cfg,identidadeMarca:{...cfg.identidadeMarca,modo:mode,nomeCurto:''}});
 eq(m.principal,mode==='estudio'?'Studio Horizonte':'Ana Silva','modo isolado '+mode);
 eq(m.secundario,'','modo isolado não impõe segunda identidade');eq(m.curto,m.principal,'sem apelido usa nome integral');
}
eq(cfg.nome,old.nome,'não altera cadastro do negócio');eq(cfg.pixNome,old.pixNome,'não altera recebedor bancário');
eq(old.identidadeMarca,undefined,'validação não altera objeto antigo');
for(const c of [{...input,modo:'xxx'},{...input,profissional:''},{...input,nomeEstudio:''},{...input,destaque:''},{...input,slogan:'x'.repeat(101)},{...input,nomeCurto:'x'.repeat(33)},{...input,profissional:'x'.repeat(121)}]) fail(()=>C.valida(c),'campos inconsistentes recusados');
eq(C.resolve({nome:'Original',identidadeMarca:{v:99,modo:'estudio',nomeEstudio:'Outra'}}).principal,'Original','versão desconhecida preserva o legado');
eq(C.resolve({...cfg,identidadeMarca:{...cfg.identidadeMarca,nomeEstudio:''}}).principal,'Studio Horizonte','config incompleta não publica marca vazia');
eq(C.texto({html:'x'},120),'','não converte objetos em marca');eq(C.texto('  Studio   D’Ávila  ',120),'Studio D’Ávila','acentos e apóstrofos preservados');
for(const bad of ['javascript:alert(1)','https://example.invalid/imagem.jpg','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,x\' onerror=alert(1)']) eq(C.logo(bad),'','logo não executável');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
eq(C.logo(png),png,'logo raster local aceito');eq(C.logo('data:image/png;base64,'+'A'.repeat(205000)),'','logo tem teto de tamanho');
const m=C.resolve(cfg),d={a:{nome:'Aluno Sintético'},studio:m.principal,identidadeApp:m,LOGOAPP:png};
eq(C.doPacote(d),m,'pacote contém a identidade pública canônica');
eq(C.doPacote({...d,identidadeApp:{...m,modo:'invalido'}}).personalizado,false,'DTO desconhecido usa modo legado sem executar conteúdo');
const html=MT_APP_ALUNO.monta(d);
ok(html.includes('al-brand-primary') && html.includes('Treinamento por Ana Silva'),'template recebe nome e segunda linha');
ok(html.includes('Movimento com cuidado'),'slogan aparece no template');
ok(!html.includes('ANA LEGAL'),'dados bancários não entram na identidade');
for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {new Function(script[1]);n++;}
const hostile=C.resolve(Object.assign({},cfg,C.valida({...input,nomeEstudio:"<script>window.__marcaXss=1</script>",profissional:"Ana <img src=x onerror='alert(1)'>"})));
const unsafe=MT_APP_ALUNO.monta({...d,studio:hostile.principal,identidadeApp:hostile});
ok(!unsafe.includes('<script>window.__marcaXss=1</script>'),'markup na marca nunca vira script');
ok(unsafe.includes('&lt;script&gt;'),'nome é renderizado como texto escapado');
for(const script of unsafe.matchAll(/<script>([\s\S]*?)<\/script>/g)) {new Function(script[1]);n++;}
console.log(n+' verificações da identidade passaram.');
