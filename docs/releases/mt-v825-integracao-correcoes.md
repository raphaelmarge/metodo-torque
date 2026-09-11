# mt-v825 — salvamento, alimentação e calendários

Base: `a0071b672a9e23e618c0f860d276263999088f9c`, com runtime v824
`f6de05b4409bb0c681f3bfbb703137597046803f`. As mudanças preservam as entregas
postural, planejamento por data, corrida estruturada, rascunhos e revisão estável
dos registros alimentares.

## Integração funcional

O calendário do PR #822 é a única implementação de refeições programadas.
Home, Agenda e Evolução distinguem treino/sessão e alimentação, ordenam o dia
por horário e abrem a refeição na data correta. Vigência, dias da semana,
refeições vazias e modalidades continuam respeitados. O profissional pode
selecionar todos os dias, dias úteis ou fim de semana e ordenar os horários.
Serviços confirmados, incluindo avaliações, conservam o indicador do dia nas
três visões, mesmo quando não há treino ou refeição programados.

Do PR #825 foram aproveitadas somente a apresentação e as interações de
alimentação: busca por refeição/alimento, filtros, destaque da próxima refeição,
foto, repetição, receitas e compras. Não foi instalado um segundo calendário.
Um atalho por data limpa filtros antes de focar a refeição. Datas futuras
mostram programação, sem confirmar consumo antecipado. Navegar, consultar ou
adicionar uma foto para revisão não cria registro nem XP. Rascunhos permanecem.

## Gravação

As proteções úteis do PR #807 foram adaptadas aos módulos da academia. O
retorno de `MTStore.write` determina sucesso, fechamento de formulário e
limpeza dos campos. Falhas conservam o preenchimento para tentar novamente.
Operações em várias chaves distinguem persistência parcial e não devem
duplicar créditos na retentativa. Opções do filtro de contas usam elementos DOM
e texto, sem interpretar nomes cadastrados como HTML.

Mensagens e cobranças já confirmadas mantêm seu resultado para a retentativa
da gravação local. Os trabalhos automáticos de resumo diário, semanal e Pix
compartilham uma fila por conta, revalidada antes de executar. Pedidos do app
preservam o identificador da venda para não repetir a baixa de estoque quando
a confirmação remota falha.

Não há migração, alteração de registros reais ou substituição do motor de
sincronização. O protocolo antigo com `base_atualizado` não foi reintroduzido.

## Oferta nativa

O texto da oferta, teste correspondente e guia passam de R$ 59,90 para R$ 49
por mês, como a oferta web existente. Este commit não altera a cobrança nas
lojas nem no RevenueCat; a configuração externa precisa ser conferida antes
de distribuir uma nova versão nativa.

## Verificação

- Cenários de alimentação, calendário, edição, filtros, rascunhos e regressões
  de Evolução usam o builder e os módulos reais com dados sintéticos.
- Falha de gravação é simulada para verificar persistência, formulário,
  mensagens e retentativas.
- A suíte PostgreSQL cria um banco local exclusivo e usa duas conexões reais.
  Lê funções, políticas e gatilhos do SQL canônico; observa os locks no
  servidor e cobre concorrência, rollback, publicação, clientes antigos e RLS.
  O CI fornece PostgreSQL 17.11 e instala `pg` pelo lock revisado.
- Os três demos são derivados pelo gerador canônico; versão e caches usam
  mt-v825. A publicação depende da suíte completa do mesmo artefato.

Validação local inicial em 11/09/2026: as 85 suítes passaram, combinando o
lote geral, a suíte principal (1.959 verificações), a suíte de efeitos externos
(30 verificações) e as reexecuções direcionadas após correções nos testes de
infraestrutura e normalização de finais de linha. A validação SQL teve 47
verificações em PostgreSQL 17.11. A interface de início e alimentação foi
conferida em viewport móvel, sem transbordamento horizontal ou erros JavaScript.
As correções da revisão cruzada acrescentam cenários de automações simultâneas,
serviços confirmados no calendário e geometria dos dias em tela de 320 px.
As suítes afetadas são reexecutadas e a publicação exige uma nova rodada completa
no CI do commit final.

Esses testes não representam homologação de cadastros reais, do backend
instalado em produção, da câmera em aparelhos físicos ou do Safari/iPhone.
Não limpar armazenamento dos usuários para atualizar ou resolver conflitos.
