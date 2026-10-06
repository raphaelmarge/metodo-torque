# Execução do relatório de prioridades — mt-v854

Base `fd215666`, relatório `Melhorias_prioritarias_TorqueOn_2026-10-06 (2).pdf`, cinco páginas. As alterações desta revisão não significam aprovação comercial do serviço nem homologação física de celulares. Esta nota descreve o candidato; o resultado dos checks e a implantação pertencem ao PR/release correspondente.

## Impede lançamento comercial

| Achado / impacto | Ação e evidência | Teste de aceitação / estado |
|---|---|---|
| Checkout SaaS indisponível: o profissional não consegue contratar a mensalidade | Responsável escolheu Pagar.me e cobrança após 14 dias em 06/10. Página explicita a regra; preparação valida plano, preço, trial e vínculos, separada da função que cobra alunos | **Pendente**: conta aprovada, endpoints/persistência SaaS e homologação real. Ver [Pagar.me](../personal/PAGARME-ATIVACAO-20261006.md). Não habilitar pagamento com base em testes de fixtures |
| Renovação/cancelamento/estorno não sustentam hoje um acesso SaaS confirmado | Preparação rejeita snapshot sem vínculo, valor/período coerentes ou pagamento após trial. Estado `active` não é prova de pagamento | **Pendente**: teste no provedor, eventos repetidos/invertidos, expiração e ledger atômico de acesso. Não há cobrança real nesta rodada |
| API legada Pagar.me consultava/cancelava por ID sem conferir dono do objeto | Handler verifica Auth, vínculo atual de dono, metadata canônica da mesma academia e produto. Revalida antes de cancelar. HTTP200 sem `canceled` da mesma assinatura não anuncia sucesso | Teste executa handler real com Auth/banco/gateway fictícios, duas academias, funcionário, vínculo revogado, rede e objeto sem metadata. **Correção implementada**, publicação depende dos checks |

Objetos antigos de cobrança sem academia na metadata exigem conciliação antes do acesso. Várias academias do mesmo dono exigem seleção explícita para criar; não se escolhe uma arbitrariamente. Isso preserva o isolamento e deve ser tratado na homologação da conta.

## Corrigir antes de ampliar o uso

| Achado / impacto | Correção implementada | Evidência e aceitação |
|---|---|---|
| Cadastro exigia decisões comerciais e podia enviar acesso implicitamente | Nome primeiro; dados e contrato opcionais. Montar treino é o próximo passo. Salvar, publicar e enviar são ações distintas | `test-personal-primeiro-uso.js`: nenhum convite/publicação ao informar e-mail; falha de armazenamento mantém formulário; comércio antigo preservado |
| Checklist concluía etapas sem comprovação suficiente | Mesmo aluno e prescrição; conteúdo real em uma das três modalidades; publicação confirmada; abertura só após app carregado | Popup bloqueado/fechado, loader, publicação falha, ficha vazia e revogação não completam etapas |
| Home, gavetas e calendário discordavam do dia | Rótulo Hoje calculado ao abrir/retornar, mesma programação por data e itens disponíveis | `test-aluno-prioridades-relatorio.js`: virada do dia, override por data e três modalidades |
| Iniciar de novo competia com retomar | Continuar sessão preservada é a ação principal; escolher/iniciar outra permanece disponível | Retomada de musculação/corrida/circuito e regressões dos players |
| Cliques/retries podiam duplicar agenda e resposta atrasada usar outra data | UI captura intenção e bloqueia envio simultâneo; RPC serializa pelo aluno e devolve pedido/confirmado existente. Recusado permite novo pedido | Duas conexões PostgreSQL, limite de dez pedidos, revogação concorrente, identidade distinta e resposta atrasada |
| Histórico da demo devolvia formato inválido; estados locais confundidos com envio | Demo explicitamente isolada em memória; local, pendente, envio, erro e sincronizado separados. Confirmação depende dos dois transportes | Demo sem chamada de histórico real; falha/recuperação e confirmação do histórico/retorno. Não demonstra falha em toda conta real |
| Armazenamento cheio podia manter o aviso de sincronização anterior | Falha ao salvar no aparelho tem estado próprio; uma resposta de rede não mascara a falha. A sessão anterior permanece preservada | Após sincronizar, simular armazenamento indisponível, receber confirmação remota e repetir gravação local com sucesso; o aviso só desaparece após recuperação local |
| Automações convertiam erro em zero ativo/fila vazia | Erro, indisponível, carregando, vazio e carregado têm estados distintos; retry e horário da consulta | `test-operacao-estados-browser.js`: erro/retry/resposta inválida e ausência legítima |
| HQ representava trial/dado ausente como zero | Prazo explícito quando existe; ausência e fontes não instrumentadas ficam indisponíveis. Consulta e checagem de integração não são o mesmo carimbo | SQL e métricas HQ: trial sem prazo, status desconhecido, fonte ausente e timestamp |
| Indicação ainda não acompanha contrato/pagamento real | Preservados catálogo/ledger opcionais e campanha desligada. Preparação usa desconto de um ciclo; revisados testes do core, store e SQL | **Pendente**: atribuição no servidor integrada ao checkout, homologação/refunds, janela/antifraude e repasse. Não criar parceiros reais nem prometer comissão paga |

