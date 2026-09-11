# Avaliação postural fotográfica — revisão, não liberação

Base confirmada em 11/09/2026: `81a912adb7644bffa1cd72400c766ddb581c1366`, runtime mt-v820. Versão proposta mt-v821. Este trabalho é uma branch/PR de revisão. Main e Supabase de produção não foram alterados.

## Integração

Personal → Avaliações → Avaliação postural, com atalho no perfil. A camada `assets/personal-torque-one.js` carrega as dependências em sequência. Mantém o HTML monolítico, os destinos existentes e os tokens de tema/marca. Quatro novos assets entram no precache; as três versões devem concordar antes da publicação.

Escolha aluno, data e vista; importe JPEG/PNG/WebP ou use a câmera; mova/amplie/espelhe/gire; ajuste grade e prumo. Dois pontos medem inclinação horizontal/vertical; três pontos medem ângulo interno com o segundo como vértice. Coordenadas são frações da foto canônica convertidas para pixels antes do cálculo. Pan/zoom não altera as medidas. Não há IA, diagnóstico, escala física, pontuação de postura ou prescrição.

Cada salvamento cria snapshot imutável. Histórico por aluno, reabertura, comparação da mesma vista e exportação PNG das marcações visuais. Observações ficam no registro editável. Alunos não recebem essas fotos automaticamente no app.

## Dados e privacidade

Entrada até 15 MB e 40 megapixels; JPEG reencodificado com lado máximo 1600 px e URI até 750.000 caracteres. Até 60 marcações, texto até 2.000 caracteres. Documento no banco limitado a 900.000 bytes. Não se copiam metadados EXIF na reencodificação.

IndexedDB `torque-postural-v1`, separado de ptStudio, backups globais e app_aluno, escopo academia + autor, demo separado. Índice histórico sem fotos. IndexedDB não é cofre criptografado: acesso ao aparelho/perfil do navegador pode expor os arquivos; limpar dados do site pode apagar cópias locais. Não usar navegador compartilhado para fotos pessoais.

Migração proposta: `supabase/migrations/20260911030000_personal_postural.sql`. Tabela `public.personal_postural` com foto no JSONB, sem galeria/URL pública. RLS exige autor autenticado e vínculo na academia. INSERT também verifica aluno em `dados`/`mtapp:ptStudio`. Somente SELECT/INSERT/DELETE para authenticated; sem UPDATE/upsert. Service role administrativa permanece privilegiada. Banco guarda imagens com resolução limitada; reavaliar armazenamento privado dedicado conforme volume.

Autorização da foto é confirmação explícita do profissional em cada novo registro, inclusive após reabertura. Não substitui consentimento/política da operação. Exportar PNG retira a cópia das proteções de acesso do app.

## Exclusão, falhas e limites de revisão

Antes do INSERT, a cópia local recebe `cloudPending`. Sucesso confirmado limpa o marcador. Quando a resposta se perde, excluir exige confirmação remota antes de apagar a cópia local. Este é um bloqueio conservador: se o INSERT nunca chegou ao servidor, DELETE pode retornar zero linhas e o editor mantém a cópia para reconciliação. Ainda é necessário homologar esse caminho e a recuperação correspondente; não apresentar exclusão abrangente como concluída.

Erro na nuvem não vira sucesso. Retentativa usa o mesmo ID e só aceita conflito se o conteúdo existente for igual, incluindo reordenação de chaves JSONB. Falha de espaço local é erro. Troca de conta invalida respostas atrasadas, limpa foto em edição e fecha comparação.

Excluir aluno de ptStudio não exclui o arquivo postural em cascata. Definir retenção, remoção por aluno e tratamento de backups antes da produção. Rollback da interface preserva tabela e IndexedDB; nunca DROP TABLE automático.

## Verificação desta revisão

Executados localmente em 11/09/2026:

- `node tests/test-postural.js`: 80 verificações de geometria, validação, contrato de rede simulado e integração estática. Não testa RLS nem o shell completo.
- `node tests/test-versao.js`: 17 verificações de versões/caches.
- `node --check` nos JavaScript novos e modificados.

Novas suítes incluídas para CI, ainda sem resultado local aprovado:

- `tests/test-postural-sql.js`: migração e isolamento de autor/colega/outra academia/anon, vínculo revogado, INSERT/SELECT/DELETE, UPDATE negado e documentos inválidos em PGlite isolado. Usa a dependência já fixada em `tests/runtime`.
- `tests/test-postural-editor.js`: shell real, imagem geométrica sintética, ângulo, autorização, IndexedDB, exportação, recarregamento e snapshots em Chromium. Não testa câmera de aparelho real ou Supabase hospedado.

A navegação Chromium local ficou bloqueada na primeira página por `net::ERR_BLOCKED_BY_ADMINISTRATOR`. Não foi contornado o bloqueio. Não houve inspeção visual nem teste ponta a ponta aprovado neste ambiente. PGlite não está instalado no ambiente local desta revisão. A suíte completa depende do CI do head exato.

## Supabase e requisitos antes da liberação

Consulta somente de metadados em 11/09/2026 ao projeto `metodo-torque`: tabela postural ausente; função `minhas_academias()` e estruturas de academia/dados/membros presentes. Nenhuma branch de desenvolvimento disponível. Nenhuma migração, foto, registro de aluno ou alteração de autenticação foi enviada à produção. Não foi criada infraestrutura paga de homologação.

Antes de integrar: CI verde do head exato; revisão contra main atualizada; aplicar/testar migração em homologação autorizada usando somente dados sintéticos; homologar falha após INSERT, retry, exclusão/retencão, falta de espaço e troca de conta/aluno; validar Safari/iPhone e Android reais, câmera/orientação/toque/tema/acessibilidade. Somente depois de autorização publicar o head aprovado e aplicar a migração de produção. Sem a tabela, o editor diferencia cópia local de confirmação na nuvem.
