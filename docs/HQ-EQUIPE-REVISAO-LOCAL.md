# Equipe e alinhamentos — revisão local

Base: `fe49263d36afc88dbcf853e327c43ab3a936a3de`. Branch: `local/hq-staff-admin`. Esta entrega não está publicada e não integra o PR draft 863 de homologação do backend anterior. Nenhum usuário, convite, vínculo Auth, escopo ou acesso real foi criado.

## O que muda

Administração oferece Funcionários e equipe e preserva Auditoria operacional em sua própria aba. O cadastro recebe nome obrigatório, contato opcional, perfil proposto, situação e revisão, com motivo e histórico. Os seis perfis são administrador, financeiro, vendas, suporte, engenharia e leitura. A matriz vem das permissões existentes no servidor; não é editável pelo cliente.

Cadastro ativo, proposta aprovada e acesso efetivo são estados distintos. Aprovação não cria usuário nem concede acesso. Inativação deste cadastro tampouco revoga uma identidade independente. O backend aceita somente administradores existentes e recusa identidades comuns, equipe, claims forjadas e campos de concessão de acesso. A interface apresenta ausência de backend ou negação explicitamente. A prévia começa sem funcionários e usa apenas memória, sem persistência ou chamadas externas.

## Evidência visual

A análise utilizou reproduções reais em Chrome nas larguras 320, 375, 430, 768 e 1440 px. Os filtros do relatório comprimiam as datas a aproximadamente 113 px em 430 px; depois, ocupam 171 px. Em 320 px, passaram de 118 para 244 px. Os controles passaram a ter pelo menos 44 px de altura. As barras de indicadores agora se alinham mesmo quando um cartão apresenta a linha adicional de base. As tabelas preservam rolagem interna e acesso aos detalhes.

A imagem Library `libfile_c82c5ff7d5748191964b377b06695455` foi identificada, mas não pôde ser materializada neste executor Windows: o helper exigido depende de Python, indisponível. O download de anexo também não resolveu a autorização do arquivo. Não houve inspeção dos pixels originais, portanto as conclusões visuais acima se restringem à reprodução local, não à imagem anexada.

Capturas locais: `tests/artifacts/hq-responsive/{before,after}/` (30 imagens) e `tests/artifacts/hq-team/` (6 imagens: tela vazia, formulário vazio e matriz, desktop/celular). Elas são artefatos de revisão, não dados de produção.

## Validação

- Equipe: 48 verificações no navegador; negativas, CRUD, revisão, troca de usuário, logout, respostas atrasadas, formulário móvel e ausência de gravação externa.
- Backend do cadastro: 105 verificações em PGlite; autorização, invariantes, auditoria, idempotência, versão e preservação de Auth/staff/gate.
- Pacote e suspensão/retomada: 66 verificações em PGlite; hashes, OIDs e dados preservados, estados ambíguos, sobrecargas e aliases extras recusados atomicamente.
- Responsividade: 50 estados em cinco larguras, sem overflow de página, sobreposição, erros JavaScript ou rede externa.
- HQ geral: 9 grupos; workflows: 18 grupos. O teste de auditoria apenas passou a navegar por sua aba explícita, preservando as verificações.
- Prévia autônoma: dashboard, relatórios, influencer, Equipe e quatro capturas antes/depois; offline, sem erros ou chamadas externas.

A homologação real de Auth/PostgREST do PR 863 não cobre estas RPCs novas. Para a Equipe, ainda é necessário ensaio HTTP e concorrência entre conexões independentes antes de ativação. Os ensaios locais não demonstram Safari físico, produção ou concessão de acesso.

## Entrega e próxima etapa

O pacote isolado `supabase/releases/hq-team-admin-local/` contém uma migração gerada pela CLI e suspensão/retomada próprias. Depende do OPS ativo, com equipe desabilitada, e não altera os três pacotes anteriores. O contrato detalhado está em `HQ-EQUIPE-CONTRATO.md`.

A prévia preserva a identidade Library `libfile_7adca2eda5a481918c02ae68fdaeb2c2`, versão 2, com o nome confirmado `TORQUE-HQ-EQUIPE-PREVIA-LOCAL.html`. A substituição remota foi confirmada; os xattrs locais não puderam ser gravados por falta de Python. A referência foi preservada separadamente no workspace.

Antes de publicação futura: revisar esta entrega, integrar cuidadosamente com a branch homologada e com main, reconciliar versão/precache e rodar os testes no SHA resultante. Antes de SQL remoto: aprovação específica dos novos objetos/grants e validação do ambiente. Este pacote não autoriza habilitar staff, criar pessoas, enviar convites, alterar MFA/sessões ou ativar campanha/pagamentos.
