# Torque Nutri: substituições e compras por período

Base revisada: `565f6edcda0748222f4b29289325daebfbd65d91` (main, mt-v865).
Branch: `codex/nutri-substituicoes-compras`. Entrega para revisão, sem merge ou deploy.

## Comportamento

- A nutricionista edita/remove cada alternativa no rascunho: nome, quantidade,
  medida e nutrientes por porção, com confirmação de revisão. Campos manuais
  desconhecidos permanecem. Alterar nome/medida remove somente os metadados de
  peso/medidas caseiras que deixariam de corresponder à porção editada.
- Formatação compartilhada de porções na revisão profissional, histórico,
  paciente e impressão/PDF. Uma porção incompleta permanece explicitamente
  desconhecida, sem preencher nutrientes ausentes ou inventar equivalências.
- Compras: intervalo inclusivo de 1–31 dias; conta cada ocorrência conforme os
  dias da refeição. Ausência de dias, ou lista vazia, mantém o comportamento
  legado de todos os dias. `startOn` restringe o início; `endOn` é data de
  revisão e gera aviso, sem transformar o plano em expirado. Os campos legados
  `inicio`, `fim` e `ativo` também são respeitados.
- Uma escolha prescrita por alimento/refeição vale para todo o período. Nunca
  soma principal e alternativa. Porções/preparos diferentes ficam separados;
  mesmo `100 g` e `0,1 kg` permanecem distintos nesta entrega conservadora.
- Escolhas ficam em memória nesta sessão e reiniciam na troca de contexto ou
  versão do plano. Não são registros de consumo, nem são sincronizadas com a
  nutricionista. Para comprar opções diferentes em datas diferentes, calcule
  períodos separados. O texto da interface informa esse comportamento.
- Receitas vinculadas têm aviso de conferência manual; ingredientes livres não
  são desmembrados automaticamente. Alimentos sem porção válida geram aviso e
  não entram no total quantificado. Não há conversão cru/cozido.
- Nenhuma alteração de banco, Auth, pagamentos, credenciais ou permissões.
  Histórico, restauração e publicação continuam nos fluxos existentes.
  Cache Nutri passa a v15 incluindo o novo módulo; versão global segue mt-v865
  enquanto a entrega estiver em revisão.

## Verificação local

Executados com Node 24.19.0, Playwright 1.63.0 e Chromium de sistema
151.0.7922.173. O download do navegador empacotado do Playwright recebeu 403;
foi usado o Chromium já instalado, sem alterar os arquivos de dependências.

| Comando/suíte | Resultado |
| --- | --- |
| `node tests/test-nutri-shopping.js` | 10 checks |
| `node tests/test-nutri-shopping-browser.js` | 10 checks |
| `node tests/test-nutri-prescription.js` | 6 checks |
| `node tests/test-nutri-prescription-browser.js` | 6 checks |
| `node tests/test-nutri-visual-workspace-browser.js` | 7 checks |
| `node tests/test-nutri-rotina-browser.js` | 18 checks |
| `node tests/test-nutri-consolidation-browser.js` | 7 checks |
| `node nutri/checks/platform-flows.cjs` | 9 checks |
| `node nutri/checks/patient-experience-phase1.mjs` | 11 checks |
| `node nutri/checks/assessment.mjs` | 16 checks |
| `node nutri/checks/auth-access.cjs` | 33 checks |
| `node nutri/checks/basepath-assets.cjs` | 18 checks |
| `node nutri/checks/plan-recipes.mjs` | 23 checks |
| `node nutri/checks/journal-model.mjs` | 15 checks |

Total: 189 checks nessas suítes, além de sintaxe JavaScript, `git diff --check`
e abertura da prévia HTML sem requisições de assets/backend. As suítes de
navegador usam servidor local na porta 8765 e `TORQUE_PLAYWRIGHT` apontando para
um adaptador local que seleciona `/usr/bin/chromium`.

A suíte nova verifica porções no conteúdo da janela de impressão (origem do
PDF), publicação exclusivamente na demonstração, preservação de dados manuais,
rascunho, remoção, isolamento entre pacientes, datas inválidas e layout de
320/390/768/1280 px. As suítes existentes também cobrem temas, teclado e texto
ampliado. Não foi executada a suíte global inteira, nem validada produção,
conta real, impressora física ou sincronização real.

## Prévia e reprodução

As imagens abaixo foram capturadas do código real com dados fictícios da suíte.

- [Editor de substituições](previews/nutri-compras/substituicoes.png)
- [Compras no celular](previews/nutri-compras/compras-mobile.png)

Para uma prévia navegável isolada:

```sh
python3 nutri/checks/build-preview.py --output /tmp/nutri-review
```

O HTML `torque-nutri-preview.html` inclui módulos, estilos e fontes, sem backend
ou service worker. Foi aberto no Chromium por uma resposta HTTP local em
memória, sem carregar outros recursos. A política do navegador deste ambiente
bloqueia navegação `file://`; um servidor local permite abri-lo.

Para explorar o app servido normalmente, use `python3 -m http.server 8765` e
acesse `/nutri/demo-nutricionista.html` ou `/nutri/demo-paciente.html`. Nenhuma
prévia foi publicada em produção.
