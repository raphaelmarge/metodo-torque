# mt-v838 — conclusão do player e contrato de testes

Mantém o template aprovado: carga, repetições e RPE opcional; prescrição e histórico separados; confirmação explícita e tabela de séries.

Corrige o rodapé de revisão que escondia **Terminar treino** após a última série. Preserva o recibo final e o botão de fechamento destacado. As suítes legadas passam a navegar pelas abas e abrir o registro pela série selecionada, sem cliques forçados ou alteração artificial do estado. Descanso e carga ausente são verificados nos campos corretos da prescrição.

Sem migração SQL, alteração de autenticação, políticas, tabelas ou dados reais. Os testes usam fixtures sintéticas e nuvem interceptada. A publicação continua condicionada à suíte completa e à confirmação do commit servido pelo GitHub Pages.
