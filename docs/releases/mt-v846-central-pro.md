# mt-v846 — Central Pro no Personal atual

A Central Pro volta a ter uma entrada própria por pedido explícito do proprietário. O redesenho do repositório independente `raphaelmarge/torque-one` (PR #1, commit `c1ef9b6963dfea370bf840863dba964094aebd6a`) foi portado sobre `metodo-torque/main` em `fcfb9bc3`, preservando os avanços até a v845.

## Atendimento e navegação

Abre no Modo presencial, com busca de aluno por nome ou telefone e carregamento das fichas e séries já prescritas. Repetições aparecem antes da carga. Só séries marcadas como realizadas entram no registro final; a prescrição original não é alterada. O profissional pode salvar rascunho, retomar e concluir a sessão.

Check-in, nutrição e próxima sessão compartilham o contexto do aluno. Os atalhos abrem as áreas existentes do perfil após validar a identidade. Importar ficha, Modo presencial, Automações, Agenda inteligente e Equipe permanecem disponíveis. Layout responsivo, temas e cor da marca são preservados.

## Coexistência e dados

A retirada da Central Pro na v832 e a orientação histórica da v843 são substituídas apenas quanto à disponibilidade da nova entrada. O fluxo diário atual (`personal-fluxo.js`), com RPE, fila offline e integração à agenda, continua intacto. A Central Pro identifica suas sessões e não assume sessões abertas por outro fluxo.

O bloqueio considera sessões presentes no servidor. Um rascunho exclusivamente offline do fluxo integrado não possui identidade suficiente para consulta segura por outro módulo e permanece privado desse fluxo. Nessa condição podem existir atendimentos separados; a Central Pro não lê, altera ou sincroniza sua fila. Sessões antigas da Central Pro sem origem continuam retomáveis quando seu formato é reconhecido; metadados adicionais são preservados.

O adaptador de contexto é somente leitura. Cache local só é usado quando usuário, cliente e academia coincidem. Troca de identidade limpa a interface e invalida respostas antigas. Não há mudança de SQL, RLS, autenticação, CAS, backup, recuperação ou sincronização.

Não foram substituídos os arquivos completos do Personal, store, builder ou service workers pela versão independente. O banco e a hospedagem atuais continuam atendendo todos os produtos. A migração do Torque One para infraestrutura própria permanece uma etapa separada.

## Demonstração e publicação

`demo-central-pro.html` usa os mesmos componentes, com informações fictícias somente em memória, sem login/questionário e com conexões bloqueadas. Recomeçar restaura os exemplos. Nenhum teste deve gravar dados de clientes.

Versão e dois caches sincronizados em `mt-v846`; o novo contexto entra no precache. A publicação mantém o workflow existente: suíte completa no mesmo commit, artefato aprovado e confirmação de `release-info.json` no domínio. Não desativar o gate para acelerar a entrega.

Validação local: demo (219 verificações), contexto (134), coexistência de sessões (49), contrato da Central Pro (79), layout (81), fluxo diário (27) e versão (17). A fixture antiga do aviso de vencimento foi corrigida com data determinística: falha original reproduzida em 29/09 e sete verificações aprovadas após a correção. Os testes usam somente dados fictícios; não representam uma sessão real de cliente.
