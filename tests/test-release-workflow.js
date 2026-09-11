/* Contratos estáticos do workflow + empacotamento real em Git temporário.
 * Não executa deploy nem consulta produção. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; console.log('OK ' + label); }
const pages = read('.github/workflows/pages.yml');
const tests = read('.github/workflows/tests.yml');
const alias = read('.github/workflows/testes.yml');
const setup = read('.github/scripts/setup-tests.sh');
const manifest = JSON.parse(read('tests/ci/package.json'));
const lock = JSON.parse(read('tests/ci/package-lock.json'));
assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
ok(true, 'Manifesto e lock têm as mesmas dependências');
ok(/npm ci --prefix tests\/ci --ignore-scripts/.test(setup) && !/npm install/.test(setup), 'CI exige lock e não executa scripts de instalação');
ok(/image: postgres:17\.11/.test(tests) && /55432:5432/.test(tests), 'Concorrência usa PostgreSQL isolado com versão fixa');
ok(/PGTESTURL: postgresql:\/\/postgres:torque-test-only@127\.0\.0\.1:55432\/postgres/.test(tests), 'Suíte SQL recebe somente o serviço local fictício');
ok(/npm ci --prefix tests\/sql --ignore-scripts/.test(setup), 'Dependências SQL seguem lock e instalação sem scripts');
const pinned = manifest.dependencies.playwright;
ok(/^\d+\.\d+\.\d+$/.test(pinned) &&
 lock.packages['node_modules/playwright'].version === pinned &&
 lock.packages['node_modules/playwright-core'].version === pinned &&
 Object.entries(lock.packages).filter(([name])=>name).every(([,p])=>
  p.resolved.startsWith('https://registry.npmjs.org/') && /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(p.integrity)),
 'Playwright e core têm versões exatas, registro oficial e integridades no lock');
ok(/needs: validar/.test(pages), 'Deploy depende do job validar');
ok(/uses: \.\/\.github\/workflows\/tests.yml/.test(pages), 'Pages reutiliza a suíte canônica do mesmo commit');
ok(/upload_pages: true/.test(pages) && /inputs.upload_pages/.test(tests), 'Artefato só é disponibilizado explicitamente');
ok(!/continue-on-error|workflow_run|pull_request_target/.test(pages + tests), 'Falhas não são ignoradas nem executadas com contexto privilegiado de PR');
ok(!/upload-pages-artifact|actions\/checkout/.test(pages), 'Deploy não recria o artefato nem troca de checkout');
ok(/needs: validar[\s\S]*github.ref == 'refs\/heads\/main'/.test(pages), 'Somente main pode publicar');
ok(!/^  push:/m.test(tests) && !/^  (push|pull_request):/m.test(alias), 'Uma suíte geral automática, sem duplicação no alias');
ok(/ref: \$\{\{ github.sha \}\}/.test(tests), 'Checkout fixado no SHA do evento');
ok(/set -euo pipefail[\s\S]*bash tests\/run.sh.*tee/.test(tests), 'Logs não escondem falhas da suíte');
ok(/if: always\(\)/.test(tests), 'Evidências preservadas mesmo em falha');
ok(tests.indexOf('name: dependencias-ci-') > 0 && tests.indexOf('name: dependencias-ci-') < tests.indexOf('bash tests/run.sh'), 'Dependências possuem checkpoint antes da suíte completa');
ok(pages.indexOf('pages: write') > pages.indexOf('  deploy:'), 'Permissão de publicação limitada ao deploy');
ok(!/secrets: inherit|contents: write/.test(tests + pages), 'Testes não recebem segredos nem permissão de editar código');
ok(/data.object.sha !== context.sha/.test(pages), 'Divergência da main exige verificação antes de publicar');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'torque-release-'));
try {
 const repo = path.join(tmp, 'repo'); fs.mkdirSync(repo);
 const git = (...args) => execFileSync('git', args, {cwd: repo, encoding: 'utf8', stdio: ['ignore','pipe','pipe']}).trim();
 git('init'); git('config','core.autocrlf','false'); git('config','user.name','Teste local'); git('config','user.email','fixture@example.invalid');
 fs.mkdirSync(path.join(repo,'assets'));
 fs.writeFileSync(path.join(repo,'assets/versao.js'),'self.MT_VERSAO = "mt-v822";\n');
 fs.writeFileSync(path.join(repo,'index.html'),'<h1>Fixture sem dados reais</h1>\n');
 git('add','.'); git('commit','-m','Fixture');
 const sha=git('rev-parse','HEAD'), output=path.join(tmp,'output');
 const env={...process.env,RUNNER_TEMP:tmp.replace(/\\/g,'/'),GITHUB_OUTPUT:output.replace(/\\/g,'/'),GITHUB_SHA:sha};
 const run=()=>spawnSync('bash',[path.join(root,'.github/scripts/prepare-pages.sh')],{cwd:repo,env,encoding:'utf8'});
 fs.writeFileSync(path.join(repo,'nao-publicar.txt'),'Arquivo não versionado');
 let result=run();ok(result.status===0,'Empacota commit limpo após aprovação: '+result.stderr);
 const dest=fs.readFileSync(output,'utf8').trim().split('\n').at(-1).slice(5);
 ok(!fs.existsSync(path.join(dest,'nao-publicar.txt')), 'Não inclui arquivos não versionados');
 ok(fs.readFileSync(path.join(dest,'index.html'),'utf8')===fs.readFileSync(path.join(repo,'index.html'),'utf8'), 'Artefato preserva os bytes versionados');
 ok(JSON.parse(fs.readFileSync(path.join(dest,'release-info.json'),'utf8')).commit===sha, 'Artefato identifica o commit exato');
 fs.appendFileSync(path.join(repo,'index.html'),'Modificação depois do teste');
 ok(run().status!==0,'Modificação após testes bloqueia publicação');
 git('checkout','--','index.html');env.GITHUB_SHA='0'.repeat(40);
 ok(run().status!==0,'Checkout de outro commit bloqueia publicação');
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }

// Executa o próprio guard do workflow. A única exceção de main adiantada
// permitida é o arquivo de briefing gerado pelo bot; nunca código de runtime.
const block = pages.match(/          script: \|\n([\s\S]*?)      - uses: actions\/configure-pages/);
assert.ok(block, 'Guard do deploy localizado');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const guard = new AsyncFunction('github', 'context', 'core', block[1].replace(/^            /gm, ''));
(async () => {
 const tested = 'a'.repeat(40), current = 'b'.repeat(40);
 const context = {repo:{owner:'fixture',repo:'torque'},sha:tested};
 async function simulate(head, comparison, rejectCompare = false) {
  const failures = [], comparisons = [];
  const github = {
   rest:{git:{getRef:async args=>{assert.equal(args.ref,'heads/main');return {data:{object:{sha:head}}};}}},
   request:async (route,args)=>{
    comparisons.push(args.basehead);
    assert.equal(route,'GET /repos/{owner}/{repo}/compare/{basehead}');
    assert.equal(args.page,1);
    if(rejectCompare)throw new Error('Falha de API simulada');
    return {data:comparison};
   }
  };
  try { await guard(github,context,{setFailed:m=>failures.push(m),info:()=>{}}); }
  catch(error){failures.push(error.message);}
  return {failures,comparisons};
 }
 const docs = {status:'ahead',ahead_by:1,behind_by:0,files:[{filename:'design/BRIEFING-CLAUDE-DESIGN.md',status:'modified'}]};
 let result = await simulate(tested,null);
 ok(result.failures.length===0&&result.comparisons.length===0,'Mesmo commit aprovado dispensa comparação');
 result = await simulate(current,docs);
 ok(result.failures.length===0,'Atualização isolada do briefing não bloqueia o runtime já testado');
 ok(result.comparisons[0]===tested+'...'+current,'Comparação usa SHAs fixos, não uma main móvel');
 result = await simulate(current,{...docs,files:[...docs.files,{filename:'personal.html',status:'modified'}]});
 ok(result.failures.length>0,'Mudança de código junto do briefing bloqueia deploy antigo');
 result = await simulate(current,{...docs,status:'diverged',behind_by:1});
 ok(result.failures.length>0,'Históricos divergentes não são autorizados como documentação');
 result = await simulate(current,{...docs,files:[]});
 ok(result.failures.length>0,'Comparação vazia não é aceita como prova');
 result = await simulate(current,{...docs,files:undefined});
 ok(result.failures.length>0,'Resposta incompleta bloqueia publicação');
 result = await simulate(current,{...docs,files:[{filename:'design/BRIEFING-CLAUDE-DESIGN.md',status:'renamed',previous_filename:'personal.html'}]});
 ok(result.failures.length>0,'Renomear código para briefing não contorna o bloqueio');
 result = await simulate(current,docs,true);
 ok(result.failures.length>0,'Falha da API é bloqueante, não autorização implícita');
 console.log(checks+' verificações de release aprovadas; não atesta configuração administrativa nem deploy real.');
})().catch(error=>{console.error(error);process.exitCode=1;});

