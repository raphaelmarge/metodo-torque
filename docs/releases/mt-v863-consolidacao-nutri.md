# mt-v863 — Consolidação do Torque Nutri

## Origem e destino

Implementação orientada pelo PDF **Estudo_Torque_Nutri_2026-10-11.pdf**,
“Adaptação do Torque On Personal para o Torque Nutri”, 17 páginas, recebido
de Raphael. Base do código: `85abb5fd8263887bf9a2d5cd46ec570bd3b0b556`.
O destino é exclusivamente `/nutri/`, com Supabase separado
`mmdsmpetwhcfiyubhaah`. Os contratos do Personal, da academia e do Nutri
legado não são migrados.

## Consolidação funcional

- O Início reúne próximas ações com paciente, data e origem. A fila distingue
  diário sem orientação, diário editado após orientação, check-ins, respostas,
  questionários aguardando resposta, planos e retornos. Ausência de registro
  descreve somente o dado observado.
- A ficha reúne linha do tempo e acessos para diário, avaliação, consulta,
  documentos, prescrição e financeiro. Os filtros preservam o paciente; o
  diário permanece acessível pelos fluxos usuais sem retirar destinos do menu.
- O editor duplica e reordena refeições e alimentos, conserva referências de
  receitas e cria identidades novas nas cópias. Dias por refeição e contexto da
  anamnese acompanham a edição. Publicar exige revisão explícita e continua
  separado de salvar o rascunho.
- Os relatórios delimitam período e paciente e explicam seus denominadores.
  Registros alimentares não são convertidos em adesão clínica ou retenção.
- A gestão financeira separa vencimento de caixa, filtra lançamentos e
  identifica recebimentos externos como manuais. A baixa verifica versão,
  clínica, titular e a linha retornada; zero linhas não produz sucesso visual.
  Observações compartilhadas têm essa identificação no formulário.
- A consulta guiada conserva motivo, observações, conduta, retorno e as
  referências clínicas usadas. Salvar o rascunho e concluir são ações distintas;
  complementar uma consulta concluída preserva o registro anterior.
- Configurações exibem os estados observados de carga, sincronização e recursos.
  Exportação e preferências continuam disponíveis; integrações não configuradas
  não são apresentadas como ativas.

O financeiro detecta a capacidade do servidor. Sem a migração, cria lançamentos
com o ID gerado pelo banco e mantém baixas integrais com controle de versão.
Com a migração opcional, habilita competência, parcelas mensais, recebimentos
parciais, correções com motivo e registro de devoluções externas. Eventos e
comprovantes preservam o snapshot do movimento, incluindo pagamentos legados.
A conta profissional também vinculada como paciente consulta somente a clínica
aberta. Uma falha ambígua no INSERT legado impede reenviar o mesmo formulário
até conferir os dados, pois o banco atual não oferece idempotência dessa criação.

## Acesso, leitura e preservação

O carregamento da conta prepara um snapshot completo antes de substituí-lo.
Falhas na plataforma preservam a leitura anterior e expõem o erro. As consultas
clínicas usam os pacientes da clínica selecionada, além da autorização do banco.
Respostas antigas são recusadas depois de uma troca de sessão, inclusive quando
o mesmo usuário entra novamente. O cache offline é validado antes de alterar o
estado: cópias incompletas ou misturadas entre clínicas/pacientes são recusadas.

As regras de banco observadas estão versionadas em
`supabase/releases/nutri-consolidation/`. O snapshot contém somente metadados:
não contém pacientes, transações ou credenciais. Testes locais com identidades
sintéticas exercitam autorização, vínculo, revogação, histórico e concorrência.
Não substituem homologação de convite/confirmação/recuperação com o Auth real.

`financial_entries.note` é acessível ao paciente na receita própria. Esta
release não o transforma em nota clínica privada. O histórico administrativo
deve conter somente informações financeiras adequadas a essa visibilidade.

## Implantação e fases dependentes

O cache próprio do Nutri passa a v12 e inclui os módulos novos. Os três
marcadores globais ficam em mt-v863. Produção observada antes desta mudança:
release `0f81a0eafc248b4a396a6a5aedee07c65a80ebbc`, mt-v862, cache Nutri v11.
O código na `main`, o deploy do Pages e a configuração do banco são evidências
separadas.

A migração proposta está em
`supabase/releases/nutri-consolidation/supabase/migrations/20261011184245_nutri_manual_finance_ledger.sql`.
Ela não foi aplicada remotamente. Sua instalação revoga gravações financeiras
diretas de clientes antigos; exige publicar primeiro o cliente compatível,
conferir backup e seguir `FINANCE-CONTRACT.md`. O snapshot estrutural desta
pasta é somente uma base de teste, nunca uma migração sobre produção.

Pagamento online permanece dependente de provedor, modelo de recebedor,
credenciais, KYC e homologação. Abertura de link e declaração do paciente não
confirmam liquidação. Não há contratação, cobrança, estorno bancário, repasse,
comissão ou recorrência ativados por esta alteração.

Consumo automático de pacotes requer regras explícitas de faltas, remarcação,
vigência, expiração e devolução. Mensageria externa, push, página profissional
pública, equipe clínica com funções reais e IA revisável permanecem fases
dependentes do estudo; não são apresentados como integrações ativas.

## Verificação

Verificações locais executadas com dados sintéticos:

- 18 grupos integrados do Nutri, incluindo 33 cenários de acesso/sessão,
  11 de acompanhamento, 8 de consulta e 20 financeiros.
- 17 cenários SQL do schema observado, 18 da migração proposta e 9 contratos
  entre comandos reais da interface e PostgreSQL/PGlite, antes e depois da
  migração. Incluem os grants por coluna instalados e conta com dois papéis.
- 7 cenários no PostgreSQL 17.11 com conexões independentes e bloqueios
  comprovados por `pg_blocking_pids()`: idempotência, versão, excesso de
  pagamento/devolução, rollback e isolamento entre titulares.
- Navegação no Chromium: rotina (18), alinhamento ao Personal (7), prescrição
  (6) e consolidação (7). Foram verificados os 18 destinos profissionais,
  15 destinos do paciente, teclado, dois temas e larguras 320/375/800/1280.
- Revisão independente dos três problemas financeiros finais, sintaxe e
  `git diff --check`.

Esses resultados não comprovam o Auth real, gateway, restauração de backup,
instalação da migração ou produção. O CI da entrega será evidenciado no PR;
nenhuma suíte completa do repositório é declarada aprovada somente por estes
testes locais direcionados.
