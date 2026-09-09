# Nutrição completa — contrato de implementação v814

Evolução aditiva do módulo integrado ao Personal. Mantém `nutricaoV1`, `nutricaoApp`, os registros e suas RPCs. Nunca reutiliza `ntStudio` nem altera o retorno dos treinos.

## Plano e itens (core compartilhado)

Os campos v1 permanecem. Campos novos são opcionais, normalizados somente quando informados, para conservar snapshots antigos.

- Plano: `metas: {k,pt,cb,g}` (números não negativos ou null quando não definida), `avaliacao: {alergias,restricoes,preferencias,evita,rotina,orcamento,preparo}` (textos), `inicio`, `fim` (ISO date ou vazio), `versao` (inteiro >=1).
- Refeição: `dias: [0..6]`, domingo=0; ausente/vazio significa todos os dias. `receitaId` opcional.
- Item: `baseGramas` opcional positiva; `medidas:[{nome,gramas}]`; `fonte`, `preparo`, `receitaId`; `substituicoes:[item]` sem recursão, cada alternativa com quantidade já revisada. A quantidade sempre multiplica a porção base; conversão só com peso conhecido, nunca inferir a densidade de ml.
- Plano entregue: `catalogo:[item]` (biblioteca disponível ao aluno, sem dados de outras pessoas) e `receitas:[{id,nome,categoria,tempo,rendimento,ingredientes:[texto],modo:[texto],itens:[item],fonte}]`. Nutrientes desconhecidos não são inventados. Receitas legadas podem ser lidas; prescrição só quando itens completos forem definidos.
- Core disponibiliza: `refeicoesDia(plano,isoDate)`, `totalPlano(plano,isoDate)`, `normalizaReceita`, `listaCompras(plano,inicio,dias)` (linhas `{nome,porcao,qtd,baseGramas,gramas}`), além das funções existentes.
- Estado do Personal: manter `planos/favoritos/alimentos`; acrescentar `historico` por aluno (snapshots anteriores), `modelos`, `receitas`. Histórico sem catálogo duplicado. Publicação entrega apenas o aluno selecionado.
- Rascunhos do Personal salvos em chave local isolada por conta/academia e aluno. Fotos e retornos continuam fora de ptStudio.

## Comentários vinculados à refeição

Dados separados dos registros, para o aluno não poder forjar a autoria do profissional.

- `app_nutricao_feedback_lista(t text, p_registro text)` → `{ok:true,feedback:[{id,registroId,autor,nome,texto,revisado,registroVersao,criadoEm}]}`.
- `app_nutricao_feedback_envia(t text,p_registro text,p_texto text,p_id text,p_origem text default 'aluno',p_revisado boolean default false,p_registro_versao text default null)` → mesmo formato. Revisão exige `p_registro_versao` igual ao `atualizadoEm` que o profissional viu; comentários comuns não exigem esse argumento.
- Aluno: token ativo; profissional: JWT + vínculo com a academia do token. `p_origem` não concede autorização. Só profissional pode marcar revisado; vincular revisão à versão do registro. `p_id` garante idempotência. Texto até 2000 caracteres, nome vem do servidor. RLS/tabela fechada ao anon; acesso aluno só por RPC.
- Ler conversa sem criar registro, XP ou notificação. Erro mantém texto digitado. Nova edição de uma refeição não herda revisão de uma versão anterior.

## Interface

- Personal: todas as abas mantidas. Editor, metas, avaliação, IA dirigida (plano inteiro ou uma refeição), modelos e versões em Plano; receitas e catálogo em Biblioteca; resumo semanal, filtros e comentários em Registros.
- Aluno: Alimentação oferece registro direto confirmado pelo clique, ajuste, troca aprovada, catálogo, repetir recentes, receitas, lista de compras e conversa. Campos técnicos ficam secundários. Não registrar automaticamente ao abrir, tirar foto ou receber resposta de IA.
- Gamificação: manter XP existente e somar missões por dias registrados/organização; nenhum prêmio por déficit, baixo peso ou comer menos. Não duplicar pontos ao editar.
- Aparência Torque One preservada, claro/escuro, fotos e navegação intactos. Demos usam exemplos e mocks, sem IA, cobrança ou mensagens reais.
