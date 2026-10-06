'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
function verify(){
  const {sourceBaseSha}=require('./source-base.json');assert.match(sourceBaseSha,/^[a-f0-9]{40}$/);
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(['merge-base','--is-ancestor',sourceBaseSha,'HEAD']);
  const permitted=name=>name.startsWith('tests/personal-journey-ci/') || name==='tests/hq-auth-ci/run.sh' || name==='.github/workflows/personal-journey-auth.yml';
  const changes=git(['diff','--name-only',sourceBaseSha,'--']).split(/\r?\n/).filter(Boolean);
  assert(changes.every(permitted),'Product source drift from the declared base');
  const files=['personal.html','assets/modulo-conta.js','assets/cloud-config.js','apps/store.js',
    'assets/prescricao-series.js','app/index.html','app/aluno-builder.js','app/aluno-skin.js','supabase-setup.sql'];
  return {sourceBaseSha,harnessSha:git(['rev-parse','HEAD']),files:files.map(file=>({file,
    sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')})),
    configurationOverride:'Only the HTTP response for assets/cloud-config.js uses the disposable origin/anon credential; GIF and native-store keys disabled.',
    productSourceDrift:[]};
}
if(require.main===module){try{console.log(JSON.stringify(verify(),null,2));}catch{console.error('FAIL declared source integrity');process.exitCode=1;}}
module.exports={verify};
