# Retomada da issue #826 — 11/09/2026

## Publicação e base

O Pages do PR #827, commit `834381d571662685dc1cd2c997f96c9073b5dd66` (mt-v822), terminou com testes, deploy e conferência do commit servido aprovados no run `34590613476`.

A main avançou para `f19c1ddc5519f71aaa0d9835aa803a9c97547359`, com runtime mt-v823 do commit `fd928828631b205e1eb9325c95b3fcab4e393999`. Preservar essa evolução; não repor arquivos da v822 nem integrar o PR #807 antigo às cegas.

O run de Pages `34594916321` da v823 encerrou com 76 suítes, duas falhas, empacotamento e deploy pulados. Evidência: artefato `10261483334`, SHA-256 do ZIP conferido `02f52eb80443bd0d224b289987bedfad2a6caad12e01a1fdebf7855dc4a5d808`. O briefing gerado não comprova publicação. O publicador paralelo `34594915231` estava cancelado.

## Causa e mudança proposta

As duas falhas são verificações estáticas que ficaram presas à grafia antiga:

- `test-infra.js` exigia espaços literais em `p_dia < public.hoje_br()`. A RPC vigente usa a mesma comparação sem esses espaços. A régua passa a aceitar apenas espaços opcionais, conservando operador e função.
- `test-personal.js` exigia `plnDia(d)`, mas a agenda por data acrescentou o parâmetro `iso`. A régua aceita as duas assinaturas conhecidas sem remover a verificação da gaveta e da ausência do cartão duplicado.

`test-agenda-contratos.js` acrescenta casos negativos das réguas e exercita o leitor realmente gerado pelo builder, incluindo semana, data específica, descanso explícito, fallback, formato legado e propriedade herdada. Não é homologação de browser físico ou do banco.

Nenhum arquivo de runtime, preço, cache, migração, pacote ou dado de aluno é alterado neste lote. Continua mt-v823; a próxima suíte completa do SHA final é obrigatória antes da liberação.

## Supabase consultado diretamente

No projeto `metodo-torque`, a leitura de metadados funcionou nesta retomada. `dados_cas`, `dados_grava`, `app_aluno_publica_cas` e seus gatilhos estão instalados. As três RPCs são SECURITY INVOKER, não concedem EXECUTE a anon e concedem a authenticated; os helpers de gatilho não concedem EXECUTE aos dois papéis. Os gatilhos de proteção e histórico estão habilitados; dados, app_aluno, históricos e membros têm RLS ligada. Isso não comprova todos os cenários de isolamento, nem fecha #806/#807.

O histórico registra `sync_cas_atomic_v807`, `fix_sync_rpc_conflict_target` e `agenda_modalidade_v823`. Não reaplicar a migração antiga do PR #807: ela propõe um desenho com base_atualizado, coluna ausente do banco atual, que utiliza RPCs. A migração de modalidade já está registrada; conferir o corpo instalado antes de decidir qualquer alteração.

Nenhuma escrita em produção foi executada. Permanecem a homologação de duas sessões reais, RLS completa, Safari/aparelhos e a proteção administrativa de main/Pages. O SQL de conferência usa apenas metadados e transação read-only.

## Preparação controlada

Uma execução única na branch `work/826-preparar-agenda-v823` prepara objetos Git após conferir o SHA da base e os hashes integrais dos dois testes. Ela não atualiza main nem faz deploy. O commit resultante exclui o workflow temporário, inclui somente os cinco arquivos listados e deve ser associado a uma branch de correção e a um PR para CI/revisão. Não é um agente permanente nem um ciclo de reinício automático.
