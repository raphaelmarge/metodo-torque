# Validação do timeout SaaS — base e candidato

Base remota confirmada em 30/09/2026: `7019199b27d60068c581a8dd83c08a6df2d7f83d`, mt-v849. Candidato: pacote integrado mt-v851. Não houve alteração em `aluno-login.html`, `assets/access.js` ou `assets/app.js`.

O comparador `tools/hq-ops/compare-saas.cjs` executa o teste de cada checkout sem modificar a base, usando o mesmo servidor HTTP em loopback, Chrome local, contexto efêmero, fuso `America/Sao_Paulo` e bloqueio de rede externa. A única variável do ensaio é permitir/bloquear service workers. O teste de cada versão mantém suas próprias expectativas comerciais.

| Execução | Resultado observado |
|---|---|
| Base + worker permitido | Suíte inteira passou; resposta simulada do destino não veio de worker. |
| Base + worker bloqueado | Suíte inteira passou. |
| Candidato + worker permitido | Reproduziu timeout no marcador do mock de destino; `DESTINATION_FROM_SW=true`. |
| Candidato + worker bloqueado | Suíte inteira passou. |
| Arquivo corrigido `tests/test-saas.js`, execução direta | Suíte inteira passou, inclusive HQ legado, suporte e comissões; sem erros de página. |

O login chamou a RPC simulada, salvou o token e redirecionou corretamente. O worker passou a servir a navegação antes de `page.route`, logo o mock `APP DO ALUNO OK` nunca era entregue. O patch corrigiu a instalação do precache ao deduplicar entradas; a base tinha `personal.html` repetido e não deduplicava. A instalação funcional expôs um acoplamento antigo entre a suíte e o estado do worker.

Correção restrita à infraestrutura do teste: contextos que dependem de `page.route` usam `serviceWorkers: 'block'`. Não foi removida a correção de cache, alterado o login ou ampliado o timeout. `tests/test-personal-sales-cache.js` continua instalando e atualizando os workers reais e validando offline, preservação de dados e exclusão de respostas sensíveis do cache.

Reprodução:

```powershell
node tools/hq-ops/compare-saas.cjs ../torque-hq-audit-source allow
node tools/hq-ops/compare-saas.cjs ../torque-hq-audit-source block
node tools/hq-ops/compare-saas.cjs . allow
node tools/hq-ops/compare-saas.cjs . block
```

O terceiro comando é um ensaio diagnóstico e espera reproduzir a interferência, não é gate de aprovação. O gate funcional usa o arquivo corrigido e a suíte real de cache. Nenhuma chamada ou credencial de produção foi usada.
