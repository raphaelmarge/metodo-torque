# Assinatura pelas lojas (App Store / Play Store) — guia do build

A assinatura do TORQUE PERSONAL vendida DENTRO do app usa o RevenueCat como
ponte: o app fala com a loja, o RevenueCat confere o recibo com a Apple/Google
e avisa a Edge Function `assinatura-loja`, que grava o status na conta.

O que já está pronto no repositório:

- `supabase-setup.sql` → bloco ASSINATURA DO PROFISSIONAL (colunas + RPC
  `minha_assinatura()`); rodar o arquivo no SQL Editor.
- `supabase/functions/assinatura-loja/index.ts` → webhook do RevenueCat
  (publicar pelo funcoes.html, Verify JWT DESLIGADO, secret `RC_WEBHOOK_TOKEN`).
- `personal.html` → consulta o status ao conectar na nuvem, mostra a situação
  no card Sua ilha e as faixas de atraso/vencimento; no app nativo esconde a
  oferta com preço da web (regra das lojas).

O que falta e entra no PRÓXIMO build nativo (não dá pra fazer sem as contas):

1. **Criar o produto de assinatura nas lojas** — R$ 59,90/mês:
   - Play Console → Monetizar → Produtos → Assinaturas → criar
     (ex.: id `torque_personal_mensal`).
   - App Store Connect → app TORQUE PERSONAL → Assinaturas → criar grupo e
     assinatura com o mesmo id.
2. **Conta RevenueCat** (grátis até US$ 2.500/mês de receita):
   - criar o projeto, conectar as duas lojas, criar o Entitlement (ex.: `pro`)
     e apontar os produtos das lojas pra ele;
   - em Integrations → Webhooks, cadastrar a URL da Edge Function com `?t=`;
   - copiar as API keys públicas (uma Android, uma iOS).
3. **Plugin no build** (aqui em `nativo/`):

   ```bash
   npm i @revenuecat/purchases-capacitor
   npx cap sync
   ```

4. **Ligar no app** — na inicialização do produto personal, depois do login:

   ```js
   import { Purchases } from "@revenuecat/purchases-capacitor";

   // appUserID = ID DA ACADEMIA (nuvem.aid) — é assim que o webhook acha a conta
   await Purchases.configure({ apiKey: CHAVE_DA_PLATAFORMA, appUserID: academiaId });

   // comprar: pega a oferta atual e compra o pacote mensal
   const ofertas = await Purchases.getOfferings();
   await Purchases.purchasePackage({ aPackage: ofertas.current.availablePackages[0] });
   ```

   Depois da compra o RevenueCat chama o webhook sozinho — o painel passa a
   mostrar "Assinatura ativa" na próxima consulta.

Regras das lojas pra não ser rejeitado:

- Dentro do app NUNCA mencionar o preço da web nem mandar pagar por fora
  (Apple rejeita na revisão). O painel já esconde a faixa com preço quando
  roda no app nativo.
- O preço da loja (R$ 59,90) é maior que o da web (R$ 49) por causa da
  comissão de 15% da Apple/Google — isso é permitido, só não pode ser
  anunciado dentro do app.
