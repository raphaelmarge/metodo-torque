// Catálogo de conteúdo do portal Método Torque.
// Fonte única de verdade para navegação, home e service worker (lista de docs).
self.MT_MODULES = [
  { n: 1, title: "O Negócio Academia: Diagnóstico e Fundamentos", short: "Diagnóstico e Fundamentos" },
  { n: 2, title: "Finanças para Dono de Academia", short: "Finanças" },
  { n: 3, title: "Máquina de Vendas", short: "Comercial e Vendas" },
  { n: 4, title: "Retenção: Onde o Lucro Mora", short: "Retenção" },
  { n: 5, title: "Equipe e Liderança", short: "Equipe e Liderança" },
  { n: 6, title: "Operação Redonda", short: "Operação" },
  { n: 7, title: "Equipamentos e Estrutura: Investir com Inteligência", short: "Equipamentos" },
  { n: 8, title: "Marketing Local e Marca", short: "Marketing e Marca" },
  { n: 9, title: "Expansão: A Próxima Unidade e Novas Receitas", short: "Bônus · Expansão", bonus: true },
];

// Programas do dia a dia (apps completos, dados salvos no navegador)
self.MT_APPS = [
  { slug: "app-metas", file: "apps/metas.html", icone: "🎯", title: "Metas de Vendas", desc: "Meta mensal por vendedora, lançamento de vendas em segundos, ranking e projeção do mês." },
  { slug: "app-funil", file: "apps/funil.html", icone: "🧲", title: "Funil Comercial", desc: "Leads com etapa, dono e data de follow-up — contato atrasado fica vermelho com a mensagem pronta no WhatsApp." },
  { slug: "app-experimentais", file: "apps/experimentais.html", icone: "🗓", title: "Aulas Experimentais", desc: "Agenda das aulas grátis com confirmação por WhatsApp, presença e conversão em matrícula." },
  { slug: "app-inadimplencia", file: "apps/inadimplencia.html", icone: "💰", title: "Controle de Inadimplência", desc: "A régua de cobrança do curso em ação: cada devedor no passo certo (D+1 a D+30) com a mensagem pronta." },
  { slug: "app-manutencao", file: "apps/manutencao.html", icone: "🔧", title: "Central de Manutenção", desc: "Aparelhos, predial e limpeza: chamados com foto, agendamento de consertos e retornos, alerta de atraso." },
  { slug: "app-checklist", file: "apps/checklist.html", icone: "✅", title: "Checklist do Dia", desc: "Abertura e fechamento com responsável e hora limite — item atrasado gera cobrança pronta no WhatsApp." },
  { slug: "app-diario", file: "apps/diario.html", icone: "📈", title: "Diário do Curso", desc: "Preencha os números de cada módulo e gere o relatório final — com análise pronta para levar à IA." },
  { slug: "tv", file: "apps/tv.html", icone: "📺", title: "Modo TV", desc: "Painel para o telão da academia: metas, manutenção e checklist girando em tela cheia, sempre atualizados.", standalone: true },
];

