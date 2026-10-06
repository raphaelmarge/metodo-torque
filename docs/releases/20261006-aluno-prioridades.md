# Aluno — prioridades do relatório de 6 de outubro

Base revisada: `fd215666`, após a publicação mt-v853. Esta entrega trata a experiência web; não comprova homologação em celular físico ou GPS em segundo plano.

## Comportamento corrigido

- A indicação de **Hoje** era gravada no HTML das gavetas no dia da geração, enquanto a Home e o calendário usavam o dia de abertura. Os três tipos de treino agora consultam a mesma programação por data, com precedência sobre a semana e filtro dos itens disponíveis. A volta ao app recalcula os rótulos.
- Sessões preservadas de musculação, corrida e circuito oferecem **Continuar** no início. Consultar outro treino é secundário e não inicia uma execução. Uma nova execução de ficha mantém seu botão próprio e seu histórico, com apresentação secundária.
- Pedido de horário bloqueia cliques simultâneos, captura dia/hora/observação antes do envio e não troca a data de uma resposta atrasada. Reconhece pedido existente e o retorno idempotente `{ok,id,duplicado,status}` do servidor. O servidor continua responsável por impedir duplicação entre aparelhos.
- Estado local, aguardando conexão/envio, envio em andamento, erro e confirmação dos dois transportes são distintos. A confirmação do retorno legado não mascara falha do histórico de sessões.
- A demonstração declara seu armazenamento em memória, não ativa o transporte do histórico nem a fila de retorno do aluno e não simula cobrança ou envio de mensagem na loja. A falsa resposta inválida do histórico vinha da resposta genérica do simulador, não comprova falha em conta real. Há entrada explícita para testar o Personal.
- O limite da corrida web aparece antes de iniciar e está associado ao botão. Bloquear a tela ou trocar de app continua pausando a atividade.
- Loja informa **Ir ao pagamento**, **Pedir pelo WhatsApp** ou **Pedir pelo chat** conforme a configuração. Falha no checkout não abre outra ação silenciosamente. Pedido pelo chat prepara um rascunho para revisão; não envia automaticamente.
- Medalhas mostram o percentual e os limites da faixa atual. O cálculo existente e seus registros permanecem intactos.

## Verificação isolada

`tests/test-aluno-prioridades-relatorio.js` cobre programação por data e mudança de dia, pedido duplicado e resposta atrasada, simulação sem rede real, falha/recuperação dos transportes, destino da loja e retomada de circuito/corrida. As respostas HTTP e a geolocalização são sintéticas.

Regressões executadas: Início, clareza de execução, acompanhamento, calendário/alimentação, retomada de corrida e circuito, histórico dos três players, transporte, concessão de escrita, bundle offline e medalhas. Geometria local conferida em 320, 390, 768 e 1440 pixels nos dois temas. Nenhuma conta, mensagem, compra ou localização real foi usada.

As três demos devem ser regeneradas pelo gerador canônico na integração antes de rodar a validação completa e publicar. O banco e a publicação são etapas separadas, conduzidas pela release integrada.
