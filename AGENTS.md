# TORQUE ON — contexto do projeto e orientações para agentes

Este guia se aplica ao repositório `raphaelmarge/metodo-torque`. Complementa, sem substituir, `CLAUDE.md`, `DESIGN.md` e os contratos específicos de cada módulo. O pedido explícito do usuário define o escopo de cada tarefa; este documento não autoriza publicação, alteração de banco ou expansão de funcionalidades por conta própria.

Referência desta revisão: código da `main` em `48a0dd88c6bfea84f8bc99c9e4748f4c82d3f68e`, consultado em 10/09/2026, e metadados do esquema `public` do projeto Supabase `metodo-torque`, consultados na mesma data. Esta é uma referência histórica verificável, não uma declaração permanente de versão atual. Confirme o HEAD e o ambiente antes de cada trabalho.

## 1. Propósito da base de código

O repositório reúne a família TORQUE ON: portal e sistema de gestão da academia, módulo do personal, aplicativo do aluno, módulo do nutricionista, aplicativo do paciente, páginas de venda e demonstrações.

O README apresenta o produto como **TORQUE ON · Gestão de Academias de Alta Performance**. Dentro dos programas operacionais, destaca **Gestão de Alunos** como o coração do sistema: cadastro, planos, contratos, mensalidades, pagamentos e check-in conectados à operação comercial e financeira. Esta prioridade deve orientar trabalhos no portal e no sistema da academia.

Na frente **TORQUE PERSONAL**, o fluxo central é acompanhar alunos, organizar e prescrever fichas, publicar os dados de cada aluno e permitir a execução e o registro no aplicativo. Agenda, avaliações, questionários e a nutrição integrada participam desse acompanhamento. A nutrição integrada ao Personal não transforma esse aluno em um paciente do módulo TORQUE NUTRI: os contratos e estados dos dois produtos permanecem distintos.

A aplicação é servida como arquivos estáticos, com funcionamento local/offline e sincronização via Supabase conforme o recurso. Não há build de frontend exigido para servir a raiz. Não introduza uma migração de framework, serviços ou infraestrutura como efeito colateral de uma mudança visual. Não confunda este repositório com o site de venda de equipamentos Torque Fitness.

Fontes: `README.md`; seções de produtos, fonte única do aluno e nutrição integrada em `CLAUDE.md`; `app/aluno-builder.js`; `app/index.html`.

## 2. Leia antes de projetar ou implementar

1. Identifique o repositório, o commit, a rota, o produto e o público da tarefa. Não trate portal, Personal, aluno e Nutri como uma única tela genérica.
2. Leia o `README.md` para entender a proposta e a prioridade do produto. Depois consulte as decisões recentes e os contratos relevantes em `CLAUDE.md` e `design/`.
3. Leia o código executado na rota: entrada, lógica principal, estrutura de dados, componentes, estilos e ordem das camadas CSS. Não basta ler a documentação ou uma demonstração.
4. Quando houver acesso ao site, confira também a interface real e o estado publicado. Um arquivo na `main` não comprova sozinho que o mesmo commit já foi implantado. Registre quando não houver inspeção visual ou validação de produção.
5. Antes de implementar, resuma o conteúdo real disponível, a ação principal, os arquivos afetados e os fluxos que precisam permanecer intactos.

O README e o `DESIGN.md` contêm contexto histórico e não descrevem sozinhos todas as evoluções atuais. Em uma divergência, registre o problema e confronte documentação, código do commit em análise e ambiente publicado; não restaure silenciosamente uma regra antiga. Uma lista antiga de melhorias não comprova que um recurso ainda esteja pendente.

## 3. Arquivos críticos e responsabilidades

