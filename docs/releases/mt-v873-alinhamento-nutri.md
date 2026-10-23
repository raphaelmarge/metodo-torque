# mt-v873 — Alinhamento dos formulários do Torque Nutri

## Escopo e correções

Revisão da aplicação real `/nutri/`, sobre `main` em
`70dd9b546cfa55d02224bbc513f52b379e96bbcd`, após a integração da escolha de
substituições do paciente. Alterações restritas à apresentação e distribuição:

- `style.css`: o cabeçalho dos diálogos reserva uma coluna de 44 px para fechar.
  Títulos extensos quebram dentro da própria coluna, sem deslocar o X para baixo.
- `meal-plan.css`: datas de compras passam a ocupar linhas próprias quando o
  cartão não comporta dois campos. Ano e seletor nativo permanecem visíveis;
  rótulos recebem espaçamento consistente de 8 px.
- `follow-up.css`: filtros dos relatórios passam a duas colunas até 1100 px,
  mantendo uma coluna nas telas mais estreitas e espaço mínimo para as datas
  no desktop. O recorte de ano foi reproduzido em 1024 px com Texto maior.
- `patient.css`: filtros do gráfico corporal têm bordas e larguras iguais no
  celular. Abas mantêm alvos de 44 px sem encolher o texto; a ação Nova avaliação
  ocupa uma linha própria no celular, inclusive com Texto maior.

Nenhuma alteração em HTML, cálculos, prescrições, alternativas, diário,
publicação de planos, histórico, cadastro, autenticação ou gravação. Calendários
e tabelas conservam a rolagem horizontal interna necessária; a página não ganha
rolagem lateral. Cores, temas, marca e fonte ampliada continuam existentes.

## Revisão página por página

Inspeção por navegador nas demonstrações dedicadas, com dados fictícios,
incluindo formulários abertos e cancelados, em larguras de 320, 390 e 1280 px.
Relatórios também examinados em 768, 1024 e 1440 px. Temas claro/escuro e Texto
maior conferidos nos controles afetados.

| Frente | Páginas e estados conferidos |
| --- | --- |
| Consultório | Início, pacientes/ficha/cadastro, agenda semana/mês e formulário, financeiro nas cinco subabas e formulários, relatórios, central do consultório, configurações e ajuda |
| Clínica | Prescrição/configurações/catálogo/medidas, biblioteca de alimentos/receitas/modelos, avaliações e suas abas, questionários, conversas, gamificação, comunidade, personalização, página profissional e imagens/conteúdo |
| Paciente | Início, plano/compras/substituições, evolução, agenda, diário, receitas, questionários, avaliações/laudos, documentos, minha nutri, comunidade, loja, pagamentos, conquistas, metas, perfil/fotos, ajustes e ajuda |
| Acesso | Entrar, criar conta e recuperação, sem submissão real |

Na demonstração, algumas páginas estão vazias e Avaliações/laudos abre a
evolução existente. Essas visitas não representam validação de registros
privados ou de todas as combinações possíveis de conteúdo. Quantidade 1000 e
medida extensa foram conferidas no catálogo: valor legível e medida completa
no resumo, mesmo quando o seletor nativo abrevia seu texto no celular.

## Validação e publicação

- Suíte visual: 10 grupos, incluindo regressões novas para datas, fechamento
  de modal, filtros, abas e ação de avaliação. A falha original das datas e do
  cabeçalho foi reproduzida antes da correção. Cobertura automatizada existente
  de claro/escuro, texto ampliado, teclado e conteúdo longo foi preservada.
- Agenda/evolução/fotos: 7 grupos; consolidação e navegação: 7 grupos, cobrindo
  os 18 destinos profissionais e os 15 itens do menu adicional do paciente em
  320/375/800/1280 px nos dois temas; escolhas do paciente: 9 grupos;
  planejamento semanal de compras: 6 grupos.
- Financeiro: 20 checks; acompanhamento: 11; configurações e autenticação:
  aprovados, incluindo 33 checks de acesso. O teste isolado de contrato
  financeiro exige PGlite, indisponível neste ambiente local; o CI canônico
  prepara essa dependência e executa o conjunto completo.
- Atualização Chromium v14 → v21: versão anterior, vínculo, rascunho e fila
  preservados; módulos disponíveis offline; instalação interrompida mantém
  o cache anterior. Consistência da versão global: 17 checks.

Cache Nutri v21 e global mt-v873. A aprovação local não equivale a publicação:
conferir CI no HEAD exato, workflow Pages, commit e arquivos servidos, seguido
de inspeção pública dos formulários alterados antes de anunciar conclusão.
