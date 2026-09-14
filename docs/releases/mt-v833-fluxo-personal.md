# mt-v833 — fluxo diário integrado do Torque Personal

## Objetivo

Transformar o Personal em um fluxo de trabalho diário sem recriar a Central Pro. A versão mantém as 18 áreas existentes e acrescenta uma camada aditiva dentro do Início e da ficha do aluno.

## O que entra

- **Próxima melhor ação** no Início, calculada a partir dos dados já existentes: relato recente para revisão, sessão do dia, aluno sem treino, prescrição antiga, queda de frequência ou reavaliação atrasada.
- **Aluno 360°** dentro do Resumo da ficha, com frequência das últimas oito semanas, treino atual, última sessão, avaliação, linha do tempo e sinais de acompanhamento.
- **Modo presencial integrado**, escolhendo o aluno pelo nome, registrando exercício, repetições, carga e percepção de esforço. Se houver sessão do dia na agenda, ela é marcada como feita ao finalizar.
- **Fila offline do atendimento presencial**: rascunho e sessão concluída permanecem no aparelho e são enviados para `personal_sessoes` quando a conexão volta.
- **Busca universal** no campo já existente: além de alunos, telas e comandos, encontra exercícios, questionários e fichas de treino.
- **Prescrição rápida** pelo Aluno 360°: acesso direto ao editor da ficha, IA do treino e semana do aluno, preservando os editores e validações existentes.
- **Automações integradas ao dashboard**, sem tela paralela. O painel usa `personal_automacoes` e `personal_automacao_fila`, permite ativar três automações recomendadas e concluir providências.
- **Dados do app no Aluno 360°**, quando a nuvem está conectada, usando `app_treino_log`, `app_quest` e `app_agenda`. Nenhum ID técnico é exibido na rotina.
- **Versão mt-v833** nos dois service workers e em `assets/versao.js`, com os novos arquivos adicionados ao precache da raiz.

## Supabase

Não há alteração de schema nesta versão. As tabelas e políticas usadas já existem em produção e foram conferidas antes da implementação:

- `personal_sessoes`
- `personal_automacoes`
- `personal_automacao_fila`
- `app_treino_log`
- `app_quest`
- `app_agenda`

As tabelas `personal_*` usadas pelo fluxo possuem RLS por academia. Nenhum cadastro de produção foi lido ou alterado para preparar esta release.

## Segurança e preservação

- O novo módulo não usa `localStorage.clear()` e não remove fotos, fichas, avaliações ou histórico.
- A sessão presencial offline usa chaves locais separadas (`ptflow:*`), sem substituir `ptStudio`.
- Ao concluir uma sessão, somente a sessão local de agenda correspondente ao mesmo aluno e ao dia atual é marcada como feita.
- A IA continua sendo proposta revisável pelo profissional; a camada de fluxo apenas encaminha ao gerador já existente.
- A Central Pro continua ausente do menu e não é carregada novamente.

## Aceite

Antes da publicação, validar no HEAD exato:

1. suíte completa do repositório;
2. dashboard em desktop e 390/320 px;
3. busca universal por exercício;
4. abertura do Aluno 360°;
5. atendimento presencial sem rede e posterior sincronização;
6. automações com conta conectada;
7. ausência da Central Pro;
8. versão `mt-v833` nos três pontos de cache.