| Arquivo ou conjunto | Responsabilidade e cuidado principal |
| --- | --- |
| `README.md`, `CLAUDE.md`, `DESIGN.md` | Proposta do produto, decisões técnicas, histórico e referências visuais. Leia as seções pertinentes, não apenas o título. |
| `design/TORQUE-ONE.md` | Composição visual aplicada ao Personal e ao aluno; preservação da navegação e das funcionalidades. Confira decisões posteriores em `CLAUDE.md`, especialmente o topo do aluno. |
| `index.html`, `assets/app.js`, `assets/app.css`, `assets/content.js`, `apps/sistema.html`, `apps/*.html` | Portal, catálogo de materiais, shell e módulos operacionais da academia. |
| `personal.html` | Painel do personal e preparação/publicação dos dados do aluno. `dadosAppAluno` e `publicaPacotes` são referências importantes desse fluxo. |
| `app/aluno-builder.js` | Fonte única do código do app do aluno; `MT_APP_ALUNO.monta(D)`, normalização das séries e lógica de execução/registro. Não embutir dados particulares de alunos. |
| `app/aluno-skin.js` | Camada visual do aluno, incorporada pelo builder. Uma tarefa de aparência deve começar aqui, sem reescrever desnecessariamente a lógica do construtor. |
| `assets/personal-torque-one.css` | Camada visual final do Personal: tokens, temas, tipografia, controles e composição. Respeitar a marca personalizada. |
| `app/index.html`, `aluno-login.html` | Entrada, seleção do construtor, carregamento do pacote, recuperação de falhas e abertura do app. Preservar os caminhos antigos compatíveis. |
| `nutricao.html`, `app/nutri-builder.js`, `app/nutri-skin.js` | Produto Nutri e aplicativo do paciente. Não alterar seus contratos ao trabalhar apenas na apresentação do Personal. |
| `assets/nutricao-core.js`, `design/NUTRICAO-V814-CONTRATO.md` | Contratos e comportamento da nutrição integrada. Rascunho, revisão, aplicação e publicação são etapas distintas. |
| `personal-vendas.html`, `torqueon.html` | Páginas de venda: usar nomes, textos, recursos e condições comprovados na implementação/configuração correspondente. |
| `demo-aluno.html`, `tools/demo-aluno/regen-demo.js` | Demonstração e gerador canônico do aluno. Não manter um fork manual do app dentro da demo. Preservar as variantes existentes com e sem cadastro inicial. |
| `sw.js`, `app/app-sw.js`, `manifest.webmanifest`, `app/manifest.webmanifest` | Instalação, cache, atualização e abertura offline. Alterações de runtime precisam considerar o fluxo de versão/precache do projeto. |
| `.github/workflows/pages.yml`, `.github/workflows/tests.yml`, `tests/run.sh` | Publicação e execução de testes. Ler o workflow e os pré-requisitos antes de executar ou afirmar que uma verificação passou. |

## 4. Conteúdo real antes do layout

Use os nomes existentes: TORQUE ON, TORQUE PERSONAL e TORQUE NUTRI, respeitando a nomenclatura efetivamente usada na tela em análise. O nome da referência visual Torque One não autoriza renomear automaticamente o produto.

Extraia slogans e descrições do README e dos arquivos da rota. Extraia rótulos, valores, unidades, opções, estados e mensagens de erro do código, das configurações e dos contratos relevantes. Para scripts, leia a implementação e a ajuda existente; não invente uma CLI nem opções de comando.

Não crie estatísticas, preços, planos, depoimentos, nomes de clientes, integrações, resultados ou promessas para preencher a página. Não use números de demonstração como prova comercial. Valores comerciais citados em documentação histórica precisam ser confrontados com a fonte vigente antes de aparecerem na interface.

**Se o repositório não contém o conteúdo ou a funcionalidade, o design não os apresenta como existentes.** Dados demonstrativos já presentes no repositório continuam identificados como demonstração e isolados da produção. Preserve os estados vazios verdadeiros; ausência, carregamento e falha não são resultados iguais a zero.

Para cada novo bloco visual, registre a origem do texto/dado, a ação existente que ele aciona e o estado alternativo aplicável. Não transforme uma tabela do Supabase em tela pública só porque seus campos existem.

## 5. Identidade visual: herdar a implementação atual

O `DESIGN.md` registra a identidade histórica. No Personal, a camada `assets/personal-torque-one.css` já implementa a evolução Torque One. Estes são valores observados no commit de referência, não novos tokens propostos:

