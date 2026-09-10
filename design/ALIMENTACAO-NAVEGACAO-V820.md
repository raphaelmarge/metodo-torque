# Alimentação do aluno — navegação por tarefa (v820)

Pedido: reorganizar a área longa/confusa mostrada pelo Raphael, preservando todas as funções do aluno.
Base: `9e181008f9f3c829ac06febbabad79cce2433363` (mt-v819).

## Mudanças de apresentação

- **Refeições**: plano vigente na data consultada, cartões separados, duas primeiras porções visíveis e demais alimentos/nutrientes sob demanda. Confirmar como planejado ou revisar conserva IDs, handlers e snapshots existentes.
- **Diário**: registros confirmados, edição, conversa, exclusão e repetição. Metas/valores e acompanhamento semanal permanecem aqui, secundários. Estado vazio não equivale a não ter comido.
- **Planejar**: receitas e lista de compras com período próprio. Constância/XP existentes ficam em uma seção secundária; nenhuma pontuação ou meta nova.
- Um botão **Registrar refeição** no cabeçalho. Salvar uma revisão abre o Diário; a confirmação direta permanece em Refeições. Trocar abas não elimina nem esconde um editor aberto.
- Calendário compartilhado entre Refeições e Diário, com retorno para Hoje em datas anteriores. Não exibir esse calendário em Planejar para não confundir com o período das compras.
- Tablist, tab, tabpanel, aria-selected, aria-controls e foco com setas/Home/End. Painéis inativos usam hidden. Referência: W3C APG Tabs Pattern.

## Limites do escopo

Somente markup/renderização/navegação em `runtimeNutricao`, estilo final escopado a `#nutriAluno.ntp-v820`, testes, documentação, demos regeneradas e os três arquivos de versão/cache. Nenhuma alteração no core nutricional, regras de persistência, snapshots, foto/IA, publicação do Personal, fluxo de treinos, sincronização CAS, tabelas, RPCs ou RLS.

Supabase foi consultado apenas para assinaturas das quatro RPCs nutricionais existentes: estado, salva, feedback_lista e feedback_envia. Nenhum registro real foi lido ou escrito.

## Verificação

`test-nutricao-navegacao.js` usa o builder real, o plano demonstrativo existente, armazenamento em memória e rede bloqueada. Cobre abas, teclado, porções visíveis, estados vazios/pausados, registros idempotentes, rascunho, calendário, compras, ausência de alteração em treinos/hábitos, temas e larguras de 320 a 1280px.

As suítes `test-nutricao-aluno-completa` e `test-nutricao-integrada` mantêm suas verificações de dados; seus passos agora abrem explicitamente a aba que contém a ação. Regenerar as três demos por `node tools/demo-aluno/regen-demos.js`.

Testes em Chromium não substituem conferência em Safari/iPhone físico. Publicar somente depois de rever o diff e os checks do head final; a implementação em branch/PR não confirma deploy.
