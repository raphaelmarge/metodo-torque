# mt-v832 — recuperação móvel e Personal sem Central Pro

Base revisada: `31d94352fda45ca6bfbfef74b30dc9138fca2c2c` (main em 13/09/2026).

## Escopo

Remove o carregamento automático da Central Pro em `assets/personal-torque-one.js`. As 18 áreas existentes, a avaliação postural, a marca e os temas permanecem. Os arquivos da demonstração isolada e as tabelas já existentes não são apagados. Não há migração nem alteração de registros de produção.

## Problemas reproduzidos

1. `write('ptStudio', valor)` marcava o painel como editado mesmo quando o JSON não mudava. Uma atualização posterior de outro aparelho podia virar conflito sem haver uma edição nova neste aparelho.
2. `resolveConflito` exigia outra cópia completa no localStorage antes de consultar `dados`. Quando essa cópia não cabia, retornava `false` sem buscar a nuvem, mantendo a lista antiga. A ausência de backup é compatível com a mensagem mostrada no relato; não foi inspecionado o armazenamento do iPhone real.

## Correção

- Salvamento idêntico preserva o carimbo remoto e não cria pendência artificial.
- O rascunho é arquivado em `mt-sync-rascunhos`, object store `rascunhos`, com confirmação somente no término da transação IndexedDB. Na indisponibilidade, uma cópia local idêntica e verificada é reutilizada ou criada; sem backup confirmado, nada é substituído.
- Cópias antigas de conflito do mesmo painel/equipe só saem do localStorage após arquivamento integral confirmado, e somente se não tiverem mudado. Os arquivos mantêm a chave original e o envelope JSON com `chave`, `em` e `raw`. Não se executa `localStorage.clear()`.
- A recuperação confere conta, ciclo, conteúdo e envio em andamento antes e depois das esperas. Respostas inválidas, logout, edição concorrente e falhas de armazenamento conservam a proteção.
- Falhas ao aplicar o painel não avançam a revisão CAS. Os ouvintes são notificados depois de liberar o conflito, sem apagar edições novas produzidas pela atualização da tela.
- O aviso informa a etapa que falhou. Fechar o aviso continua sem remover a proteção.
- A versão muda nos três pontos de cache (`assets/versao.js`, `sw.js`, `app/app-sw.js`).

## Verificação

Executados localmente: testes de concorrência CAS, identidade/reconexão, aviso de conflito, contratos do módulo/demonstração, versões e 18 novos cenários de recuperação móvel. Dados de teste são fictícios.

Adicionado teste com IndexedDB real e interação com o botão em 390 e 1280 px, além de asserções de ausência da Central Pro no teste do shell. A navegação do Chromium local foi bloqueada pelo ambiente (`ERR_BLOCKED_BY_ADMINISTRATOR`); os testes de navegador ficam para o CI. Testes locais de lógica não equivalem a validação no Safari ou no aparelho do relato.

## Publicação e aceite

Esta nota não comprova deploy. Antes de publicar, verificar o HEAD do PR, os checks desse HEAD e o fluxo de Pages. Após a publicação autorizada, conferir `mt-v832` no aparelho; com a mesma conta no PC e celular, cadastrar um aluno de teste, confirmar seu recebimento e testar uma edição concorrente real. Não limpar dados do navegador nem recriar alunos para contornar o problema.

## Ajustes após o primeiro CI

O run `34765300350` bloqueou a publicação por duas verificações. O salvamento idêntico agora mantém a notificação única exigida pelo Personal, sem alterar timestamp, auditoria ou fila. A fixture do teste de navegador declara UTF-8 explicitamente, como a página real, evitando decodificação incorreta dos acentos no JavaScript. A asserção original do texto do aviso permanece, e foi acrescentada a verificação de `document.characterSet`. O novo HEAD precisa de nova execução integral dos checks antes do merge.
