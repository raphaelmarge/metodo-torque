# Contratação web do Personal — 06/10/2026

`personal-assinatura.html` preserva a oferta de R$ 49,90/mês e o teste de 14 dias sem cartão. A contratação fica desativada no HTML e só abre com sessão, conta do responsável, configuração habilitada e situação confirmadas pela Edge `personal-billing`. Duas contas exigem seleção explícita. A oferta pública continua acessível sem autenticação; a visita anônima não chama a Edge financeira.

## Fluxo implementado

1. `config` e `accounts` consultam disponibilidade e contas autorizadas. A UI não usa perfil, e-mail, URL ou armazenamento como prova de propriedade.
2. `status` informa o prazo original do teste, o período de acesso e a tentativa corrente. A interface conserva benefícios legados: uma vitalícia só é exibida sem prazo quando há `accessKind:lifetime` explícito. O fim do teste não elimina uma carência ou acesso confirmado pelo servidor.
3. O responsável revisa os dados de cobrança, cartão e autorização de R$ 49,90/mês. Cupom guardado não altera o preço nem ativa campanha. Nome, e-mail, endereço brasileiro de cobrança e consentimento são obrigatórios apenas nesta etapa; documento e telefone seguem o contrato opcional da Edge.
4. O navegador envia o cartão diretamente a `https://api.pagar.me/core/v5/tokens?appId=PUBLIC_KEY`, somente com `Content-Type`, sem credencial Supabase. Apenas o token temporário, os dados de cliente e o UUID da tentativa vão para `checkout`. Não há campos de cartão com atributo `name`, evitando sua inclusão num submit HTML nativo.
5. A sessão guarda exclusivamente o UUID por usuário/conta. Cartão, token, cliente e resposta do processador não são registrados em logs ou armazenamento pelo módulo. Os campos do cartão são apagados após a tentativa e ao sair da página ou mudar de sessão.
6. Processamento, agendamento e pagamento são estados diferentes. Um timeout bloqueia nova contratação e consulta a mesma tentativa, inclusive após recarregar. O servidor precisa devolver a tentativa correspondente e autorizar a retentativa após uma falha definitiva. `invalid_input` e `billing_disabled`, documentados como anteriores à reserva, permitem uma nova consulta sem deixar um marcador irrecuperável; falhas de autorização continuam conservadoras, pois podem ocorrer depois da reserva.
7. Cancelar renovação exige ação e confirmação distintas. `cancel_pending` ou falha de conexão não são exibidos como cancelamento confirmado. Quando há assinatura conhecida e `canCancel:true`, uma solicitação pendente oferece **Tentar cancelamento novamente**, sempre com nova ação/confirmação do responsável; o navegador não repete o cancelamento automaticamente. Gerenciamento de uma assinatura existente pode continuar habilitado com novas vendas desligadas. O prazo de acesso já confirmado permanece visível.
8. Revogação da conta/sessão e falha do preflight invalidam a confirmação anterior, fecham o formulário e removem prazos antigos da tela. Se o checkout já foi enviado, sua referência permanece para reconciliação após recuperar o acesso; a interface não afirma que houve cobrança ou cancelamento.

O acompanhamento automático faz no máximo 12 consultas espaçadas em cinco segundos. Depois disso, **Atualizar situação** permanece disponível. Cada requisição e leitura da sessão têm limite de 15 segundos. O navegador nunca cria uma nova tentativa automaticamente.

## Evidência local

`tests/test-personal-saas-checkout-browser.js`: 25 grupos com Playwright e rede inteiramente interceptada, cobrindo os fluxos acima, dados inválidos, preço/configuração adulterados, consentimento, envio duplo, troca/expiração/revogação de sessão e conta, retentativa explícita do cancelamento, armazenamento bloqueado e larguras 320/390/768/1440. Os testes não utilizam credenciais de conta, cartões ou cobranças reais.

Regressões preservadas: oferta/browser (11 grupos), intenção de cadastro (15), trial web/nativo (5) e cálculo comercial (36). O teste independente é mantido separadamente em `tests/test-personal-saas-aceitacao-independente.js`.

## Ainda depende de homologação

Este código não significa pagamento liberado. Conta comercial, credenciais de teste, domínio autorizado, plano canônico, criação de cartão com endereço, datas de início, eventos e cancelamento precisam ser validados na conta Pagar.me antes dos gates serem habilitados. O modo de teste vem da configuração verificada e aparece explicitamente na tela; nunca usa a URL como chave de ativação. Backend, publicação e homologação têm evidências próprias.

Referências oficiais consultadas em 06/10/2026: [tokenização de cartão](https://docs.pagar.me/reference/criar-token-cart%C3%A3o-1), [campos de cartão](https://docs.pagar.me/reference/criar-cart%C3%A3o), [Tokenizecard JS](https://docs.pagar.me/reference/pagarme-js). A interface usa diretamente o endpoint documentado; não carrega o script Tokenizecard JS. O endereço de cobrança não faz parte do token e segue separado para o servidor.
