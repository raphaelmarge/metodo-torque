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

## Outros simuladores identificados pelo CI completo

O primeiro CI do pacote integrado (`d91f128`, run `36776397887`) executou 151 suítes e encontrou cinco com falha. A higiene dos testes foi corrigida em `ab8b5f9`; os ícones das duas novas páginas foram adicionados sem alterar os critérios de `test-lojas.js`. As outras três falhas tinham a mesma origem de interceptação pelo worker:

| Suíte | Comparação equivalente da base e candidato | Correção |
|---|---|---|
| `test-elite5.js` | Base: mock 200, fora do worker, `__trocaSec` presente. Candidato: worker devolve 404 para URL virtual, função ausente. | Contexto que serve documentos simulados bloqueia workers; todas as 29 verificações foram preservadas. |
| `test-nutricao.js` | Base com worker permitido passa. Candidato com worker permitido recebe 404 na fixture Pix; base e candidato com worker bloqueado passam nas 258 verificações anteriores. | Contextos de documentos/RPCs simulados bloqueiam workers; nova assertion confirma interceptação, HTTP 200 e resposta fora do worker. Runtime Nutri intacto. |
| `test-personal.js` | Base com builder indisponível faz duas requisições, mostra falha de internet e não guarda pacote. Candidato no contexto compartilhado recebe builder do cache, faz zero requisições simuladas e abre o app. Contextos novos e bloqueados reproduzem corretamente retry e falha em ambas as versões. | Só os três contextos de primeira abertura, retry e ausência de builder foram isolados. As assertions e os outros contextos permanecem. |

Esses ensaios usam Chrome, servidor loopback e fixtures sintéticas equivalentes; nenhum backend real foi acessado. Bloquear workers nos mocks não comprova comportamento offline: a suíte dedicada `test-personal-sales-cache.js` continua usando os workers reais. O resultado final de todas as suítes deve ser conferido no SHA final do PR antes da publicação.
