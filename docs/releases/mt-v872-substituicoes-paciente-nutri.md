# mt-v872 — Escolhas de alimentos no app do paciente Nutri

## Fluxo e dados

Implementação na rota real `/nutri/`, sobre `origin/main` em
`5ea514e9b98ed741aa8cb8ce405054426f9763d8`. No plano alimentar, cada alimento
com alternativas publicadas oferece a ação “Substituir [alimento]”. O paciente
vê a quantidade e kcal/proteínas/carboidratos/gorduras de cada opção e escolhe
uma delas. O alimento principal continua disponível para desfazer a escolha.

Os totais do alimento, da refeição e do dia usam o snapshot completo da opção
escolhida. A quantidade da alternativa é independente da quantidade do principal:
não há nova multiplicação pela porção original, ajuste clínico ou sugestão livre
do catálogo no aplicativo do paciente. Nutrientes ausentes continuam ausentes.

`patient-food-choices.js` centraliza preferências; `patient-experience.js` mostra
as opções e totais; `platform.js` compartilha o mesmo estado com `food-journal.js`.
`day-summary.js` distingue os totais escolhidos dos totais prescritos e
`meal-plan.css` acrescenta os controles responsivos usando os temas existentes.

## Persistência e preservação

- A escolha fica no aparelho, separada por acesso, clínica, paciente, versão e
  conteúdo publicado, e data. Não sincroniza entre aparelhos. Falhas de storage
  são informadas e a preferência pode continuar somente na sessão.
- O plano publicado é somente lido. Versão, paciente, papel e contexto são
  conferidos novamente ao escolher; botões antigos após mudança de contexto
  não modificam a preferência do novo acesso.
- Só refeições previstas para a data e alternativas já prescritas são válidas.
  Estado salvo inválido não injeta alimentos; uma nova publicação invalida as
  escolhas da anterior. Datas independentes não sobrescrevem umas às outras.
- Escolher não registra consumo. Um novo relato no diário começa com os
  alimentos escolhidos; o paciente ainda confirma o que consumiu e salva.
- Registros existentes, rascunhos restaurados e alimentos digitados manualmente
  são preservados. Ao trocar data/refeição, somente um formulário intocado é
  atualizado automaticamente. A ação “Usar escolhas desta data e refeição”
  permite recarregar as opções quando houver edição ou rascunho.
- Histórico, publicação, impressão e lista de compras mantêm seus contratos.
  As escolhas para compras continuam configuradas separadamente.
- Sem alteração de schema, RPC, autenticação, catálogo ou dados clínicos reais.

A demonstração de Marina inclui duas alternativas de arroz geradas pelo motor
existente a partir de registros do catálogo (TACO cará cozido e Open Food Facts
mandioca cozida Vapza). São exemplos fictícios do fluxo, não recomendações para
um paciente real; os demais pacientes demonstrativos mantêm seus planos.

## Verificação e distribuição

Validação local: 7 grupos do motor de escolhas, 9 grupos da interface nova,
5 cenários de integração com diário, 18 checks de rotina, 17 de resumo e
mudanças de plano, 10 em navegador do resumo, 13 de alternativas/compras,
7 de substituições do nutricionista, 33 de autenticação, 9 de integração,
11 de experiência do paciente e 18 de caminhos/cache. Conferência visual em
desktop e celular, temas claro/escuro, texto ampliado e teclado. A suíte visual
passou seus 7 grupos. Versão global passou 17 checks.

Atualização Chromium v14 para v20 verificada com novos módulos disponíveis
offline e falha de instalação preservando a versão anterior. Cache Nutri v20,
versão global mt-v872. O CI canônico Linux deve passar no HEAD antes do merge;
o workflow Pages e o commit servido devem ser conferidos antes de declarar
publicação. Testes locais e demonstração não representam validação de registros
clínicos reais.
