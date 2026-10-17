# Lembretes Web Push do Torque Nutri

Release isolada do projeto Nutri `mmdsmpetwhcfiyubhaah`. Não aplicar no banco da academia/Personal. O código local foi implementado em 17/10/2026; banco, função, VAPID e cron não foram provisionados por esta implementação. A migração começa com `enabled=false` e não cria cron nem envia mensagens.

## Comportamento

- O paciente ativa no próprio aparelho em **Ajustes e dados → Lembretes no aparelho**, por ação explícita. Demonstrações não pedem permissão e não acessam APIs reais.
- Consultas: um lembrete com antecedência de 15/30/60/120 minutos ou 1 dia, para consultas com status `scheduled`. Remarcação muda a chave do evento. Cancelamento, conclusão, exclusão e perda do vínculo invalidam a entrega.
- Questionários: um aviso por versão/período ainda não respondido, na hora e fuso escolhidos. O período segue `submit_questionnaire` (dia em `America/Sao_Paulo`). O fuso escolhido define o instante de envio. Horários inexistentes no avanço do horário de verão avançam; horários duplicados usam a ocorrência padrão do PostgreSQL. Não há repetição diária de um mesmo período já notificado.
- Escolhas podem ser salvas, desligadas neste aparelho ou em todos os aparelhos do paciente. Sair cancela a inscrição do navegador e limpa a identificação persistida pelo worker, inclusive para mensagens já enfileiradas. Dados de inscrição não entram no cache clínico/localStorage.
- O aviso usa somente texto fixo, sem nome, respostas, diagnóstico, alimentos ou observações. O payload cifrado contém tipo, ID opaco da conta e tag. O clique abre somente `booking`/`forms` na origem do app e depende da sessão normal.
- O cron roda no servidor, inclusive com o app fechado. Sistema operacional, rede, bateria e permissão controlam a entrega; aceitar pelo provedor não comprova exibição ou leitura.

## Infraestrutura necessária

| Configuração | Onde | Valor/contrato |
| --- | --- | --- |
| `NUTRI_PUSH_ENABLED` | Edge secret | `false` inicialmente; `true` só após homologação |
| `NUTRI_PUSH_CRON_SECRET` | Edge secret e Vault `nutri_push_cron_secret` | O mesmo segredo aleatório com pelo menos 32 bytes; nunca no frontend, Git ou logs |
| `NUTRI_PUSH_PUBLIC_KEY` | Edge secret | Chave pública VAPID P-256, base64url sem padding |
| `NUTRI_PUSH_PRIVATE_KEY` | Edge secret | Chave privada do mesmo par VAPID; gerar uma vez e guardar em cofre |
| `NUTRI_PUSH_SUBJECT` | Edge secret | `mailto:` de contato real responsável pelo serviço |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Secrets padrão do projeto Edge | Exclusivamente runtime do servidor; nenhuma chave privilegiada no app |
| `private.nutri_push_config.public_key` | Banco Nutri | Exatamente a chave pública VAPID acima |
| `private.nutri_push_config.enabled` | Banco Nutri | `false` inicialmente |
| `pg_cron`, `pg_net`, Supabase Vault | Banco Nutri | Recursos oficiais para invocação periódica; verificar habilitação |
| HTTPS + service worker instalado | App paciente | Necessários para Push; iPhone exige app adicionado à Tela de Início |

`functions/nutri-reminders-dispatch` fixa `web-push@3.6.7` e seu lockfile. A função verifica o segredo de cron em tempo constante antes de qualquer operação; `verify_jwt=false` é intencional, pois JWT de usuário não autoriza disparos. O código não oferece um endpoint para disparar uma notificação arbitrária.

## Procedimento de ativação revisável

