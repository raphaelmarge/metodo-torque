# Torque Personal — correções e retomada

Iniciado em 11/09/2026. Fila: issue #826. Implementação: PR #827, branch `fix/826-rascunhos-ci-seguro`. Consultar o head atual do PR antes de retomar; um hash histórico não comprova a versão vigente.

## Estado do lote 1

Implementado na branch, **não publicado em produção**:

- Questionários: preserva nome e seleção por ID quando a gravação falha. Mantém o editor aberto, apresenta erro acessível e libera nova tentativa sem duplicação. Exige um ID novo com nome e perguntas correspondentes; um modelo antigo de mesmo nome não é falso sucesso. A camada visual não grava dados diretamente e não altera o CAS.
- CI: `tests.yml` é a suíte geral canônica para PR/reuso; `pages.yml` a chama na main; `testes.yml` é alias manual. Checkpoints de dependências precedem a suíte completa. Logs são guardados inclusive em falhas, por sete dias, sem repetição indefinida para obter verde.
- Publicação: depende dos testes, recusa checkout divergente e arquivos versionados alterados durante a execução. `git archive HEAD` exclui arquivos não versionados e dependências instaladas. O deploy usa esse mesmo artefato, sem novo checkout. `release-info.json` identifica commit/versão; a conferência pós-deploy tem seis tentativas limitadas.
- Main adiantada: o guard compara SHAs fixos e só tolera a modificação isolada de `design/BRIEFING-CLAUDE-DESIGN.md`. Esse bot usa GITHUB_TOKEN sem disparar outro Pages; a checagem inicial bloquearia publicações válidas. Código, renomeações, divergências, resposta vazia/incompleta e erro de API continuam bloqueantes.
- Dependências: Playwright e core 1.63.0 com lock versionado; instalação via `npm ci --ignore-scripts`. Isso não equivale a auditoria de vulnerabilidades dos pacotes ou do código vendorizado.
- Runtime proposto: mt-v822 nos três marcadores. Conferir a main antes de integrar e nunca reduzir uma versão concorrente mais nova.

## Evidências

| Comando | Resultado local |
| --- | --- |
| `node tests/test-sync-cas.js` | 15 cenários, mocks e contratos SQL estáticos |
| `node tests/test-sync-identidade.js` | 13 cenários, mocks |
| `node tests/test-sync-conflito-ui.js` | Aprovado, contrato da interface |
| `CHROMIUM_PATH=/usr/bin/chromium node tests/test-questionarios-usabilidade.js` | 43 verificações; 13 novas, DOM offline |
| `node tests/test-release-workflow.js` | 32 verificações; contratos, Git temporário e guard com API simulada |
| `node tests/test-versao.js` | 17 verificações |
| Sintaxe JavaScript/Bash e parse YAML | Aprovados; parse YAML não substitui validação do GitHub |

O teste de rascunho falhou antes da correção e passou depois. O bloqueio indevido do briefing também foi reproduzido antes do ajuste. O driver Chromium local difere do usado no CI; o CI do head final continua obrigatório. Não houve teste em aparelho físico ou homologação do banco em produção.

A revisão isolada de questionários passou nos runs `34565450564` (head `b28aca68bbea5f1274f988239f6e7aa3ca7f5e20`) e `34566273069` (head `1f2fb8a2c7f746e2cfc6899bdb8869381b0dbee0`). A suíte geral foi acionada nos runs `34565450627` e `34566273075`; consultar seus resultados e o run do head final. Aprovação de um head anterior não aprova commits posteriores.

O lock veio do artefato `10186127614`, run `34566273075`, head `1f2fb8a`, merge de teste `4abe75b90a538da32771be8821b6d527e569e62d`. SHA-256 do ZIP confirmado: `b51f588b853bbfd5585709a6395fd36179a1108c190270d182258018b40d6bc0`. Manifesto, versões, registro oficial e formato das integridades foram conferidos; o arquivo foi copiado sem alteração.

Base inspecionada: main `4d4e91be7fb16af905f933096d26d4445d8b8adc`, posterior ao runtime `355f69049fa65baa2cf5225450534aae7101fb3b` apenas pelo briefing gerado. O artefato do PR no merge de teste `8073f963033a13b23d1fe0d53c1806b153fedea0` permitiu confrontar os arquivos iniciais byte a byte. Os três arquivos do segundo commit também tiveram seus hashes conferidos. Isso não prova publicação.

## Fluxo de trabalho e retomada

`reproduzir → corrigir → testar regressão → revisar diff/SHA → suíte completa → integrar → confirmar publicação → registrar conclusão`

Cada item permanece separado em: identificado, reproduzido, corrigido na branch, aprovado no CI, publicado e validado no ambiente real.

1. Reler esta página, issue #826 e PR #827. Conferir os heads atuais da main e da branch, preservando entregas concorrentes.
2. Confirmar a instalação por `npm ci` e a suíte completa no SHA final. Investigar falhas reais; não remover testes nem repetir sem diagnosticar a causa. Checkpoints e logs registram o commit executado.
3. Confirmar proteção administrativa e fonte de Pages. Integrar somente o SHA revisado/aprovado; depois conferir `release-info.json` e os fluxos do Personal e do aluno.
4. Próximo lote P0: reconciliar #806/#807 com o CAS já presente no cliente atual. Verificar implantação, permissões/RLS, sessões concorrentes, reconexão e clientes antigos em ambiente controlado. Não restaurar históricos automaticamente.

## Bloqueios e pendências

A main consultada está sem proteção. A conexão não oferece escrita de branch protection ou da fonte de Pages. Um administrador deve configurar checks obrigatórios e fonte **GitHub Actions**, eliminando o publicador paralelo. O YAML sozinho não impede outro publicador habilitado administrativamente.

A tentativa de ler somente metadados, em transação read-only, do Supabase indicado por `assets/cloud-config.js` foi bloqueada pela ferramenta. **Não foi possível confirmar as definições e permissões instaladas no banco.** Nenhuma alteração de dados ou migração foi executada; mocks aprovados não encerram essa validação.

Permanecem na issue #826: reconciliação dos PRs #807/#823 e sobreposição #822/#825, cobertura e análise estática, inventário de dependências vendorizadas, observabilidade sem dados sensíveis, contratos RPC/API, Safari e aparelhos físicos. Não mesclar PRs conflitantes às cegas nem atualizar a plataforma nativa junto de uma correção visual.

O registro permite retomar o trabalho. Os workflows executam os passos definidos quando acionados; **não corrigem código sozinhos nem reiniciam esta conversa após o encerramento da sessão**.