| Uso no Personal | Token / valor observado |
| --- | --- |
| Marca padrão | `--pt-roxo: #8c54f7`; `--pt-roxo-esc: #7540d4` |
| Fundo escuro | `--pt-fundo: #0c0d11` |
| Cards | `--pt-card: #14161c` |
| Controles | `--pt-caixa: #1e2029` |
| Bordas | `--pt-borda: #292c35` |
| Texto principal | `--pt-txt: #f3f3f6` |
| Texto de apoio | `--pt-txt-4: #989baa` |
| Lilás claro | `--pt-roxo-claro: #b994ff` |
| Estado positivo | `--pt-ok: #91e9b6` |
| Raio de card / controle | `--pt-r-card: 16px`; `--pt-r-caixa: 10px` |
| Tipografia | Archivo; títulos com pesos 600–700 e caixa mista |
| Campos | Fonte de 16px e altura mínima de 44px nas regras de controles dessa camada |

Há valores próprios para o tema claro. A marca escolhida pelo profissional continua prevalecendo sobre o padrão. Reutilize as variáveis efetivas do componente: não copie tokens `--pt-*` para o documento gerado do aluno supondo que existam nele. O builder recebe a paleta pelo objeto `D`; canvas usa a resolução de cor já existente no app.

Colete também espaçamentos, larguras, raios e padrões de componentes na rota real. `design/TORQUE-ONE.md` documenta sidebar de 234px no desktop, 200px no tablet, colapso de 66px e navegação móvel até 800px. Esses valores orientam a preservação da composição, mas não substituem a leitura da cascata CSS.

No aluno, preserve a evolução posterior registrada em v818: foto no topo de ponta a ponta no celular, saudação e controles sobrepostos com safe area, carrossel e ação principal existentes. Não restaure o cartão compacto apenas porque uma referência anterior o descreve. Confira também os estados sem foto e sem treino.

Numa mudança visual, mantenha IDs, listeners, permissões, navegação, temas, personalização, acessibilidade e dados. Preserve os 18 destinos e suas subabas do Personal, salvo alteração funcional explicitamente pedida. A simulação visual não limita a capacidade do produto real.

Fontes: `assets/personal-torque-one.css`; `design/TORQUE-ONE.md`; decisões v813/v816/v818 e contrato do builder em `CLAUDE.md`.

## 6. A forma do produto organiza a página

A hierarquia deve começar pela tarefa real, não por um modelo de landing page ou uma grade arbitrária de indicadores.

No portal e no sistema da academia, a Gestão de Alunos e sua relação com contratos, mensalidades e check-in recebem o peso principal indicado pelo README. No Personal, use o contexto do aluno e os fluxos de acompanhamento, edição e publicação. No aplicativo do aluno, a estrutura nativa é **ficha → exercício → série → registro**; a próxima ação dessa jornada deve orientar a composição, sem remover as demais áreas existentes.

A implementação de `normalizaSeries` aceita o detalhamento por série e formatos anteriores. `carga: null` significa carga não definida; descanso zero é válido. O registro de conclusão é distinto da simples anotação. A lógica de volume não fabrica séries realizadas a partir da repetição de um registro antigo. Preserve essas diferenças na interface e nos indicadores.

Na agenda, na linha do tempo e nos módulos comerciais, use a estrutura e os estados próprios do módulo realmente solicitado. Não aplique automaticamente a hierarquia do curso a uma página do Personal, nem copie um dashboard de academia para o aluno.

Estabeleça primeiro o peso da ação principal, depois o contexto necessário e, por último, as métricas que ajudam a decidir. Não oculte funcionalidades existentes para obter uma composição mais parecida com uma referência.

Fontes: `README.md`; `app/aluno-builder.js`, especialmente `normalizaSeries` e `runtimeSeries`; `design/TORQUE-ONE.md`.

## 7. Contratos de dados, Supabase e preservação

O código do aluno é compartilhado; o pacote guarda os dados próprios daquele aluno. O contrato documentado é `{html, dados, ver, stamp}`; desde v776, `html` permanece vazio no pacote novo para manter compatibilidade de leitura. `app/index.html` monta o aplicativo com o construtor correspondente, incluindo a distinção `dados.tipo === "nutri"`.

O carregador mantém uma cópia local e diferencia falha de rede, ausência do construtor e falha de código/pacote. **Uma falha de rede não autoriza apagar os dados locais.** Preserve a recuperação e os caminhos offline existentes; não prometa que recursos dependentes de servidor funcionam integralmente sem conexão.