## Melhorias posteriores tratadas nesta rodada

| Item | Ação / limite |
|---|---|
| GPS web | Aviso antes de começar: bloquear tela/trocar app pausa. Não equivale a GPS nativo contínuo |
| Loja | Ação informa pagamento, pedido por WhatsApp ou rascunho de chat conforme destino. Falha não muda silenciosamente para outro canal |
| Conquistas | Percentual identifica a faixa atual e seus limites; não foi presumido erro aritmético |
| Demo | Acesso claro ao teste do Personal, navegação com Alimentação preservada |
| Exportação HQ | Solicitação auditada antes do CSV, com filtros, hash, quantidade e ator. Recibo não comprova que o aparelho salvou o arquivo |
| Suporte legado | Ponte administrativa de leitura paginada implementada, com cursor e limite de 50 registros; sem marcar como lido, importar ou enviar mensagem. O painel distingue resposta armazenada de entrega externa |
| Grandes coleções HQ | **Pendente de escala**: substituir snapshot completo por agregados e páginas sem truncar indicadores. A ponte de suporte já deve nascer paginada. Não declarar teste de volume sem executá-lo |
| Indicadores do piloto | **Pendente**: instrumentar ativação, tempo até publicar, abandono por etapa, primeira sessão por modalidade e conversão; não há linha de base medida nesta entrega |

## Validação e limites

Testes usam dados fictícios e rede interceptada/bancos descartáveis. Cadastro e geometria do app do aluno foram conferidos em 320, 390, 768 e 1440 pixels, claro/escuro; o suporte legado foi conferido nas quatro larguras. Isso não representa homologação de todas as telas em todos os aparelhos. As três demos são regeneradas pelo builder canônico, sem manter cópia manual do aplicativo. Regressão completa e autorização HTTP com GoTrue/PostgREST devem aprovar o commit antes da integração.

**Não verificado**: jornada completa Personal → publicação → Aluno com sessões reais em ambiente isolado (os testes HTTP de Auth desta rodada cobrem o HQ), aparelhos físicos Android/iPhone, instalação PWA real, bateria e GPS em campo, piloto com cinco profissionais (meta quatro completarem primeiro treino sem ajuda), conta de pagamento e compras sandbox, entrega externa de suporte, carga representativa para dimensionamento. A marcação destes limites não altera os resultados dos testes automatizados.

Google Play, App Store, relógios e GPS nativo em segundo plano ficam fora desta etapa por decisão do responsável. A prévia privada Sites não participa da validação; domínio público principal continua `www.torqueon.com.br`.
