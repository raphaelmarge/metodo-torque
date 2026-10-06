# Recibos de treino, controles do circuito e orientação de convite — mt-v857

Após concluir musculação, corrida ou circuito, o recibo podia continuar mostrando “aguardando envio” enquanto o indicador geral já confirmava a sincronização. A jornada com Auth/PostgREST reais descartáveis reproduziu isso nas três modalidades sobre `c7c74c9`: [execução 37509311215](https://github.com/raphaelmarge/metodo-torque/actions/runs/37509311215), 90 grupos de autenticação/API e 15 grupos de navegador aprovados, sem perda de registros.

O recibo passa a acompanhar o mesmo estado calculado pelo app. A correção preserva a exigência de confirmação dos dois transportes, falhas de gravação local, modo demonstrativo e diferenças entre registro pendente e sincronizado. Ela atualiza somente o texto dedicado ao envio: o placar do circuito, o aviso de trajeto interrompido e a mensagem de musculação sem séries concluídas permanecem próprios de cada situação.

A entrada do aluno também passa a explicar que o convite chega quando o profissional envia o acesso, em coerência com o cadastro mínimo que não dispara convite automaticamente.

No circuito livre, a fileira dos quatro controles podia ultrapassar a tela e cortar o botão Zerar. O grupo passa a usar duas colunas no celular e quatro em telas maiores, preservando os botões e suas ações. No tema claro, os textos de +1 volta e Terminei usam cores legíveis já adotadas pelo app, sem alterar Iniciar ou o tema escuro. A regressão confere geometria, operação e contraste dos textos secundários sobre os fundos renderizados em 320, 390, 768 e 1440 pixels, nos dois temas.

## Aceitação

- Confirmar apenas um dos transportes não pode exibir sincronizado; confirmação dos dois atualiza indicador geral e recibo.
- Falha posterior ao recibo aparece como falha; confirmação remota não esconde falha local. Recuperação só muda a mensagem após os critérios existentes serem satisfeitos.
- Demonstração continua identificada como simulação. Textos de placar, trajeto e ausência de séries não são sobrescritos.
- A jornada real deve comparar indicador e recibo simultaneamente nas três modalidades, usando o novo commit e banco descartável. Corrida e circuito livres não comprovam a prescrição dessas modalidades pelo Personal ou GPS físico.

O teste novo reproduziu a divergência antes da correção. Testes finais, commit integrado e confirmação pública devem constar no PR e no registro da publicação. As três demos são regeneradas pelo gerador canônico; os dois service workers e `assets/versao.js` compartilham mt-v857. A atualização paralela da landing em mt-v856 foi incorporada integralmente por merge da `main`.

Sem alterações de banco, credenciais, preços, permissões ou ativação financeira. A cobrança permanece desligada, e as dependências comerciais registradas na revisão principal continuam abertas. Google Play e App Store permanecem fora desta etapa.