1. Confirmar novamente projeto e esquema vigente; confrontar a migração com o catálogo e executar advisors. Os testes locais usam o snapshot estrutural de 11/10/2026 e não substituem essa revisão.
2. Aplicar **somente** a migração desta pasta. Ela não depende da migração financeira opcional. Não executar `db push` a partir da raiz do repositório.
3. Gerar o par VAPID usando `web-push.generateVAPIDKeys()` em ambiente administrativo; guardar o resultado diretamente no cofre. Importar os secrets por arquivo temporário protegido fora do repositório com a opção `--env-file`; não colocá-los na linha de comando nem imprimir as chaves.
4. Definir a chave pública em `private.nutri_push_config`, mantendo `enabled=false`. Publicar apenas a função `nutri-reminders-dispatch` da pasta isolada. CLI consultada via `--help`: `supabase functions deploy nutri-reminders-dispatch --project-ref mmdsmpetwhcfiyubhaah --workdir supabase/releases/nutri-reminders --use-api`.
5. Confirmar que invocação sem segredo retorna 401 e que chamada administrativa com segredo, ainda desligada, retorna `enabled:false` sem consultar/enviar jobs.
6. Homologar em projeto/contas próprias de teste: Android/Chrome e iPhone/PWA, app fechado, consulta marcada/cancelada/remarcada, formulário respondido antes do cron, dois aparelhos, saída e troca de conta, permissão negada/revogada, provedor 410, timeout e DST. A ativação real de teste também necessita consentimento do titular do aparelho.
7. Após homologação e autorização da ativação, ajustar ambos os flags (`NUTRI_PUSH_ENABLED=true` e tabela `enabled=true`), cadastrar segredo no Vault e aplicar `schedule.sql`. O cron tem nome único e a função SQL evita duplicar jobs. Publicar cache/frontend com os módulos novos antes de permitir opt-in.
8. Conferir contagens agregadas de `private.nutri_push_deliveries`, `cron.job_run_details` e resultados HTTP. Não exportar endpoints, chaves, IDs reais nem respostas clínicas nos logs. Para interromper, aplicar `suspend.sql` e definir `NUTRI_PUSH_ENABLED=false`.

## Concorrência, privacidade e limites

Tabelas privadas têm RLS e nenhum grant de dados a clientes. RPC pública do paciente é invoker; implementação privada verifica `auth.uid()`, conta não anônima e `patients.user_id`. Preferências, até 10 dispositivos ativos e revogação só pertencem ao paciente autenticado. Publicação de questionários e agenda continua sob as permissões existentes. RPC do worker tem EXECUTE somente para `service_role` e não usa metadados editáveis do usuário para autorização.

O scheduler guarda uma chave única por evento/dispositivo, reivindica até três jobs por execução com `FOR UPDATE SKIP LOCKED`, lease e token aleatório. Revalida fonte, vínculo, preferências, resposta e inscrição imediatamente antes do transporte. Há uma janela inevitável entre a última leitura e a aceitação do push: um cancelamento simultâneo pode chegar depois de um aviso já aceito. O TTL termina antes da consulta, e o texto manda conferir o estado atual no app.

429/5xx explícitos têm até quatro tentativas com espera crescente. Timeout/erro de rede ou processo morto durante uma entrega ficam `uncertain`; não há repetição automática sem saber se o provedor aceitou. Topic/tag estáveis reduzem duplicidade, sem prometer entrega exatamente uma vez. 404/410 desativam o endpoint. O transporte bloqueia redirects, limita tempo e admite somente hosts oficiais FCM, Mozilla, Apple e WNS; provedores novos exigem revisão de allow-list.

Inscrições expiradas não são recriadas em background: o paciente usa **Ativar neste aparelho** novamente. Desativar no navegador pode permanecer como aparelho autorizado no banco até 410 ou revogação explícita. O painel não chama isso de recebimento confirmado. Registros antigos de entrega são mantidos para deduplicação; definir retenção administrativa com preservação das chaves de eventos já notificados antes de introduzir limpeza.

## Verificação local

```sh
npm ci --prefix tests/runtime --ignore-scripts --no-audit --no-fund
node tests/test-nutri-reminders.js
node tests/test-nutri-reminders-sql.js
BASE_URL=http://127.0.0.1:8765 node tests/test-nutri-reminders-browser.js
deno check --config supabase/releases/nutri-reminders/supabase/functions/nutri-reminders-dispatch/deno.json supabase/releases/nutri-reminders/supabase/functions/nutri-reminders-dispatch/index.ts
```

Passaram testes de preferências, endpoint, autorização, cancelamento antes do envio, retry/resultado incerto; replay SQL com usuários/clínicas sintéticos cobrindo isolamento, defaults desligados, consentimento, idempotência, revogação, formulário, DST; navegador cobrindo demo, consentimento explícito, salvar/desligar, reentrada da mesma conta e worker com IndexedDB real. Push/Notification e transporte foram simulados; nenhuma permissão real foi solicitada e nenhum dispositivo real recebeu mensagem. O PGlite tem conexão única: não comprova concorrência de múltiplas conexões, plataforma Edge ou cron real.

## Referências verificadas

- [Supabase: agendar Edge Functions com Cron, pg_net e Vault](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase: secrets de Edge Functions](https://supabase.com/docs/guides/functions/secrets)
- [Web Push: API, VAPID e criptografia](https://github.com/web-push-libs/web-push)
- [MDN: Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) e [showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification)
- Changelog Supabase consultado em 17/10/2026; [mudança de TLS](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) e [PostgreSQL 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes): implementação usa TLS moderno e não utiliza ltree, btree_gist nem cifras PGP legadas.
