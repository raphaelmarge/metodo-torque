/* Entradas da demonstração: dois HTMLs montados pelo MESMO builder.
 * O gerador canônico entrega o aluno fictício com requerido true/false.
 * Principal e sem-cadastro abrem direto; cadastro preserva questionário e contrato.
 * Nenhum aceite é fabricado. Importar esta função não grava nem abre navegador.
 */
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const marker = 'var __demoOnboardingAceite=null;';
function gerarVariantes(apps) {
  if (!apps || typeof apps !== 'object' || Array.isArray(apps)) throw new TypeError('Forneça as duas demos montadas pelo builder.');
  function valida(html, cadastro) {
    if (typeof html !== 'string') throw new TypeError('Cada demo deve ser texto HTML.');
    if ((html.match(/<title>[^<]*<\/title>/g) || []).length !== 1) throw new Error('Cada demo precisa conter exatamente um título.');
    if (html.split(marker).length !== 2 || html.split('var __demoOnboardingAceite=').length !== 2) throw new Error('Cada demo precisa conter exatamente um estado inicial não assinado.');
    const runtime = html.includes('function runtime(cfg, api)');
    if (runtime !== cadastro) throw new Error('A entrada da demo divergiu: acesso direto não pode conter o bloqueio da consultoria.');
    return html.replace(/<title>[^<]*<\/title>/, cadastro ? '<title>Alex · Demo do aluno — com cadastro inicial</title>' : '<title>Alex · Demo do aluno — acesso direto</title>');
  }
  return { comCadastro: valida(apps.comCadastro, true), semCadastro: valida(apps.semCadastro, false) };
}
if (require.main === module) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'regen-demo.js')], { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (r.error) console.error(r.error.message);
  process.exitCode = r.status || (r.error ? 1 : 0);
}
module.exports = { gerarVariantes };
