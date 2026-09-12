const fs = require('fs');
const assert = require('assert');

let n = 0;
function ok(cond, msg) { n++; assert.ok(cond, msg); }
function read(p) { return fs.readFileSync(p, 'utf8'); }

const js = read('assets/personal-pro-suite.js');
const css = read('assets/personal-pro-suite.css');
const shell = read('assets/personal-torque-one.js');
const sw = read('sw.js');
const mig = read('supabase/migrations/20260912120000_personal_pro_suite_v830.sql');
const idx = read('supabase/migrations/20260912120500_personal_pro_suite_v830_indexes.sql');

['import','presencial','automacoes','agenda','equipe'].forEach(id =>
  ok(js.includes(`data-ptpro-tab="${id}"`), `aba ${id} precisa existir`)
);
ok(js.includes("from('personal_importacoes')"), 'importação usa tabela dedicada');
ok(js.includes("from('personal_sessoes')"), 'sessão presencial usa tabela dedicada');
ok(js.includes("from('personal_automacoes')"), 'automação usa tabela dedicada');
ok(js.includes("from('personal_lista_espera')"), 'lista de espera usa tabela dedicada');
ok(js.includes("from('personal_creditos')"), 'créditos usam tabela dedicada');
ok(js.includes("from('personal_aluno_equipe')"), 'equipe usa tabela dedicada');
ok(js.includes("window.MT_supabase"), 'reutiliza cliente Supabase existente');
ok(!js.includes('service_role'), 'frontend nunca contém service_role');
ok(!js.includes('data-a="'), 'módulo não cria/substitui rotas data-a do Personal');
ok(shell.includes('assets/personal-pro-suite.js'), 'shell carrega módulo de forma isolada');
ok(sw.includes('assets/personal-pro-suite.js'), 'JS entra no precache');
ok(sw.includes('assets/personal-pro-suite.css'), 'CSS entra no precache');
ok(sw.includes('mt-v830'), 'service worker raiz avança para mt-v830');
ok(read('assets/versao.js').includes('mt-v830'), 'versão pública avança para mt-v830');
ok(read('app/app-sw.js').includes('mt-v830'), 'service worker do aluno permanece sincronizado');

['--pt-fundo','--pt-card','--pt-borda','--pt-txt','--pt-one-primary'].forEach(token =>
  ok(css.includes(token), `visual deve herdar token ${token}`)
);
ok(css.includes('@media(max-width:860px)'), 'layout possui adaptação mobile');
ok(css.includes('min-height:44px'), 'controles preservam alvo mínimo de toque');

const tables = ['personal_importacoes','personal_sessoes','personal_automacoes','personal_automacao_fila','personal_lista_espera','personal_creditos','personal_aluno_equipe'];
tables.forEach(t => {
  ok(mig.includes(`create table if not exists public.${t}`), `migração cria ${t}`);
  ok(mig.includes(`alter table public.${t} enable row level security`), `RLS habilitada em ${t}`);
  ok(mig.includes(`on public.${t}`), `política/índice referencia ${t}`);
});
ok(mig.includes('to authenticated'), 'políticas/grants usam authenticated');
ok(mig.includes('revoke all on public.personal_importacoes from anon'), 'anon não recebe acesso às novas tabelas');
ok(mig.includes('torque_private.personal_automacao_enfileira_questionario'), 'gatilho de questionário vive em schema privado');
ok(mig.includes('revoke all on function torque_private.personal_automacao_enfileira_questionario() from public, anon, authenticated'), 'função de gatilho não é RPC pública');
ok(mig.includes("a.gatilho = 'questionario.respondido'"), 'somente automações explícitas de questionário entram na fila');
ok(idx.includes('personal_automacao_fila_automacao_idx'), 'índice de FK da fila presente');
ok(idx.includes('personal_aluno_equipe_substituto_idx'), 'índice de FK do substituto presente');

console.log(`personal-pro-suite: ${n} verificações passaram`);
