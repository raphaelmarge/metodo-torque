// TORQUE ON — Pagamentos por profissional · link de cobrança no gateway DELE
//
// Esta função roda no SUPABASE e gera o link de cobrança (cartão/Pix/boleto)
// usando a conta do PRÓPRIO personal/academia — Mercado Pago, Asaas ou
// Pagar.me, o que ele escolher em Configurações → Pagamentos. O dinheiro do
// aluno cai DIRETO na conta do professor: o dono do sistema nunca recebe nem
// repassa nada (mesmo modelo do WhatsApp: cada um com a própria conta).
//
// Baixa automática: cada link sai carimbado com a referência do aluno
// ("mt|<alunoId>|<origem>") e apontando pro webhook pagamentos-webhook — no
// Mercado Pago pela notification_url do próprio link, no Asaas por um webhook
// criado UMA vez pela API na conta do professor. Quando o aluno paga, o
// gateway avisa, o webhook confere e grava, e o painel dá baixa sozinho.
//
// A chave do gateway mora na tabela pag_config (selada, RLS sem política) e só
// é lida aqui, com a service key — ela NUNCA volta pro navegador.
//
// Split do dono (modelo marketplace, Asaas): a comissão de cada academia mora
// em pag_config.comissao_pct e NASCE EM 0 — sem split, o professor recebe
// 100%. Pra ligar: crie o Secret ASAAS_WALLET_DONO (a carteira Asaas do dono
// do sistema) e suba a comissao_pct da academia; a cobrança seguinte já sai
// dividida sozinha, sem republicar nada.
//
// Como instalar (uma vez):
//   1. Rode o bloco PAGAMENTOS POR PROFISSIONAL do supabase-setup.sql
//      (e o BAIXA AUTOMÁTICA MULTI-GATEWAY, da mesma família).
//   2. Deploy desta função com o nome: pagamentos (Verify JWT DESLIGADO — ela
//      valida o login sozinha). Publique também a pagamentos-webhook.
//
// Ações (POST JSON, sempre com o login do profissional no Authorization):
//   { acao: "ping" }                                → { ok, provedor, temChave }
//   { acao: "loja", t, item }                       → { ok, link } (chamada do ALUNO, preço do servidor)
//   { acao: "link", valorCentavos, descricao, nome, email?, alunoId?, origem? }
//     → { ok, link, linkId } — página de pagamento do gateway do profissional
//   { acao: "assinar", alunoId, valorCentavos, descricao, nome, cpf, email?, venc? }
//     → { ok, assinaturaId, link } — cobrança automática mensal (Asaas)
//   { acao: "assinatura_status", assinaturaId }     → { ok, status, valor, proximaCobranca }
//   { acao: "assinatura_cancela", assinaturaId }    → { ok }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/* Valida o token DE VERDADE, perguntando pro próprio Supabase quem é o dono
 * dele (mesmo desenho das outras funções — Verify JWT fica desligado e a porta
 * continua fechada pra token forjado e pra chave pública). */
async function usuarioValidado(req: Request): Promise<{ id: string; email: string } | null> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!jwt || (anon && jwt === anon)) return null; // chave pública não é usuário
  try {
    const r = await fetch((Deno.env.get("SUPABASE_URL") || "") + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + jwt, apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "" },
    });
    if (!r.ok) return null;
    const u = await r.json();
    if (!u || !u.id) return null;
    return { id: String(u.id), email: String(u.email || "") };
  } catch { return null; }
}

type Cfg = { aid: string; provedor: string; chave: string; webhookToken: string; asaasWebhookId: string; comissaoPct: number };

