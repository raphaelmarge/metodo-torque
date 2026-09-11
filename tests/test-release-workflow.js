/* Contratos estáticos do workflow + empacotamento real em Git temporário.
 * Não executa deploy nem consulta produção. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; console.log('OK ' + label); }
const pages = read('.github/workflows/pages.yml');
const tests = read('.github/workflows/tests.yml');
const alias = read('.github/workflows/testes.yml');
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
ok(pages.indexOf('pages: write') > pages.indexOf('  deploy:'), 'Permissão de publicação limitada ao deploy');
ok(!/secrets: inherit|contents: write/.test(tests + pages), 'Testes não recebem segredos nem permissão de editar código');
ok(/data.object.sha !== context.sha/.test(pages), 'Reexecução de commit ultrapassado não substitui a main atual');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'torque-release-'));
try {
 const repo = path.join(tmp, 'repo'); fs.mkdirSync(repo);
 const git = (...args) => execFileSync('git', args, {cwd: repo, encoding: 'utf8', stdio: ['ignore','pipe','pipe']}).trim();
 git('init'); git('config','user.name','Teste local'); git('config','user.email','fixture@example.invalid');
 fs.mkdirSync(path.join(repo,'assets'));
 fs.writeFileSync(path.join(repo,'assets/versao.js'),'self.MT_VERSAO = "mt-v822";\n');
 fs.writeFileSync(path.join(repo,'index.html'),'<h1>Fixture sem dados reais</h1>\n');
 git('add','.'); git('commit','-m','Fixture');
 const sha=git('rev-parse','HEAD'), output=path.join(tmp,'output');
 const env={...process.env,RUNNER_TEMP:tmp,GITHUB_OUTPUT:output,GITHUB_SHA:sha};
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
console.log(checks+' verificações de release aprovadas; não atesta configuração administrativa nem deploy real.');
