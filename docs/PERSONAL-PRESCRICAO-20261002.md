# Criação de treinos — revisão local de 02/10/2026

Série isolada em `codex/personal-treinos-20261002`, iniciada em
`49440858b2318885281d132b9d936f24dd23e701`. A referência publicada informada
na análise foi mt-v851 (`b05222a2852bd1e96d9a91804d3cd5bdd4f59d22`).
Durante o fechamento, a outra frente integrou o PR 863 (HQ mt-v852) na main.
Esta branch incorporou a main `e115092` sem conflitos e preservou as mudanças
de HQ e suas correções de fixture. Não houve escrita na branch de HQ.
Esta série do Personal continua em rascunho, sem merge na main ou publicação.

## Sequência implementada

1. **Gravações confiáveis.** Abrir um exercício do catálogo mantém somente um
   rascunho até Salvar. Cancelar/Esc não criam cópia; falhar ao gravar mantém os
   campos para nova tentativa. A confirmação detecta outra cópia criada em
   paralelo. Aplicar/salvar modelo respeita a recusa do armazenamento e não
   anuncia sucesso. Cópias pessoais legítimas são preservadas.
2. **Inclusão contínua.** No celular, o seletor permanece aberto até
   Concluir/Voltar. Busca, filtros e prescrição permanecem; só a seleção do
   exercício é limpa depois da inclusão, evitando repetição por duplo clique.
   A busca ignora acentos usando a normalização já existente.
3. **Troca com revisão.** Trocar exercício conserva posição, séries, carga,
   descanso, técnica e orientação. Vídeo próprio e alternativas do exercício
   anterior não são transferidos. O aviso pede revisar a adequação da carga.
   Desfazer verifica se a ficha ainda é a resultante da troca; não sobrescreve
   ajustes posteriores nem restaura referência removida da biblioteca.
4. **Entrada pelo aluno.** A tela prioriza aluno, montagem e revisão. Modelos
   e opções adicionais ficam acessíveis em detalhes. Os controles e a rota
   original de prévia/publicação são mantidos. Treinos de disparo continuam
   editáveis e orientam conferir destinatários na área Em grupo.
5. **Proposta de IA recuperável.** A proposta é guardada localmente, separada
   por conta, aluno e modalidade, fora da sincronização e do pacote do aluno.
   Retomar é explícito. É possível ajustar a prescrição na revisão antes de
   aplicar. Aplicar continua separado de publicar. Conflitos de treino,
   biblioteca, conta e revisão de outra aba bloqueiam a substituição antiga.

## Verificação e evidências

Todas as interações usam demonstração e alunos fictícios, em contextos novos
de navegador com chamadas externas não simuladas bloqueadas. Nenhum registro
real, banco remoto, credencial, permissão ou pagamento foi alterado.

Novas suítes de navegador:

- `tests/test-prescricao-confiabilidade.js`: cancelar/Esc, recarregar, quota,
  nova tentativa, cópia legítima, confirmação em duas abas e modelos com CAS.
- `tests/test-personal-seletor-troca.js`: inclusão contínua, teclado, acentos,
  troca, desfazer, falha de gravação, outro aluno e recarga.
- `tests/test-prescricao-entrada.js`: fluxo completo em 390/1280 px e nos temas
  claro/escuro, revisão de destinatário e diferenças, grupo e recarga.
- `tests/test-treino-rascunho-local.js`: recuperar/ajustar, quota, falha ao
  aplicar, conta/aluno, corrupção e concorrência entre abas.

Os testes antigos de catálogo e inclusão foram atualizados para executar o
novo comportamento solicitado. As verificações de gravação, filtros, séries
individuais, carga vazia/zero e cancelamento foram conservadas.

Resultado local com Playwright 1.63.0 do lock, Chrome 154 e Node 24.18 no Windows:

| Suíte | Resultado |
| --- | --- |
| Confiabilidade | 80 verificações aprovadas |
| Seletor e troca | 85 verificações aprovadas |
| Entrada guiada | 196 verificações aprovadas |
| Rascunho local | 56 verificações aprovadas |
| Experiência de treinos, após correção final | 139 verificações aprovadas |
| Adicionar séries | 41 verificações aprovadas |
| Prescrição por série | 77 verificações aprovadas |
| Sincronização CAS | 15 cenários aprovados |
| Sintaxe do app e Elite 5 | Aprovadas |

O servidor local usou a porta exclusiva 8797 e adaptador ignorado em
`tests/out/windows-qa/preload.cjs` para resolver os caminhos Linux históricos
do runner e bloquear tráfego externo não simulado. Os testes novos resolvem
Playwright local/CI e aceitam `BASE_URL` e `CHROMIUM_PATH`. A suíte Linux completa
do workflow, com Node 22, Chromium/WebKit e serviços descartáveis, é uma
verificação separada; estes resultados locais não a substituem.

Os PNGs abaixo são capturas reais da **prévia local**, não da produção:

- [Entrada no computador](evidencias/personal-prescricao-20261002/desktop.png)
- [Entrada no celular](evidencias/personal-prescricao-20261002/mobile.png)
- [Troca no celular](evidencias/personal-prescricao-20261002/troca-mobile.png)

## Antes de integrar

Conferir a nova base da main e os checks do head final, resolver eventual
concorrência com a frente HQ e só então preparar a versão/precache da release.
Nenhum número de versão de produção foi reservado por esta branch. Merge e
publicação dependem da aprovação pedida pelo usuário.

O rascunho de IA é local a este navegador/aparelho. Não é backup na nuvem.
Proposta gerada novamente para o mesmo contexto exige conferir a revisão;
uma proposta obsoleta não é aplicada automaticamente. Na musculação, os
ajustes anteriores à aplicação incluem a prescrição por série. Em circuito e
corrida, esta etapa permite nome e orientação; a edição estrutural continua
nos editores existentes após aplicar.
