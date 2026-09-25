// Recuperação do login próprio do aluno (não é uma conta Supabase Auth).
// Sem SDK/dependências. O segredo aleatório só segue por e-mail; o banco recebe SHA-256.
const CORS = {
  'Access-Control-Allow-Origin': 'https://www.torqueon.com.br',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const GENERICA = 'Se este e-mail estiver cadastrado como login, você receberá um link para criar uma nova senha. Confira também o spam.';
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
async function rpc(name, body) {
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(Deno.env.get('SUPABASE_URL') + '/rest/v1/rpc/' + name, {
    method: 'POST', headers: { apikey: svc, Authorization: 'Bearer ' + svc, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error('rpc');
  return r.json();
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);
  // O gateway verifica JWT; chave pública não autoriza uma troca de senha.
  // A troca exige ainda o segredo de 256 bits recebido na caixa do aluno.
  let body;
  try {
    if (Number(req.headers.get('content-length') || 0)>4096) return json({erro:'Pedido inválido.'},400);
    const raw = await req.text();
    if (raw.length>4096) return json({erro:'Pedido inválido.'},400);
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('json');
  } catch { return json({ erro: 'Pedido inválido.' }, 400); }
  try {
    if (body.acao === 'solicitar') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email.length>254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: 'Informe o e-mail usado como login. Para login por celular, peça o acesso ao seu personal.' },400);
      const chave = Deno.env.get('RESEND_API_KEY'), de = Deno.env.get('EMAIL_DE');
      if (!chave || !de) return json({ erro: 'A recuperação está indisponível agora. Peça o acesso ao seu personal.' },503);
      const segredo = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join('');
      const digest = await hash(segredo);
      const dest = await rpc('aluno_recuperacao_inicia', {p_email:email,p_hash:digest});
      if (dest.email) {
        // Destino e conteúdo são determinados pelo servidor, nunca pelo HTML do cliente.
        const link = 'https://www.torqueon.com.br/aluno-login.html#recuperar=' + segredo;
        const text = 'Crie uma nova senha para o TORQUE ON: '+link+'\nEste link é de uso único e expira em 20 minutos. Se não foi você, ignore este e-mail. Sua senha só muda após a confirmação.';
        const html = '<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#241a36"><h1 style="font-size:24px">Crie sua nova senha</h1><p>Você pediu para recuperar o acesso de aluno ao TORQUE ON.</p><p><a href="'+link+'" style="display:inline-block;background:#6d28d9;color:#fff;padding:14px 24px;border-radius:8px">Criar nova senha</a></p><p>Link de uso único, válido por 20 minutos.</p><p>Se não foi você, ignore este e-mail. Sua senha só muda após a confirmação.</p></body></html>';
        // Mesma resposta pública para existente/inexistente/limite/falha de entrega.
        // Falhas são registradas sem endereço, segredo ou corpo da resposta.
        const envio = (async () => { try {
          const r = await fetch('https://api.resend.com/emails', {method:'POST',headers:{Authorization:'Bearer '+chave,'Content-Type':'application/json','Idempotency-Key':'aluno-recupera/'+digest},body:JSON.stringify({from:de,to:[dest.email],subject:'Crie uma nova senha — TORQUE ON',html,text}),signal:AbortSignal.timeout(10000)});
          if (!r.ok) console.error('aluno-recupera: envio recusado',r.status);
        } catch { console.error('aluno-recupera: envio indisponível'); } })();
        EdgeRuntime.waitUntil(envio);
      }
      return json({ok:true,mensagem:GENERICA});
    }
    if (body.acao === 'concluir') {
      const segredo = typeof body.segredo === 'string' ? body.segredo : '';
      const senha = typeof body.senha === 'string' ? body.senha : '';
      if (!/^[a-f0-9]{64}$/.test(segredo) || senha.length<8 || new TextEncoder().encode(senha).length>72) return json({erro:'Use o link do e-mail e uma senha de 8 a 72 bytes.'},400);
      const result = await rpc('aluno_recuperacao_conclui',{p_hash:await hash(segredo),p_senha:senha});
      return result.ok ? json({ok:true}) : json({erro:'Este link expirou ou já foi usado. Solicite outro.'},400);
    }
    return json({erro:'Pedido inválido.'},400);
  } catch { return json({erro:'Não foi possível concluir agora. Tente novamente.'},503); }
});
