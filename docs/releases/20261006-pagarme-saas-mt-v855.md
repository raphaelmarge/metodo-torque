# Complemento da revisão — mt-v855

O profissional passa a ter um fluxo autenticado de contratação e cancelamento, preparado para Pagar.me e desligado por padrão. R$49,90/mês, primeiro débito somente após os 14 dias completos, sem alterar as cobranças que o profissional faz de seus alunos. Publicação e homologação financeira são etapas distintas; a conta do lojista ainda não foi configurada.

## Problemas corrigidos

| Problema | Comportamento implementado | Aceitação |
|---|---|---|
| Botão sem contratação autenticada | Consulta disponibilidade, dono e conta, pede consentimento e tokeniza diretamente no provedor | Visitante, conta alheia, gate desligado e preço adulterado não contratam |
| Timeout pode levar a outra assinatura | Tentativa reservada atomicamente e recuperada por código; UI mantém apenas UUID | Resposta perdida não repete o POST financeiro; rejeição certificada anterior à reserva permite nova tentativa explícita |
| `active` confundido com pagamento | Fatura e cobrança canônicas, valor, captura, período e vínculos conferidos | Status sem pagamento não concede prazo; repetição/ordem invertida não amplia acesso |
| Cancelamento anunciado cedo ou sem recuperação | Confirmação do mesmo contrato e opção explícita de tentar novamente | Falha/HTTP202 permanece pendente; desligar novas vendas não impede cancelamento |
| Renovação recusada escondida pelo período anterior pago | Aviso de recusa e prazo já pago visíveis juntos, com orientação para o suporte existente | Falha não aparece como pagamento confirmado, não reativa contrato cancelado e não dispara nova contratação |
| Exclusão pode deixar cobrança órfã | Dados da conta são excluídos e referência financeira mínima mantém a tarefa de cancelamento | Exclusão durante POST recupera e cancela a mesma assinatura; não cria outra e não impede excluir dados |
| Vencimento apenas na interface | Vigência no servidor e proteção da ficha/publicação; preserva leitura e revogação | API direta, RPC e fallback recusam escrita abrangida após expiração; benefício/admin bloqueado mantém sua política |
| Conta de outro produto recebe preço Personal | Tipo protegido `saas_clientes`; cadastro Personal atômico antes do primeiro aluno | Academia/Nutri/não classificada não iniciam contrato Personal; assinatura já vinculada continua cancelável |
| Reversão pode apagar cobrança | Procedimento anterior à ativação recusa qualquer ledger financeiro | Com ledger vazio restaura exatamente a RPC anterior e permissões; conta/evento presentes impedem remoção |

## Evidência local antes do CI

- 47 verificações de integração em PostgreSQL descartável, com transportes Auth/Pagar.me simulados.
- Revisão independente: 37 grupos em PostgreSQL e PGlite, 16 grupos de handler com SQL canônico e transporte simulado.
- Navegador: 30 grupos de checkout, quatro larguras (320/390/768/1440), teclado, sessão, armazenamento, cancelamento, recusa na renovação e tokenização; 12 grupos de cadastro tipado e regressões de oferta/cadastro.
- Reversão: três grupos que verificam restauração e recusa com registros financeiros.

O harness no CI executa os contratos de autorização com GoTrue/PostgREST reais. Seu resultado, a regressão completa e o commit implantado devem constar no PR/registro da publicação. Os números locais não significam que a conta Pagar.me foi homologada.

## Implantação e limites

Aplicar o [pacote SQL na ordem documentada](../../supabase/releases/personal-billing-optional/README.md), publicar as três funções com autorização própria e confirmar as fontes remotas. A migração de cadastro deve existir antes de publicar `modulo-conta.js`. Gates financeiros continuam desligados e nenhuma credencial/conta/plano real é criado por esta release. O frontend usa cache mt-v855.

**Ainda impede ativação comercial:** conta aprovada, credenciais de teste, prova das datas/valores, tokenização, recusa/renovação/estorno/cancelamento/exclusão no provedor, autenticação efetiva do webhook e reconciliador agendado/monitorado. A contratação posterior a um contrato já cancelado exige fluxo explícito de substituição. Contas antigas sem tipo precisam de classificação no HQ, sem inferir autorização por dados editáveis.

**Antes de ampliar:** fechar as operações fora do núcleo listadas no [inventário](../personal/PAGARME-COBERTURA-ACESSO-20261006.md), programa de indicação/repasse, retenção operacional de referências financeiras, jornada completa com sessões reais, piloto e aparelhos físicos. Nenhuma cobrança ou mensagem a clientes ocorreu nos testes. As pendências de escala, métricas, suporte e GPS físico do [relatório anterior](20261006-revisao-relatorio.md) não são declaradas resolvidas por esta integração. Lojas continuam fora do escopo.
