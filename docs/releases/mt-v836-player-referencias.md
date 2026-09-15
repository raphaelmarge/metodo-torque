# mt-v836 — referências e confirmação no player

Segundo lote da sequência aprovada em 15/09/2026, preparado sobre `c4184b0fb41ec28956c1c4dfaf222738f1da9963` (mt-v835). Este documento não comprova publicação. A liberação do primeiro lote é independente e não deve ser confundida com a conclusão de todo o roteiro.

O player já tinha registro por série, salvamento de rascunho, retomada por aluno/token/data/assinatura da ficha, confirmação explícita e revisão. Este lote não cria um segundo player ou novos botões: mostra duas referências compactas, Prescrito e Anterior com carga, junto dos campos existentes. Carga anterior é uma anotação histórica, não recomendação de progressão. Ausência de carga não vira zero nem prova que a pessoa não treinou.

A linha de ajuda existente passa a identificar sugestão ainda não confirmada, preenchimento em rascunho, anotação salva com série pendente, série concluída e alteração ainda em rascunho. Ambos os campos referenciam essa informação para leitores de tela. Prescrição e histórico não mudam quando o aluno digita o resultado de hoje. Cores, hierarquia, marca, réguas, vídeo, descanso, retomada e confirmação existentes permanecem.

A consulta à carga anterior escolhe a data mais recente válida antes de hoje em vez do último item recebido, preservando o filtro da série e a compatibilidade de registros antigos. Rascunho, hoje, futuro, outra série e data inválida não viram referência anterior. Empate de data mantém o último registro. Não altera o conteúdo salvo, as regras de volume, a prescrição ou a sincronização.

Testes novos cobrem lógica, datas fora de ordem, falta de dados, zero, saída de texto, estados e interação no player canônico em 320/390/1280 px, temas claro/escuro, anotação, conclusão, alteração e retomada. Os testes existentes de player e séries continuam intactos. Demos regeneradas pelo builder canônico, preservando acesso direto e cadastro separado. A versão muda nos três pontos de cache.

Sem banco, SQL, credenciais, gateway ou dados reais. Supabase permanece no contrato existente. As etapas de Aluno 360°, publicação e comunicação seguem no roteiro; este lote não as apresenta como concluídas. Resultados efetivos, merge e Pages devem ser confirmados no PR e nos workflows do HEAD exato.
