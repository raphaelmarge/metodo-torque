/* Contratos estáticos do workflow + empacotamento real em Git temporário.
 * Não executa deploy nem consulta produção. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {execFileSync, spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; console.log('OK ' + label); }
const pages = read('.github/workflows/pages.yml');
const tests = read('.github/workflows/tests.yml');
const alias = read('.github/workflows/testes.yml');
const setup = read('.github/scripts/setup-tests.sh');
function stepOutputs(file) {
 return Object.fromEntries(fs.readFileSync(file,'utf8').trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
}
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
ok(/mapbox_config_sha256:\s*\$\{\{\s*steps\.pacote\.outputs\.mapbox_config_sha256\s*\}\}/.test(tests), 'Hash preparado no step é exposto pelo job de validação');
ok(/value:\s*\$\{\{\s*jobs\.testes\.outputs\.mapbox_config_sha256\s*\}\}/.test(tests), 'Workflow reutilizável propaga o hash exato produzido neste run');
ok(/EXPECTED_MAPBOX_CONFIG_SHA256:\s*\$\{\{\s*needs\.validar\.outputs\.mapbox_config_sha256\s*\}\}/.test(pages), 'Deploy recebe o hash do artefato validado, além do commit');
ok(/release-info\.json\?sha=\$EXPECTED_SHA&mapa=\$EXPECTED_MAPBOX_CONFIG_SHA256/.test(pages)&&/assets\/mapa-config\.js\?sha=\$EXPECTED_SHA&mapa=\$EXPECTED_MAPBOX_CONFIG_SHA256/.test(pages), 'Verificação baixa manifesto e configuração usando a identidade deste artefato');
const deployedVerifier=(pages.match(/python3 -c '([^']+)' "\$RUNNER_TEMP\/release-info\.json" "\$RUNNER_TEMP\/mapa-config\.js"/)||[])[1];
ok(!!deployedVerifier, 'Verificador real de commit e configuração foi localizado no workflow');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'torque-release-'));
try {
 const repo = path.join(tmp, 'repo'); fs.mkdirSync(repo);
 const git = (...args) => execFileSync('git', args, {cwd: repo, encoding: 'utf8', stdio: ['ignore','pipe','pipe']}).trim();
 git('init'); git('config','core.autocrlf','false'); git('config','user.name','Teste local'); git('config','user.email','fixture@example.invalid');
 fs.mkdirSync(path.join(repo,'assets'));
 fs.writeFileSync(path.join(repo,'assets/versao.js'),'self.MT_VERSAO = "mt-v822";\n');
 fs.writeFileSync(path.join(repo,'assets/mapa-config.js'),read('assets/mapa-config.js'));
 fs.mkdirSync(path.join(repo,'tools/mapa-config'),{recursive:true});
 fs.writeFileSync(path.join(repo,'tools/mapa-config/gera.js'),read('tools/mapa-config/gera.js'));
 fs.writeFileSync(path.join(repo,'index.html'),'<h1>Fixture sem dados reais</h1>\n');
 git('add','.'); git('commit','-m','Fixture');
 const sha=git('rev-parse','HEAD'), output=path.join(tmp,'output');
 const tokenMapa='pk.releaseFixture.syntheticSignature';
 const env={...process.env,RUNNER_TEMP:tmp.replace(/\\/g,'/'),GITHUB_OUTPUT:output.replace(/\\/g,'/'),GITHUB_SHA:sha,MAPBOX_PUBLIC_TOKEN:tokenMapa,REQUIRE_MAPBOX_PUBLIC_TOKEN:'true'};
 const run=()=>spawnSync('bash',[path.join(root,'.github/scripts/prepare-pages.sh')],{cwd:repo,env,encoding:'utf8'});
 fs.writeFileSync(path.join(repo,'nao-publicar.txt'),'Arquivo não versionado');
 let result=run();ok(result.status===0,'Empacota commit limpo após aprovação: '+result.stderr);
 const dest=stepOutputs(output).path;
 ok(!fs.existsSync(path.join(dest,'nao-publicar.txt')), 'Não inclui arquivos não versionados');
 ok(fs.readFileSync(path.join(dest,'index.html'),'utf8')===fs.readFileSync(path.join(repo,'index.html'),'utf8'), 'Artefato preserva os bytes versionados');
 const releaseInfo=JSON.parse(fs.readFileSync(path.join(dest,'release-info.json'),'utf8'));
 ok(releaseInfo.commit===sha, 'Artefato identifica o commit exato');
 const mapaGerado=fs.readFileSync(path.join(dest,'assets/mapa-config.js'),'utf8'),mapaVm={self:{}};
 vm.runInNewContext(mapaGerado,mapaVm,{timeout:1000});
 ok(mapaVm.self.MT_MAPA.mapboxToken===tokenMapa, 'Artefato recebe a configuração pública fornecida pelo ambiente');
 ok(releaseInfo.mapbox_configured===true, 'Manifesto registra que o artefato contém Mapbox configurado');
 ok(releaseInfo.mapbox_config_sha256===crypto.createHash('sha256').update(mapaGerado).digest('hex'), 'Manifesto vincula o hash aos bytes da configuração efetivamente empacotada');
 ok(stepOutputs(output).mapbox_config_sha256===releaseInfo.mapbox_config_sha256, 'Output do step exporta o mesmo hash registrado no artefato');
 // Executa o mesmo Python usado após o deploy, com respostas locais fictícias.
 // Não basta comparar os dois arquivos servidos entre si: ambos podem ser de
 // outro run que publicou o mesmo commit com uma configuração mais antiga.
 const servedManifest=path.join(tmp,'served-release.json'),servedConfig=path.join(tmp,'served-mapa.js');
 const verifyServed=(info,source,expected=releaseInfo.mapbox_config_sha256)=>{
  fs.writeFileSync(servedManifest,JSON.stringify(info));fs.writeFileSync(servedConfig,source);
  // A publicação já usa Bash; o mesmo caminho também encontra o Python
  // configurado no ambiente Windows, sem interpolar código ou caminhos.
  return spawnSync('bash',['-c','python3 "$@"','torque-verificacao','-c',deployedVerifier,servedManifest.replace(/\\/g,'/'),servedConfig.replace(/\\/g,'/')],{encoding:'utf8',env:{...env,EXPECTED_SHA:sha,EXPECTED_MAPBOX_CONFIG_SHA256:expected}});
 };
 let verified=verifyServed(releaseInfo,mapaGerado);
 ok(verified.status===0,'Verificador aprova commit, manifesto e bytes do artefato deste run');
 ok(!(verified.stdout+verified.stderr).includes(tokenMapa),'Verificação pós-deploy não imprime a configuração pública');
 const {render}=require('../tools/mapa-config/gera.js');
 const oldConfig=render('pk.oldRelease.oldSignature'),oldHash=crypto.createHash('sha256').update(oldConfig).digest('hex');
 ok(verifyServed({...releaseInfo,mapbox_config_sha256:oldHash},oldConfig).status!==0,'Mesmo commit com manifesto e configuração antigos é recusado');
 ok(verifyServed(releaseInfo,oldConfig).status!==0,'Manifesto correto com bytes antigos da configuração é recusado');
 ok(verifyServed({...releaseInfo,mapbox_config_sha256:oldHash},mapaGerado).status!==0,'Configuração correta com hash antigo no manifesto é recusada');
 ok(verifyServed({...releaseInfo,mapbox_configured:false},mapaGerado).status!==0,'Configuração marcada como desativada não confirma a ativação publicada');
 ok(verifyServed({...releaseInfo,mapbox_configured:'true'},mapaGerado).status!==0,'Texto truthy no manifesto não substitui o indicador booleano de configuração');
 const missingHash={...releaseInfo};delete missingHash.mapbox_config_sha256;
 ok(verifyServed(missingHash,mapaGerado).status!==0,'Manifesto sem hash não é aceito como prova');
 ok(verifyServed(releaseInfo,mapaGerado,'').status!==0&&verifyServed(releaseInfo,mapaGerado,'hash-invalido').status!==0,'Hash esperado ausente ou inválido bloqueia a confirmação');
 ok(verifyServed({...releaseInfo,commit:'0'.repeat(40)},mapaGerado).status!==0,'Configuração correta não autoriza commit diferente do aprovado');
 ok(!JSON.stringify(releaseInfo).includes(tokenMapa)&&!(result.stdout+result.stderr).includes(tokenMapa), 'Manifesto e logs não repetem o token da configuração');
 ok(fs.readFileSync(path.join(repo,'assets/mapa-config.js'),'utf8')===read('assets/mapa-config.js')&&git('status','--porcelain')==='?? nao-publicar.txt', 'Configuração gerada permanece só no artefato e não suja o checkout aprovado');
 env.MAPBOX_PUBLIC_TOKEN='';env.REQUIRE_MAPBOX_PUBLIC_TOKEN='false';
 result=run();ok(result.status===0,'Empacotamento de PR admite configuração desativada');
 const semToken=stepOutputs(output).path;
 const infoSemToken=JSON.parse(fs.readFileSync(path.join(semToken,'release-info.json'),'utf8'));
 ok(infoSemToken.mapbox_configured===false&&infoSemToken.mapbox_config_sha256===crypto.createHash('sha256').update(fs.readFileSync(path.join(semToken,'assets/mapa-config.js'))).digest('hex'), 'Manifesto sem token informa desativação e preserva a verificação por hash');
 env.REQUIRE_MAPBOX_PUBLIC_TOKEN='true';ok(run().status!==0,'Pages recusa artefato sem a configuração pública obrigatória');
 env.MAPBOX_PUBLIC_TOKEN=tokenMapa;
 fs.appendFileSync(path.join(repo,'index.html'),'Modificação depois do teste');
 ok(run().status!==0,'Modificação após testes bloqueia publicação');
 git('checkout','--','index.html');env.GITHUB_SHA='0'.repeat(40);
 ok(run().status!==0,'Checkout de outro commit bloqueia publicação');
} finally {
 const resolved=path.resolve(tmp),tempRoot=path.resolve(os.tmpdir())+path.sep;
 assert.ok(resolved.startsWith(tempRoot)&&path.basename(resolved).startsWith('torque-release-'));
 fs.rmSync(resolved,{recursive:true,force:true});
}

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

