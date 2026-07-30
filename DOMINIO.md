# 🌐 Como ter o site em www.torqueon.com.br

O sistema já está PRONTO pro domínio: quando `www.torqueon.com.br` apontar pro site, **visitantes caem direto na página de vendas do TORQUE ON**, e clientes já cadastrados caem no portal deles. Falta só a parte que é sua: registrar o domínio e apontar o DNS (uns 20 minutos + até 24h de propagação).

## Passo 1 · Registrar o domínio (~R$ 40/ano)

1. Abra **registro.br** (o órgão oficial dos domínios .br).
2. Pesquise **torqueon.com.br** — se estiver livre, clique em registrar.
3. Faça login com sua conta gov.br (ou crie a conta no próprio registro.br com seu CPF/CNPJ).
4. Pague (Pix ou cartão). O domínio fica ativo em minutos.
   - 💡 Se `torqueon.com.br` estiver ocupado, boas alternativas: `torqueon.app.br`, `usetorqueon.com.br`, `torqueon.net.br`.

## Passo 2 · Apontar o DNS pro site (dentro do registro.br)

1. No painel do registro.br, clique no seu domínio → **DNS** → **Editar zona** (modo avançado).
2. Crie estes registros, exatamente assim:

| Tipo | Nome | Valor |
|---|---|---|
| A | *(vazio / @)* | `185.199.108.153` |
| A | *(vazio / @)* | `185.199.109.153` |
| A | *(vazio / @)* | `185.199.110.153` |
| A | *(vazio / @)* | `185.199.111.153` |
| CNAME | `www` | `raphaelmarge.github.io.` |

3. Salve. A propagação leva de minutos a 24h.

## Passo 3 · Me avisar 😄 (ou fazer no GitHub)

Quando o DNS estiver salvo, **me manda uma mensagem ("DNS pronto")** que eu ativo o domínio no site (é criar um arquivo `CNAME` no repositório — não crio antes porque ativar sem o DNS pronto derrubaria o site atual).

Se quiser fazer você mesmo: repositório **metodo-torque** → **Settings** → **Pages** → **Custom domain** → digite `www.torqueon.com.br` → Save → depois marque **Enforce HTTPS** (o cadeado 🔒 aparece em até 1h).

## O que acontece depois de ativar

- **www.torqueon.com.br** → página de vendas do TORQUE ON (visitante) ou portal (cliente logado neste aparelho; dá pra forçar o portal com `www.torqueon.com.br/?portal=1`).
- Os endereços antigos `raphaelmarge.github.io/metodo-torque/...` **continuam funcionando**: o GitHub redireciona sozinho pro domínio novo, caminho por caminho — links já enviados a alunos não quebram.
- O `.well-known/assetlinks.json` (Android tela cheia) passa a valer direto neste repositório — nem precisa mais criar o repositório `raphaelmarge.github.io` do guia das lojas.

## ⚠️ Dois avisos honestos

1. **Quem já usa o sistema** vai precisar **entrar de novo** (login e senha) na primeira vez que abrir pelo domínio novo — o navegador trata o endereço novo como "outro site", então a sessão não atravessa. Os dados da nuvem aparecem todos após o login. Quem usa **sem conta (modo local)** deve fazer ⬇ Backup no endereço antigo e ⬆ Restaurar no novo.
2. Depois de ativar o domínio, os **apps de aluno publicados** devem ser republicados uma vez (botão 🔄 Publicar apps) para os links novos já saírem com o endereço bonito.

## E os e-mails @torqueon.com.br?

O registro.br não hospeda e-mail, mas com o domínio na mão dá pra ter `contato@torqueon.com.br` de graça via Cloudflare Email Routing ou iCloud+ (encaminhando pro seu iCloud). Me pede que eu te guio quando quiser.
