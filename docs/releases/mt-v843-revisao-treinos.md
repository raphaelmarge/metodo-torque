# mt-v843 — revisão da aplicação de treinos

Base: `5fbf20f83ce98c9e97cc1de2aa524b5ecafdb4e4` (main). O domínio público
servia `406c818f37c470e36bd20d6fec809c7ec20dd64e`, `mt-v842`, na investigação.
O trabalho atende aos quatro relatos de `Revisao torque 18-09.pdf`.

## Diagnóstico

| Relato | Constatação na versão atual |
| --- | --- |
| Aplicar treino da IA não mostra o treino para revisão/edição | Reproduzido no navegador: a prescrição é salva, mas a lista de fichas já aberta conserva o conteúdo anterior. O render geral e a navegação de volta não redesenham essa lista. |
| Falta confirmação junto ao botão | Confirmado: o status ficava acima da prévia, fora da posição do clique em propostas longas. |
| Aluno do PC não aparece no celular, com aviso de conflito | Os cenários correspondentes já foram corrigidos na v832. Os testes atuais passaram para salvamento idêntico, recepção do novo aluno, falta de espaço, backup em IndexedDB, recuperação e concorrência. |
| Modo presencial exige ID | A Central Pro da captura não é carregada no Personal atual. O fluxo integrado da v833 usa o nome do aluno; navegação, seleção e início de sessão foram reconfirmados no navegador. |

## Mudança

- `personal.html`: após uma aplicação bem-sucedida, atualiza somente a lista
  da modalidade aplicada se ela estiver selecionada no mesmo aluno. Mantém a
  seleção e os rascunhos dos outros alunos; Circuito e Corrida preservam o
  formulário ainda não salvo.
- Confirmação e erros de aplicação aparecem no rodapé da revisão, com anúncio
  acessível e foco. Ajustar treino e publicar ficam junto desse resultado.
- A confirmação informa que o treino foi salvo neste aparelho. Não anuncia
  confirmação da nuvem nem publicação do pacote antes dessas operações.
- Não altera gravação/CAS, sincronização, esquema, RPCs, dados de produção,
  prescrição gerada, player do aluno, cores ou demonstrações do aluno.
- Versão/cache alinhados em `assets/versao.js`, `sw.js` e `app/app-sw.js`.

## Evidência local

O teste de regressão falhou antes da mudança em “Aplicar atualiza a lista de
fichas já aberta, sem trocar aluno ou recarregar”, apesar de as asserções de
gravação já passarem. Após a mudança:

- `test-treinos-experiencia.js`: 139 verificações, incluindo as três modalidades,
  retorno visível em 320/390/1280 px, navegação comum e atalho de ajuste,
  persistência ao reabrir, outros alunos, rascunhos, falhas e conflitos.
- `test-sync-recuperacao-browser.js`: 16 verificações com IndexedDB real.
- `test-sync-primeira-puxada.js`: 8 verificações com o motor de sync real.
- `test-personal-fluxo.js`: 24 verificações, incluindo escolha por nome.
- Suítes de lógica `sync-cas`, `sync-identidade`, `sync-recuperacao-mobile` e
  `sync-conflito-ui`: aprovadas, sem chamadas à produção.

O navegador local usa Chromium 153 em ambiente isolado e Playwright 1.63.
O CI usa a instalação canônica do repositório. Fixtures e respostas da IA/nuvem
são fictícias; não houve consulta ao cadastro particular nem à IA de produção.

## Limites e publicação

O teste local não comprova a situação do Safari nem do armazenamento do iPhone
do relato. Após publicação autorizada, o aceite em conta real deve conferir a
versão carregada, o recebimento do aluno criado no PC e o fluxo gerar → revisar
→ aplicar → ajustar → publicar, preservando cópias em eventuais conflitos.

Esta branch não foi mesclada nem publicada. Antes dessas ações, conferir os
checks do HEAD exato e obter a aprovação correspondente. Não limpar dados do
navegador para contornar um conflito.
