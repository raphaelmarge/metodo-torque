# mt-v845 — Confiabilidade interna

Autorização: Raphael pediu implementar todas as melhorias internas propostas.
Preserva os 18 destinos, marca, temas, builder do aluno e contratos existentes.
O backend deve entrar antes do frontend. Não há migração de cadastros nem
remoção de históricos, fotos ou registros de treino existentes.

## Comportamento

- Backup v2: SHA-256 para detectar arquivo corrompido; dados locais permitidos,
  documentos preenchíveis, fotos IndexedDB referenciadas, avaliações posturais
  locais e remotas da própria pessoa e imagens próprias referenciadas em
  Storage `galeria`/`exercicios`. Sessões e credenciais Supabase ficam fora.
  Arquivos antigos continuam aceitos, com aviso de que não contêm fotos.
- Restauração: valida arquivo/conta; exige fila conciliada; conserva backup
  anterior completo no IndexedDB; usa IDs novos para fotos e uploads sem
  substituição; recusa postural divergente; reverte gravações locais se houver
  falha; diário persistido protege uma interrupção/reabertura. Cópias podem ser
  baixadas em Segurança e manutenção. Não apaga automaticamente cópias antigas.
- Sincronização: diferenças por cadastro de aluno e ficha. Mudanças independentes
  se conciliam sob trava de linha no servidor; conflito no mesmo item aborta o
  lote. Formatos desconhecidos, exclusões/reordenações de listas são atômicos.
  Sem conteúdo-base confirmado, permanece o CAS por revisão. Uma confirmação
  remota incorpora alterações de outros aparelhos e preserva edições locais
  feitas durante a requisição. Falha em outro módulo não repete o patch confirmado.
- Histórico transacional: autor, data, caminho, conteúdo anterior/posterior e
  origem. Clientes não escrevem/apagam a trilha. Recuperação confere o conteúdo
  atual e registra uma nova alteração; não recria/exclui alunos nem religa
  acessos. Uma edição posterior impede a recuperação. Histórico começa nesta
  versão; não fabrica autoria retroativa.
- Acessos: sessões próprias, saída dos outros aparelhos, último acesso registrado
  do aluno e revogação não destrutiva. Revogação e atualização do painel são uma
  transação. Política restritiva do painel e histórico verifica `auth.sessions`,
  além do vínculo existente da academia. JWT de sessão encerrada não lê/grava
  esses dados. Demais serviços podem aceitar o JWT até sua expiração.
- Diagnóstico: conta envios em andamento, fila, conflitos e falhas de consulta,
  gravação e publicação. Sinaliza pendências acima de um minuto; exportação não
  contém cadastros, senhas ou tokens. Falhas técnicas usam a telemetria existente;
  não dispara mensagens/e-mails para pessoas.
- Modularização: backup, diferenças do estúdio e interface de manutenção em
  módulos separados. Sem reescrever a aplicação ou criar um framework.
- Atualização instalada: HTML novo detecta o núcleo antigo ainda no cache e
  aguarda a troca de versão para liberar os novos backups e a manutenção.
  Não executa a exportação antiga como se incluísse fotos nem força recarga.

## Origem e estados da interface

| Bloco em Sua ilha → Acesso e equipe | Fonte | Ação | Alternativas |
| --- | --- | --- | --- |
| Saúde | Estado de sync e eventos de publicação | Conferir agora / baixar diagnóstico | Desconectado, consultando, pendente, falha, conflito |
| Aparelhos | RPC restrita ao usuário autenticado | Consultar / sair dos outros | Sem confirmação, erro, troca de conta |
| Acessos do aluno | Cadastro local + RPC de acessos | Consultar / revogar | Sem app, já revogado, edição concorrente |
| Histórico | RLS `personal_alteracoes` | Ver antes/depois / recuperar | Vazio, falha, edição posterior, operação de acesso protegida |
| Cópias anteriores | Diário IndexedDB da mesma conta | Baixar arquivo preservado | Sem restauração anterior, falha, conta diferente |

## Limites explícitos

O backup cobre o conjunto indicado acima; não é uma exportação administrativa
de todas as tabelas do Supabase, arquivos sem referência ou fotos de outros
profissionais. A exportação de mídia remota precisa de conexão; imagem inacessível
interrompe o backup. Limites: arquivo 150 MB, imagem 16 MB. Dados locais novos
permanecem no aparelho até a sincronização. Avaliações restauradas ficam locais;
não são republicadas automaticamente. Cópias preservadas dependem do armazenamento
do navegador até serem baixadas pelo usuário.

Revogar acesso bloqueia novas requisições do app hospedado; não apaga arquivos ou
cópias offline já entregues ao aluno. Trocar senha não rotaciona automaticamente
os links legados de aluno. A saída das outras sessões é da conta profissional.
Não foi alterada a configuração de proteção de senhas vazadas do Supabase Auth.
WebKit em CI verifica o motor e os fluxos automatizados; não substitui aceite
físico no iPhone, instalação PWA ou recebimento real de mensagens.

## Verificação e implantação

- Testes locais de CAS/identidade/recuperação móvel, diferenças por item e SQL
  isolado executados durante a implementação.
- Gate completo em GitHub Actions inclui Chromium e WebKit. Suíte nova bloqueia
  rede externa, usa IndexedDB real e servidor localhost. PostgreSQL efêmero testa
  duas conexões concorrentes; nenhuma base real de alunos é usada pelos testes.
- Workflow curto de diagnóstico não substitui a suíte completa nem o gate Pages.
- Aplicar `20260926232430_confiabilidade_interna.sql` após os testes e antes de
  integrar. Conferir permissões/metadados no projeto, depois publicar o mesmo
  código testado e verificar `release-info.json` público.

Estado de publicação e resultados finais são registrados na PR da entrega.
