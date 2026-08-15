# Assinatura pelas lojas (App Store / Play Store) — guia do build

A assinatura do TORQUE PERSONAL vendida DENTRO do app usa o RevenueCat como
ponte: o app fala com a loja, o RevenueCat confere o recibo com a Apple/Google
e avisa a Edge Function `assinatura-loja`, que grava o status na conta.

O que já está pronto no repositório:

- `supabase-setup.sql` → bloco ASSINATURA DO PROFISSIONAL (colunas + RPC
  `minha_assinatura()`); rodar o arquivo no SQL Editor.
- `supabase/functions/assinatura-loja/index.ts` → webhook do RevenueCat
  (publicar pelo funcoes.html, Verify JWT DESLIGADO, secret `RC_WEBHOOK_TOKEN`).
- `assets/modulo-conta.js` → a tela de entrada agora tem CRIAR CONTA
  self-service (nome + e-mail + senha): quem baixa o app da loja se cadastra
  sozinho na primeira abertura.
- `personal.html` → tela de assinatura (R$ 59,90/mês) que aparece logo depois
  do login/cadastro no app da loja, com o botão Assinar já ligado no plugin do
  RevenueCat; consulta o status ao conectar na nuvem, mostra a situação no
  card Sua ilha e as faixas de atraso/vencimento; esconde a oferta com preço
  da web (regra das lojas).
- `assets/cloud-config.js` → `MT_RC` é onde entram as chaves PÚBLICAS do SDK
  do RevenueCat (uma Android, uma iOS). Enquanto vazias, o botão Assinar avisa
  que a compra chega na próxima atualização.

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

4. **Colar as chaves e buildar** — o código do app já chama o plugin sozinho
   (tela de assinatura do personal.html): basta preencher `MT_RC.android` e
   `MT_RC.ios` no `assets/cloud-config.js` com as chaves públicas do
   RevenueCat e gerar o build com o plugin instalado. O app usa o ID DA
   ACADEMIA como `appUserID` — é assim que o webhook acha a conta certa.
   Depois da compra o RevenueCat chama o webhook sozinho e o painel passa a
   mostrar "Assinatura ativa".

Regras das lojas pra não ser rejeitado:

- Dentro do app NUNCA mencionar o preço da web nem mandar pagar por fora
  (Apple rejeita na revisão). O painel já esconde a faixa com preço quando
  roda no app nativo.
- O preço da loja (R$ 59,90) é maior que o da web (R$ 49) por causa da
  comissão de 15% da Apple/Google — isso é permitido, só não pode ser
  anunciado dentro do app.