// type: apostila | ferramenta (interativa) | modelo (documento de apoio) | deck | indice
self.MT_DOCS = [
  { slug: "deck", type: "deck", module: null, title: "Apresentação do Método", desc: "O deck completo do Método Torque: promessa, percurso dos 8 módulos e o que muda na sua academia." },
  { slug: "indice", type: "indice", module: null, title: "Índice das Apostilas", desc: "Visão geral das 9 apostilas com o que você implanta em cada módulo." },

  { slug: "modulo-1", type: "apostila", module: 1, title: "Apostila · Módulo 1", desc: "O negócio academia: mercado, os 7 números e o seu gargalo número um." },
  { slug: "modulo-2", type: "apostila", module: 2, title: "Apostila · Módulo 2", desc: "Finanças: DRE simplificado, precificação e fluxo de caixa sem sustos." },
  { slug: "modulo-3", type: "apostila", module: 3, title: "Apostila · Módulo 3", desc: "Máquina de vendas: funil comercial, script e conversão de visitas." },
  { slug: "modulo-4", type: "apostila", module: 4, title: "Apostila · Módulo 4", desc: "Retenção: onboarding de 90 dias e réguas que seguram o aluno." },
  { slug: "modulo-5", type: "apostila", module: 5, title: "Apostila · Módulo 5", desc: "Equipe e liderança: papéis, delegação e ritmo de gestão." },
  { slug: "modulo-6", type: "apostila", module: 6, title: "Apostila · Módulo 6", desc: "Operação redonda: rotinas, checklists e padrão de qualidade." },
  { slug: "modulo-7", type: "apostila", module: 7, title: "Apostila · Módulo 7", desc: "Equipamentos e estrutura: investir com inteligência e manter o parque vivo." },
  { slug: "modulo-8", type: "apostila", module: 8, title: "Apostila · Módulo 8", desc: "Marketing local e marca: campanhas, indicação e presença no bairro." },
  { slug: "modulo-bonus", type: "apostila", module: 9, title: "Apostila · Módulo Bônus", desc: "Expansão: a próxima unidade e novas fontes de receita." },

  { slug: "planilha-7-numeros", type: "ferramenta", module: 1, title: "Planilha dos 7 Números", desc: "Preencha os dados do mês e veja o semáforo dos 7 indicadores que mandam no resultado." },
  { slug: "diagnostico-360", type: "ferramenta", module: 1, title: "Diagnóstico 360", desc: "Avalie as áreas da academia e descubra onde está o seu gargalo número um." },
  { slug: "planilha-dre", type: "ferramenta", module: 2, title: "Planilha DRE Academia", desc: "Monte o DRE simplificado da academia e enxergue o lucro de verdade." },
  { slug: "calculadora-precificacao", type: "ferramenta", module: 2, title: "Calculadora de Precificação", desc: "Calcule o preço mínimo viável dos seus planos a partir dos custos reais." },
  { slug: "funil-comercial", type: "ferramenta", module: 3, title: "Planilha de Funil Comercial", desc: "Acompanhe leads, agendamentos, visitas e matrículas — e ache o vazamento do funil." },

  { slug: "regua-cobranca", type: "modelo", module: 2, title: "Régua de Cobrança WhatsApp", desc: "Mensagens prontas, dia a dia, para recuperar inadimplentes sem constranger." },
  { slug: "script-vendas", type: "modelo", module: 3, title: "Script de Vendas", desc: "Roteiro completo do atendimento comercial: da recepção ao fechamento." },
  { slug: "regua-retencao", type: "modelo", module: 4, title: "Régua de Retenção WhatsApp", desc: "Mensagens prontas para reativar alunos sumidos antes do cancelamento." },
  { slug: "onboarding-90-dias", type: "modelo", module: 4, title: "Onboarding 90 Dias", desc: "Protocolo de acompanhamento do aluno novo do dia 1 ao dia 90." },
  { slug: "briefing-delegacao", type: "modelo", module: 5, title: "Briefing de Delegação", desc: "Modelo para delegar uma responsabilidade com clareza de dono." },
  { slug: "pauta-reuniao-semanal", type: "modelo", module: 5, title: "Pauta da Reunião Semanal", desc: "Roteiro da reunião de gestão: números, pendências e decisões da semana." },
  { slug: "checklists-abertura-fechamento", type: "modelo", module: 6, title: "Checklists de Abertura e Fechamento", desc: "Rotina diária padronizada para abrir e fechar a academia sem falhas." },
  { slug: "controle-manutencao-limpeza", type: "modelo", module: 6, title: "Controle de Manutenção e Limpeza", desc: "Plano de limpeza e manutenção preventiva por área e frequência." },
  { slug: "inventario-equipamentos", type: "modelo", module: 7, title: "Inventário de Equipamentos", desc: "Levantamento do parque de equipamentos: estado, prioridade e plano de troca." },
  { slug: "calendario-campanhas", type: "modelo", module: 8, title: "Calendário Anual de Campanhas", desc: "As campanhas comerciais do ano, mês a mês, com foco e mecânica de cada uma." },
];
