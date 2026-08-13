-- ======================================================================
-- TORQUE ON — CONFERIDOR DA INSTALAÇÃO
--
-- Cole no SQL Editor do Supabase e aperte Run. Ele NÃO muda nada: só olha
-- o que existe e responde item por item, em português.
--
-- Serve pra responder "rodei o SQL, será que pegou?" sem depender de
-- memória — que é onde a gente sempre erra.
-- ======================================================================
with itens(ordem, item, existe, pra_que) as (
  values
    (1,  'Função: excluir conta (exigida pelas lojas)',
         to_regprocedure('public.excluir_minha_conta()') is not null,
         'Sem ela o botão Excluir minha conta falha e a Google Play recusa o app'),
    (2,  'Função: criar academia/studio',
         to_regprocedure('public.criar_academia(text,text)') is not null,
         'É o que cria a sua ilha quando você faz a conta na nuvem'),
    (3,  'Função: entrar na equipe pelo código',
         to_regprocedure('public.entrar_na_equipe(text,text)') is not null,
         'Recepção e professores entram na sua academia'),
    (4,  'Função: login do aluno',
         to_regprocedure('public.aluno_login(text,text)') is not null,
         'Sem ela o app do aluno não abre pra ninguém'),
    (5,  'Função: aluno define a própria senha',
         to_regprocedure('public.aluno_define_login(text,text,text)') is not null,
         'O aluno troca a senha dentro do app, no card Meu login'),
    (6,  'Função: dados do app do aluno (busca)',
         to_regprocedure('public.app_aluno_busca(text)') is not null,
         'É o que entrega treino, dieta e evolução pro app'),
    (7,  'Função: chat do aluno com você',
         to_regprocedure('public.app_chat_envia(text,text)') is not null,
         'Mensagem do aluno chega na aba Chat do painel'),
    (8,  'Função: agendamento pelo app',
         to_regprocedure('public.app_aluno_agenda(text,text,text,date,text)') is not null,
         'O aluno pede horário e reserva vaga na aula'),
    (9,  'Função: check-in semanal (assessoria)',
         to_regprocedure('public.app_aluno_checkin(text,integer,text,numeric)') is not null,
         'Carinha + peso + recado caem na aba Assessoria'),
    (10, 'Função: matrícula online',
         to_regprocedure('public.matricula_nova(text,text,text,text,text)') is not null,
         'A página de matrícula do site cadastra sozinha'),
    (11, 'Comunidade: tabela de posts',
         to_regclass('public.app_feed') is not null,
         'Feed da turma no app do aluno e do paciente'),
    (12, 'Comunidade: publicar post',
         to_regprocedure('public.app_aluno_posta(text,text,text,text,text)') is not null,
         'Sem ela a aba Comunidade abre vazia'),
    (13, 'Tabela: academias',
         to_regclass('public.academias') is not null,
         'A base de tudo: cada cliente é uma ilha'),
    (14, 'Tabela: membros da equipe',
         to_regclass('public.membros') is not null,
         'Quem tem acesso a cada ilha'),
    (15, 'Tabela: app publicado do aluno',
         to_regclass('public.app_aluno') is not null,
         'É onde o app de cada aluno fica hospedado'),
    (16, 'Tabela: assinaturas de push',
         to_regclass('public.push_subs') is not null,
         'Guarda quem aceitou receber notificação'),
    (17, 'Tabela: clientes do HQ (seu SaaS)',
         to_regclass('public.saas_clientes') is not null,
         'Central de Comando: seus clientes e mensalidades'),
    (18, 'Tabela: eventos do Pagar.me',
         to_regclass('public.pagarme_eventos') is not null,
         'Baixa automática quando o cliente paga no cartão')
)
select
  case when existe then '✅ ok' else '❌ FALTA' end as situacao,
  item,
  pra_que as "para que serve"
from itens
order by existe, ordem;

-- Resumo em uma linha só (role até o fim do resultado)
with tudo(existe) as (
  select to_regprocedure('public.excluir_minha_conta()') is not null
  union all select to_regprocedure('public.aluno_login(text,text)') is not null
  union all select to_regprocedure('public.criar_academia(text,text)') is not null
  union all select to_regclass('public.app_feed') is not null
  union all select to_regclass('public.academias') is not null
)
select case when bool_and(existe)
  then '🎉 Instalação completa — pode seguir.'
  else '⚠️ Faltou alguma coisa: rode o SQL completo de novo em torqueon.com.br/sql.html e confira se apareceu Success.'
end as resultado from tudo;
