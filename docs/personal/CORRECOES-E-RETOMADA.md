# Torque Personal — correções e retomada

Registro iniciado em 11/09/2026. Fila canônica: issue #826.
Base inspecionada: `4d4e91be7fb16af905f933096d26d4445d8b8adc`.
O artefato local usado para testes veio do Pages no pai `355f69049fa65baa2cf5225450534aae7101fb3b`; o commit posterior contém apenas o briefing gerado. A branch preserva esse briefing pela árvore-base da main.

## Lote 1 — rascunhos e publicação segura

Implementado na branch, **não significa publicado**:

- A camada visual recupera nome e perguntas selecionadas por ID quando o handler canônico não persiste o questionário. Não declara sucesso só porque já existe um modelo com o mesmo nome. A nova tentativa é explícita, sem duplicação, sem gravações paralelas ou alteração do CAS.
- Testes de falha de storage reproduziram a perda de rascunho antes da correção e passaram depois. A fixture chama o mesmo handler extraído de `personal.html`, com re-render na falha; não inicializa autenticação nem chama produção.
- `tests.yml` é o workflow canônico para PR e reuso. Na main, `pages.yml` chama esse workflow antes de publicar; `testes.yml` permanece como alias manual. Não há dois disparos gerais automáticos por push/PR.
- O empacotamento recusa alterações em arquivos versionados após os testes e checkout de outro SHA. Usa `git archive HEAD`, excluindo arquivos não versionados, dependências instaladas e saídas locais. O deploy usa esse artefato, sem novo checkout. `release-info.json` identifica commit e versão; a conferência pós-deploy tem seis tentativas limitadas. Reexecuções de commits ultrapassados são recusadas antes de publicar.
- Evidências de teste ficam como artefatos por sete dias, inclusive quando há falha. Falhas não são ignoradas nem repetidas indefinidamente para obter verde.
- Playwright direto fixado em 1.63.0. **Aguardando incorporar o package-lock gerado pelo CI e trocar a instalação por `npm ci`.** Não afirmar reprodução completa enquanto essa etapa estiver pendente.
- Runtime proposto mt-v822 nos três marcadores de versão. Reconciliar com a main antes de integrar; não reduzir uma versão mais nova.

## Evidências locais

| Verificação | Resultado |
| --- | --- |
| `node tests/test-sync-cas.js` | 15 cenários aprovados; mocks e contratos SQL estáticos |
| `node tests/test-sync-identidade.js` | 13 cenários aprovados; mocks de identidade/reconexão |
| `node tests/test-sync-conflito-ui.js` | Aprovado; contrato da interface |
| `CHROMIUM_PATH=/usr/bin/chromium node tests/test-questionarios-usabilidade.js` | 43 verificações aprovadas, 13 adicionais; DOM offline |
| `node tests/test-release-workflow.js` | 19 verificações; contratos estáticos + Git temporário real |
| `node tests/test-versao.js` | 17 verificações aprovadas |
| Sintaxe | JavaScript, Bash e parse YAML local aprovados |

O navegador local é Chromium com o driver Playwright disponível no ambiente, diferente da versão proposta no CI. Portanto, os resultados locais **não substituem** a execução remota do commit final. Não houve teste em dispositivo físico nem validação de produção. A suíte completa deve passar no PR antes da integração.

## Fluxo de trabalho

`reproduzir → corrigir → testar regressão → revisar diff e SHA → suíte completa → integrar → confirmar artefato publicado → registrar conclusão`

Para cada item da issue #826, manter estado separado: identificado, reproduzido, corrigido na branch, validado no CI, publicado, validado no ambiente real. Não marcar como concluído por estar em um patch ou por haver apenas um PR aberto.

## Próxima retomada

1. Ler esta página, a issue #826 e a discussão do PR. Consultar novamente o HEAD da main e do PR; não usar hashes históricos como se fossem atuais.
2. Confrontar os arquivos alterados com a main, preservando entregas concorrentes. Não mesclar #807/#823 cegamente; conferir também a sobreposição #822/#825.
3. Obter o lockfile das evidências do CI, revisar versões e integridades, versionar e substituir a instalação transitória por `npm ci`. Reexecutar os checks no novo SHA.
4. Executar as suítes da tabela e `bash tests/run.sh` com os pré-requisitos do workflow. Investigar falhas reais; repetir apenas falha transitória identificada, registrando a razão.
5. Verificar configuração administrativa antes de declarar o deploy integralmente protegido. Só integrar o SHA efetivamente revisado e aprovado. Confirmar Pages e `release-info.json`.
6. Próximo lote P0: reconciliar #806/#807 com a RPC `dados_cas` já presente no código vigente; verificar definições e permissões do banco e concorrência real em ambiente controlado. Os testes simulados aprovados não encerram essa etapa.

## Bloqueios e itens que permanecem abertos

A main consultada está sem proteção. A conexão não oferece escrita de branch protection nem da fonte de Pages. Um administrador deve configurar checks obrigatórios e fonte **GitHub Actions**, eliminando o publicador paralelo mencionado no workflow antigo. A mudança do YAML não impede outro publicador habilitado administrativamente.

Este lote não altera RLS, migrações, alunos, cobranças, prescrições ou históricos. Não atualiza Capacitor, não faz auditoria completa de dependências vendorizadas e não encerra os PRs funcionais. Cobertura, análise estática, matriz móvel e contratos RPC/API permanecem na issue #826.

O registro é um ponto de retomada, não um agente autônomo. Os workflows executam passos definidos quando acionados; não reiniciam esta conversa nem corrigem código sozinhos após o encerramento da sessão.