// a configuração de pagamento de UMA academia (lida com a service key) —
// serve o caminho do professor (configDe) e a loja do app (v701)
async function configDaAcademia(aid: string): Promise<Cfg | null> {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key || !aid) return null;
  const heads = { apikey: key, Authorization: "Bearer " + key };
  try {
    // projeto que ainda não rodou o SQL novo: as colunas do webhook podem não
    // existir — tenta com elas e, se der erro, busca só o básico (o link sai
    // igual, a baixa automática é que fica esperando o SQL)
    let c: any = null;
    let rc = await fetch(url + "/rest/v1/pag_config?select=provedor,chave,comissao_pct,webhook_token,asaas_webhook_id&academia_id=eq." + aid, { headers: heads });
    if (rc.ok) c = (await rc.json())?.[0];
    else {
      rc = await fetch(url + "/rest/v1/pag_config?select=provedor,chave,comissao_pct&academia_id=eq." + aid, { headers: heads });
      c = rc.ok ? (await rc.json())?.[0] : null;
    }
    if (!c || !c.provedor || !c.chave) return null;
    return {
      aid: String(aid),
      provedor: String(c.provedor),
      chave: String(c.chave),
      webhookToken: String(c.webhook_token || ""),
      asaasWebhookId: String(c.asaas_webhook_id || ""),
      comissaoPct: Number(c.comissao_pct || 0) || 0,
    };
  } catch { return null; }
}

// a configuração de pagamento da academia de quem chamou (professor autenticado)
async function configDe(userId: string): Promise<Cfg | null> {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key || !userId) return null;
  const heads = { apikey: key, Authorization: "Bearer " + key };
  try {
    const rm = await fetch(url + "/rest/v1/membros?select=academia_id&limit=1&user_id=eq." + encodeURIComponent(userId), { headers: heads });
    const membros = rm.ok ? await rm.json() : [];
    const aid = membros?.[0]?.academia_id;
    if (!aid) return null;
    return await configDaAcademia(String(aid));
  } catch { return null; }
}

// a URL que o gateway vai chamar quando o pagamento cair (dupla academia+senha)
function urlWebhookDe(cfg: Cfg): string {
  if (!cfg.webhookToken) return "";
  return (Deno.env.get("SUPABASE_URL") || "") + "/functions/v1/pagamentos-webhook?aid=" +
    encodeURIComponent(cfg.aid) + "&k=" + encodeURIComponent(cfg.webhookToken);
}

// Asaas: garante que a conta do professor tem o webhook apontado pra cá (cria
// UMA vez pela API e guarda o id). Falhou? Segue a vida — o link sai igual,
// só a baixa automática espera a próxima tentativa.
async function garanteWebhookAsaas(cfg: Cfg, emailDono: string): Promise<void> {
  const hook = urlWebhookDe(cfg);
  if (!hook || cfg.asaasWebhookId) return;
  try {
    const resp = await fetch("https://api.asaas.com/v3/webhooks", {
      method: "POST",
      headers: { access_token: cfg.chave, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "TORQUE ON — baixa automática",
        url: hook,
        email: emailDono || "contato@torqueon.com.br",
        enabled: true,
        interrupted: false,
        apiVersion: 3,
        authToken: cfg.webhookToken,
        sendType: "SEQUENTIALLY",
        events: ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_OVERDUE", "PAYMENT_REFUNDED"],
      }),
    });
    const d: any = await resp.json().catch(() => ({}));
    if (resp.ok && d.id) {
      const url = Deno.env.get("SUPABASE_URL") || "";
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      await fetch(url + "/rest/v1/pag_config?academia_id=eq." + encodeURIComponent(cfg.aid), {
        method: "PATCH",
        headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ asaas_webhook_id: String(d.id) }),
      });
      cfg.asaasWebhookId = String(d.id);
    }
  } catch { /* sem drama: tenta de novo no próximo link */ }
}

// Split do dono do sistema (modelo marketplace, Asaas): a comissão da academia
// (pag_config.comissao_pct) nasce em 0 e o Secret ASAAS_WALLET_DONO guarda a
// carteira do dono. Com comissão 0 OU sem carteira configurada, NENHUM split é
// enviado — o professor recebe 100%, como sempre. Subir a comissão no futuro é
// só trocar o número na pag_config: o split entra na cobrança seguinte sozinho.
function splitDono(cfg: Cfg): any[] | null {
  const wallet = (Deno.env.get("ASAAS_WALLET_DONO") || "").trim();
  const pct = Number(cfg.comissaoPct || 0);
  if (!wallet || !(pct > 0) || pct >= 100) return null;
  // o Asaas aceita até 4 casas decimais no percentual
  return [{ walletId: wallet, percentualValue: Math.round(pct * 10000) / 10000 }];
}