Metadados observados no Supabase em 10/09/2026, sem leitura de registros de alunos:

| Estrutura | Contrato estrutural observado |
| --- | --- |
| `academias`, `membros` | Identidade da academia e vínculo de usuários; `membros` tem chave composta `(academia_id, user_id)`. |
| `dados` | Estado JSONB em `valor`, identificado por `(academia_id, chave)`, com `atualizado`. |
| `app_aluno` | Pacote JSONB em `dados`, retorno JSONB em `retorno`, identificação por `token`, vínculo `academia_id` e carimbo `atualizado`. |
| `app_quest`, `app_treino_log`, `app_agenda` | Estruturas de questionários, registros de treino e agenda vinculadas ao contexto do aluno/academia. `app_agenda.status` admite `pedido`, `confirmado` e `recusado`; os rótulos visuais devem seguir o mapeamento da interface existente. |
| `dados_hist`, `app_aluno_hist` | Estruturas de histórico existentes; não tratar histórico como dados descartáveis de demonstração. |
| `app_consultoria_aceites`, `app_nutricao_feedback` | Estruturas específicas de aceite e feedback, com versionamento/snapshots ou referência à versão do registro. Preservar os contratos específicos antes de editar esses fluxos. |

As tabelas acima estavam com RLS habilitada na consulta de metadados. Isso **não é uma auditoria das políticas nem uma garantia de isolamento correto**. Uma tarefa de autorização exige ler e testar as políticas, funções e permissões relevantes.

Não alterar esquema, RPCs, autenticação, cobrança, publicação de pacotes ou sincronização como parte incidental de um redesenho. Antes de trabalhar em gravação/merge, ler a implementação vigente e os testes de concorrência; a descrição histórica de sincronização do README não substitui esse exame. Nunca colocar credenciais privilegiadas, tokens reais ou dados particulares no frontend, nos exemplos ou nas demonstrações.

## 8. Objetivos e critérios de aceite

- Tornar a tarefa principal mais clara e reduzir atrito sem perder capacidades existentes. Nomear o fluxo e a evidência concreta que serão usados para avaliar a melhoria, sem inventar percentuais de resultado.
- Preservar dados, isolamento por academia/aluno, compatibilidade de pacotes, rascunhos, histórico e recuperação offline.
- Evoluir a identidade atual em vez de recomeçar o produto: cores personalizadas, temas, foto, navegação e comportamento móvel devem continuar funcionando.
- Manter demonstração e produto alinhados pelo gerador canônico, sem chamadas ou gravações reais de alunos nas demos/testes.
- Entregar a menor mudança coerente, com escopo e verificação explícitos. Não declarar produção validada com base apenas em inspeção estática ou testes simulados.

## 9. Executar e verificar

Para servir a raiz, conforme o README:

```bash
python3 -m http.server 8080
```

Para testes, siga os pré-requisitos reais de `.github/workflows/tests.yml` e os scripts do projeto. O workflow consultado usa Node 22, prepara Playwright/Chromium e executa:

```bash
npm ci --prefix tests/runtime --ignore-scripts --no-audit --no-fund
bash tests/run.sh
```

Esses dois comandos não substituem a preparação de Playwright/Chromium descrita no workflow. Para uma mudança visual, inclua as verificações relevantes de navegação, dados, temas, geometrias móveis, player e fluxos afetados. Não enfraqueça testes de funcionalidade ou isolamento para acomodar CSS incorreto.

O gerador canônico da demo do aluno é `node tools/demo-aluno/regen-demo.js`; confira seus pré-requisitos e a referência ao servidor na porta 8765 em `CLAUDE.md`. Regenerar é necessário quando a mudança afeta o código/skin usado pela demo, não por uma alteração apenas de documentação.

Antes de publicar uma mudança de runtime, confira o HEAD revisado, os checks daquele commit e o workflow de implantação, além da versão/precache pertinentes. Um commit apenas de documentação não requer alterar cache, pacote do aluno ou Supabase. Não mescle uma release nem aplique migrações sem autorização correspondente.

Na entrega, informe: arquivos alterados, comportamento preservado, verificações efetivamente realizadas, limitações e estado exato de branch/PR/publicação. Responda em português do Brasil e não confunda revisão de código, teste local, CI e validação de produção.
