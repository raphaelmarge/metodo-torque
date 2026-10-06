# Primeiro uso do Personal — 6 de outubro de 2026

Base revisada: `fd215666ca2dfedc8578ecd8602943aa2d0c6630`. Escopo originado nos
itens P1 de cadastro e checklist do relatório `Melhorias_prioritarias_TorqueOn_2026-10-06`.
Esta nota registra implementação e teste local; não comprova implantação.

## Comportamento

- O guia começa pelo aluno. O assistente anterior de planos, hora-aula e Pix
  continua disponível em **Configurar cobrança (opcional)**.
- Novo aluno pede nome; WhatsApp, e-mail e objetivo são opcionais. Atendimento,
  avaliação, CPF, endereço e exigência de contrato ficam em Dados adicionais.
  O contrato de consultoria continua disponível, mas exige seleção consciente
  para cada aluno novo, mesmo quando habilitado na configuração global.
- Salvar confirma a gravação local antes de avançar. Falha conserva os campos.
  O próximo passo principal é montar treino. Contrato e venda continuam no
  disclosure e no perfil, sem exigir plano para prescrever.
- Informar e-mail não cria token, publica, define login nem envia e-mail.
  **Enviar acesso** no perfil/lista conserva o fluxo explícito existente.
  Abrir perfil não confirma uma venda apenas preenchida no assistente.
- Salvar prescrição, revisar/publicar e enviar convite têm explicações separadas.

## Checklist

As quatro etapas se referem ao mesmo aluno ativo. A criação do cadastro escolhe
o aluno acompanhado; dados antigos usam o primeiro aluno ativo disponível.
Uma ficha vazia não conta como treino: é necessário conteúdo salvo de musculação,
circuito ou corrida. A publicação exige token ativo, carimbo de sucesso e snapshot
publicado igual à prescrição atual. Edição posterior e revogação tornam a etapa
pendente novamente.

A abertura só é registrada quando a janela do mesmo token, na mesma origem,
contém a área de semana do app gerado. A janela aberta com apenas o carregador,
o popup bloqueado, a janela fechada e a espera excedida não completam a etapa.
A flag histórica `dia1AppVisto`, registrada antes de abrir a janela, não serve
como evidência. A confirmação nova guarda aluno, publicação e horário, sem
inventar um evento para dados legados.
Depois dessa conclusão confirmada, o guia inicial permanece encerrado; editar o
treino em outro dia não reapresenta o onboarding a quem já o completou.

Abrir o app no computador do profissional comprova essa abertura, não o uso
pelo aluno em celular físico. O checklist não mede a meta de quatro de cinco
participantes do piloto; essa métrica depende da realização do piloto.

## Evidências locais

- `test-personal-primeiro-uso.js`: 36 verificações; cadastro mínimo com e-mail,
  armazenamento recusado, nenhuma publicação/convite implícito, três modalidades,
  publicação recusada/confirmada, popup real interceptado, carregamento pendente,
  revisão/revogação, acesso enviado por ação explícita, perfil sem venda implícita.
- A mesma suíte verificou 320, 390, 768 e 1440 pixels nos dois temas. Capturas
  de 390 pixels em `tests/out/personal-primeiro-uso/`, inspecionadas visualmente.
- `test-onboarding-consultoria.js`: 50 verificações aprovadas.
- `test-onboarding-comercio.js`: 76 verificações aprovadas.
- `test-onboarding-documentos-cep.js`: 32 verificações aprovadas.
- `test-prescricao-entrada.js`: 196 verificações aprovadas.
- `test-elite5.js`: suíte aprovada, incluindo contrato/plano preservado.

Os testes usam dados fictícios, nuvem mockada e/ou interceptada. Não foram enviados
convites, alterados alunos reais ou aplicadas migrações. Validação autenticada em
produção e celular físico permanece distinta destas evidências.