// ---------- um adaptador por gateway: entra {valor, descricao, nome, email, ref}, sai {link, linkId} ----------

async function linkMercadoPago(cfg: Cfg, valorReais: number, descricao: string, nome: string, email: string, ref: string) {
  const corpo: any = {
    items: [{ title: descricao, quantity: 1, currency_id: "BRL", unit_price: valorReais }],
    payer: email ? { name: nome, email } : { name: nome },
    statement_descriptor: descricao.slice(0, 22),
  };
  // carimbo da baixa automática: referência do aluno + webhook deste link
  if (ref) corpo.external_reference = ref;
  const hook = urlWebhookDe(cfg);
  if (hook) corpo.notification_url = hook;
  const resp = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: "Bearer " + cfg.chave, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const d: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !d.init_point) throw new Error("Mercado Pago recusou: " + (d?.message || resp.status));
  return { link: String(d.init_point), linkId: String(d.id || "") };
}

async function linkAsaas(cfg: Cfg, valorReais: number, descricao: string, nome: string, ref: string) {
  const corpo: any = {
    name: (descricao + " — " + nome).slice(0, 200),
    value: valorReais,
    billingType: "UNDEFINED", // o aluno escolhe: Pix, cartão ou boleto
    chargeType: "DETACHED",
  };
  if (ref) corpo.externalReference = ref;
  const sp = splitDono(cfg);
  if (sp) corpo.split = sp;
  const resp = await fetch("https://api.asaas.com/v3/paymentLinks", {
    method: "POST",
    headers: { access_token: cfg.chave, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const d: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !d.url) {
    const det = d?.errors?.[0]?.description || d?.message || resp.status;
    throw new Error("Asaas recusou: " + det);
  }
  return { link: String(d.url), linkId: String(d.id || "") };
}

async function linkPagarme(cfg: Cfg, valorCentavos: number, descricao: string, nome: string, email: string, ref: string) {
  // checkout hospedado do Pagar.me: o aluno escolhe cartão, Pix ou boleto no link
  const customer: any = { name: nome, type: "individual" };
  if (email) customer.email = email;
  const corpo: any = {
    items: [{ amount: valorCentavos, description: descricao, quantity: 1, code: "mensalidade" }],
    customer,
    payments: [{
      payment_method: "checkout",
      checkout: {
        expires_in: 259200,
        customer_editable: true,
        skip_checkout_success_page: false,
        accepted_payment_methods: ["credit_card", "pix", "boleto"],
        credit_card: { operation_type: "auth_and_capture", installments: [{ number: 1, total: valorCentavos }] },
        pix: { expires_in: 259200 },
      },
    }],
  };
  if (ref) corpo.metadata = { mt_ref: ref };
  const resp = await fetch("https://api.pagar.me/core/v5/orders", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(cfg.chave + ":"), "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const d: any = await resp.json().catch(() => ({}));
  const urlCk = d?.checkouts?.[0]?.payment_url;
  if (!resp.ok || !urlCk) throw new Error("Pagar.me recusou: " + (d?.message || resp.status));
  return { link: String(urlCk), linkId: String(d.id || "") };
}

// ---------- cobrança automática mensal (assinatura) — Asaas por enquanto ----------

function erroAsaas(d: any, resp: Response): string {
  return String(d?.errors?.[0]?.description || d?.message || resp.status);
}

async function assinaAsaas(cfg: Cfg, corpo: any, ref: string) {
  const cpf = String(corpo.cpf || "").replace(/\D/g, "");
  if (cpf.length !== 11) throw new Error("O Asaas exige o CPF do aluno pra cobrança automática — preencha o CPF no cadastro dele.");
  const nome = String(corpo.nome || "").trim() || "Aluno";
  const email = String(corpo.email || "").trim();
  const valorReais = Math.round(Number(corpo.valorCentavos)) / 100;
  const descricao = String(corpo.descricao || "Mensalidade").slice(0, 120);
  // vencimento da primeira cobrança (o painel manda a data; padrão = hoje)
  const venc = /^\d{4}-\d{2}-\d{2}$/.test(String(corpo.venc || "")) ? String(corpo.venc) : new Date().toISOString().slice(0, 10);

  // 1. o cliente na conta Asaas do professor
  const cli: any = { name: nome, cpfCnpj: cpf };
  if (email) cli.email = email;
  const rc = await fetch("https://api.asaas.com/v3/customers", {
    method: "POST",
    headers: { access_token: cfg.chave, "Content-Type": "application/json" },
    body: JSON.stringify(cli),
  });
  const dc: any = await rc.json().catch(() => ({}));
  if (!rc.ok || !dc.id) throw new Error("Asaas recusou o cadastro do aluno: " + erroAsaas(dc, rc));

  // 2. a assinatura mensal — billingType UNDEFINED: a cada mês o Asaas gera a
  // cobrança e o aluno escolhe Pix, cartão ou boleto; o webhook dá a baixa.
  // O split configurado aqui vira MODELO: toda mensalidade gerada já nasce
  // dividida (comissão 0 = sem split, professor recebe 100%)
  const corpoAs: any = {
    customer: dc.id,
    billingType: "UNDEFINED",
    value: valorReais,
    nextDueDate: venc,
    cycle: "MONTHLY",
    description: descricao,
    externalReference: ref || undefined,
  };
  const spAs = splitDono(cfg);
  if (spAs) corpoAs.split = spAs;
  const ra = await fetch("https://api.asaas.com/v3/subscriptions", {
    method: "POST",
    headers: { access_token: cfg.chave, "Content-Type": "application/json" },
    body: JSON.stringify(corpoAs),
  });
  const da: any = await ra.json().catch(() => ({}));
  if (!ra.ok || !da.id) throw new Error("Asaas recusou a assinatura: " + erroAsaas(da, ra));

  // 3. o link da primeira cobrança, pro aluno já pagar agora
  let link = "";
  try {
    const rp = await fetch("https://api.asaas.com/v3/subscriptions/" + encodeURIComponent(da.id) + "/payments?limit=1", {
      headers: { access_token: cfg.chave },
    });
    const dp: any = await rp.json().catch(() => ({}));
    link = String(dp?.data?.[0]?.invoiceUrl || "");
  } catch { /* sem link agora: o Asaas envia a cobrança pro aluno mesmo assim */ }
  return { assinaturaId: String(da.id), link };
}

async function statusAssinaturaAsaas(cfg: Cfg, id: string) {
  const r = await fetch("https://api.asaas.com/v3/subscriptions/" + encodeURIComponent(id), {
    headers: { access_token: cfg.chave },
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.id) throw new Error("Asaas não achou a assinatura: " + erroAsaas(d, r));
  return { status: String(d.status || ""), valor: Math.round(Number(d.value || 0) * 100), proximaCobranca: String(d.nextDueDate || "") };
}

async function cancelaAssinaturaAsaas(cfg: Cfg, id: string) {
  const r = await fetch("https://api.asaas.com/v3/subscriptions/" + encodeURIComponent(id), {
    method: "DELETE",
    headers: { access_token: cfg.chave },
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.deleted) throw new Error("Asaas não cancelou: " + erroAsaas(d, r));
}

/* ---------- LOJA DO APP (v701): o ALUNO compra dentro do app ----------
 * Quem chama é o app do aluno, autenticado pelo TOKEN dele (mesma regra das
 * RPCs do app: token válido e não revogado). O PREÇO NUNCA vem do corpo —
 * sai do catálogo do professor sincronizado na tabela dados (chave
 * mtapp:ptStudio), senão o aluno pagaria R$ 0,01 num produto de R$ 100.
 * O link sai do gateway do PRÓPRIO professor, com ref mt|<alunoId>|loja —
 * a baixa entra pelo pagamentos-webhook como as outras, e o painel registra
 * COM desc (compra da loja não quita mensalidade). */
async function compraLoja(body: any): Promise<Response> {
  const t = String(body.t || "").trim();
  const item = String(body.item || "").trim().slice(0, 60);
  if (!t || !item) return json({ erro: "faltou o token ou o item." }, 400);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return json({ erro: "função sem credenciais." }, 500);
  const heads = { apikey: key, Authorization: "Bearer " + key };
  // 1) token de aluno VÁLIDO e não revogado
  const ra = await fetch(url + "/rest/v1/app_aluno?select=academia_id&token=eq." + encodeURIComponent(t) + "&revogado_em=is.null&limit=1", { headers: heads });
  const linha = ra.ok ? (await ra.json())?.[0] : null;
  if (!linha || !linha.academia_id) return json({ erro: "acesso do app inválido." }, 401);
  const aid = String(linha.academia_id);
  // 2) o catálogo e o preço saem do SERVIDOR
  const rd = await fetch(url + "/rest/v1/dados?select=valor&academia_id=eq." + aid + "&chave=eq." + encodeURIComponent("mtapp:ptStudio"), { headers: heads });
  const st = rd.ok ? (await rd.json())?.[0]?.valor : null;
  if (!st || typeof st !== "object") return json({ erro: "a loja ainda não sincronizou com a nuvem — peça pelo WhatsApp do seu personal." }, 409);
  const cfgSt: any = (st as any).config || {};
  const baixo = (s: unknown) => String(s || "").trim().toLowerCase();
  let achado: any = (cfgSt.lojaItens || []).find((p: any) => baixo(p.n) === baixo(item));
  if (!achado && !cfgSt.lojaServOff) {
    const sv = ((st as any).servicosPT || []).find((s2: any) => baixo(s2.nome) === baixo(item));
    if (sv) achado = { n: sv.nome, v: sv.valor };
  }
  const valorCentavos = achado ? Math.round(Number(achado.v) * 100) : 0;
  if (!valorCentavos || valorCentavos < 100) return json({ erro: "este item não está mais na loja — fale com o seu personal." }, 404);
  // 3) o aluno dono do token (pra referência da baixa) e o gateway da academia
  const aluno: any = ((st as any).alunos || []).find((x: any) => x.appTokenP === t) || null;
  const cfg = await configDaAcademia(aid);
  if (!cfg) return json({ erro: "sem-gateway" }, 400);
  const ref = aluno && aluno.id ? "mt|" + String(aluno.id).slice(0, 40) + "|loja" : "";
  const descricao = ("Loja do app — " + String(achado.n)).slice(0, 120);
  const nome = aluno && aluno.nome ? String(aluno.nome).slice(0, 60) : "Aluno";
  const email = aluno && aluno.email ? String(aluno.email).trim().slice(0, 120) : "";
  try {
    let r: { link: string; linkId: string };
    if (cfg.provedor === "mercadopago") r = await linkMercadoPago(cfg, valorCentavos / 100, descricao, nome, email, ref);
    else if (cfg.provedor === "asaas") {
      await garanteWebhookAsaas(cfg, email);
      r = await linkAsaas(cfg, valorCentavos / 100, descricao, nome, ref);
    } else if (cfg.provedor === "pagarme") r = await linkPagarme(cfg, valorCentavos, descricao, nome, email, ref);
    else return json({ erro: "provedor desconhecido: " + cfg.provedor }, 400);
    return json({ ok: true, link: r.link, provedor: cfg.provedor, valorCentavos });
  } catch (e) {
    return json({ erro: String((e as Error).message || e) }, 502);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ erro: "JSON inválido" }, 400); }

  // a loja do app é chamada pelo ALUNO (token do app, sem conta) — as outras
  // ações continuam exigindo o professor logado, como sempre
  if (body.acao === "loja") return await compraLoja(body);

  const usuario = await usuarioValidado(req);
  if (!usuario) {
    return json({ erro: "Entre na sua conta do TORQUE ON para usar esta função (a chave pública não basta)." }, 401);
  }

  const cfg = await configDe(usuario.id);

  if (body.acao === "ping") {
    return json({ ok: true, provedor: cfg ? cfg.provedor : null, temChave: !!cfg });
  }

  if (!cfg) {
    return json({ erro: "Nenhum gateway ligado nesta conta — escolha o seu em Configurações → Pagamentos e cole a chave." }, 400);
  }

  // referência que volta no webhook e diz DE QUEM é o pagamento — o id do aluno
  // é o do painel do professor, não identifica ninguém fora dele
  const alunoId = String(body.alunoId || "").slice(0, 40);
  const origem = ["mensal", "pacote", "carteira", "assin"].indexOf(String(body.origem || "")) >= 0 ? String(body.origem) : "mensal";
  const ref = alunoId ? "mt|" + alunoId + "|" + origem : "";

  if (body.acao === "link") {
    const valorCentavos = Math.round(Number(body.valorCentavos));
    if (!valorCentavos || valorCentavos < 100) return json({ erro: "valorCentavos inválido (mínimo 100 = R$ 1,00)." }, 400);
    const valorReais = Math.round(valorCentavos) / 100;
    const descricao = String(body.descricao || "Mensalidade").slice(0, 120);
    const nome = String(body.nome || "").trim() || "Aluno";
    const email = String(body.email || "").trim();
    try {
      let r: { link: string; linkId: string };
      if (cfg.provedor === "mercadopago") r = await linkMercadoPago(cfg, valorReais, descricao, nome, email, ref);
      else if (cfg.provedor === "asaas") {
        await garanteWebhookAsaas(cfg, usuario.email);
        r = await linkAsaas(cfg, valorReais, descricao, nome, ref);
      } else if (cfg.provedor === "pagarme") r = await linkPagarme(cfg, valorCentavos, descricao, nome, email, ref);
      else return json({ erro: "provedor desconhecido: " + cfg.provedor }, 400);
      return json({ ok: true, link: r.link, linkId: r.linkId, provedor: cfg.provedor });
    } catch (e) {
      return json({ erro: String((e as Error).message || e) }, 502);
    }
  }

  if (body.acao === "assinar") {
    if (cfg.provedor !== "asaas") {
      return json({ erro: "Por enquanto a cobrança automática funciona com o Asaas — no " + cfg.provedor + " use o Link de pagamento por mês." }, 400);
    }
    const valorCentavos = Math.round(Number(body.valorCentavos));
    if (!valorCentavos || valorCentavos < 100) return json({ erro: "valorCentavos inválido (mínimo 100 = R$ 1,00)." }, 400);
    try {
      await garanteWebhookAsaas(cfg, usuario.email);
      const r = await assinaAsaas(cfg, body, alunoId ? "mt|" + alunoId + "|assin" : "");
      return json({ ok: true, assinaturaId: r.assinaturaId, link: r.link, provedor: cfg.provedor });
    } catch (e) {
      return json({ erro: String((e as Error).message || e) }, 502);
    }
  }

  if (body.acao === "assinatura_status" || body.acao === "assinatura_cancela") {
    if (cfg.provedor !== "asaas") {
      return json({ erro: "Esta assinatura foi criada no Asaas, mas o gateway ligado agora é " + cfg.provedor + " — a chave Asaas não está mais guardada. Religue o Asaas em Configurações → Receber dos alunos, ou cancele a assinatura direto no site asaas.com." }, 400);
    }
    const id = String(body.assinaturaId || "").trim();
    if (!id) return json({ erro: "assinaturaId vazio." }, 400);
    try {
      // a chave usada é sempre a do PRÓPRIO professor — assinatura de outra
      // conta simplesmente não existe pra ela
      if (body.acao === "assinatura_status") {
        const s = await statusAssinaturaAsaas(cfg, id);
        return json({ ok: true, status: s.status, valor: s.valor, proximaCobranca: s.proximaCobranca });
      }
      await cancelaAssinaturaAsaas(cfg, id);
      return json({ ok: true });
    } catch (e) {
      return json({ erro: String((e as Error).message || e) }, 502);
    }
  }

  return json({ erro: "acao desconhecida (use ping, link, loja, assinar, assinatura_status ou assinatura_cancela)." }, 400);
});
