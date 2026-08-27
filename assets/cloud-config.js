// Conexão com a nuvem (Supabase) — login com senha + sincronização online.
//
// COMO ATIVAR (uma vez, ~10 minutos):
//   1. Crie um projeto gratuito em https://supabase.com
//   2. No painel: SQL Editor → cole e execute o conteúdo de supabase-setup.sql
//   3. Em Project Settings → API, copie a "Project URL" e a chave "anon public"
//   4. Preencha os dois campos abaixo e publique
//   (Opcional: em Authentication → Providers → Email, desligue "Confirm email"
//    para o aluno entrar direto após criar a conta.)
//
// Enquanto url/anonKey estiverem vazios, o portal usa o modo local
// (código de acesso + cadastro salvo no aparelho, sem sincronização).
self.MT_CLOUD = {
  url: "https://hdcufkaalxfhwmfwoiqp.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhkY3Vma2FhbHhmaHdtZndvaXFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzOTI2NzksImV4cCI6MjA5ODk2ODY3OX0.Y-hldMsLQot4dgR5ijssTxGX5ztEJURr81lPrZTzHds",
};

// Chave do mapa (CARTO) — os ladrilhos de rua do app do aluno.
//
// POR QUE EXISTE: em 2026-08 o CARTO passou a exigir chave. Sem ela, os
// ladrilhos ainda baixam, mas vêm com "API KEY REQUIRED" carimbado NA IMAGEM.
// Nenhum teste automático enxerga isso — a imagem carrega normal, o carimbo
// está dentro dela. Só o olho pega.
//
// COMO PEGAR (grátis, ~3 minutos):
//   1. Crie a conta em https://carto.com  (plano gratuito serve)
//   2. No painel: Settings → Developers → Basemap API keys → Create
//   3. Restrinja ao domínio www.torqueon.com.br (a chave é PÚBLICA: ela vai
//      dentro do app, como a anonKey do Supabase — a restrição por domínio é
//      o que impede outra pessoa de gastar a sua cota)
//   4. Cole abaixo e publique
//
// Vazia = o app segue funcionando, só com o carimbo nos três estilos do CARTO
// (Escuro, Claro e Colorido). "Ruas (OSM)" e "Satélite" não usam chave nenhuma
// e nunca são carimbados.
self.MT_MAPA = {
  cartoKey: "",
};

// Apelido de função: quando uma Edge Function tem que atender por OUTRO nome.
//
// Serve pra um caso real: no projeto do dono, o portão do Supabase ("Verify
// JWT") passou a recusar até crachá bom, e SÓ numa função — a chat-envia
// devolvia 401 enquanto a envia-email, chamada do mesmo jeito, respondia 200.
// Quando isso acontece, a saída rápida é criar uma função NOVA com o mesmo
// código e outro nome (com o Verify JWT desmarcado já na criação, que é mais
// confiável do que desligar depois) e apontar o apelido aqui. O site tenta o
// nome de sempre e, se o portão recusar, repete a chamada no apelido — e passa
// a usar o apelido até recarregar a página.
//
// Exemplo: self.MT_FN_APELIDO = { "chat-envia": "chat-envia2" };
self.MT_FN_APELIDO = {};

// Banco de GIFs dos exercícios (Supabase Storage, bucket PÚBLICO).
//
// É do dono do sistema e serve TODO MUNDO: o app monta o endereço do GIF na
// hora, a partir do nome do exercício — nada de guardar 1619 links no registro
// de cada aluno. Enquanto 'bucket' estiver vazio, o app segue só com o vídeo
// que o professor colar no exercício.
//
// Pra descobrir o bucket e o padrão do seu projeto, abra
// www.torqueon.com.br/gifs.html — a página testa sozinha e diz o que preencher.
//
// padrao: como o arquivo se chama a partir do nome do exercício
//   "traco"     → supino-reto-com-barra.gif
//   "sublinha"  → supino_reto_com_barra.gif
//   "espaco"    → Supino reto com barra.gif
//   "junto"     → supinoretocombarra.gif
// acento: true mantém os acentos no nome do arquivo; false tira (padrão)
// ext: extensão dos arquivos ("gif", "webp", "mp4"...)
self.MT_GIFS = {
  bucket: "",
  padrao: "traco",
  acento: false,
  ext: "gif",
};

// Assinatura pelas lojas (RevenueCat) — chaves PÚBLICAS do SDK, uma por
// plataforma (RevenueCat → Projeto → API Keys). Pode ficar no site, igual à
// anonKey. Enquanto vazias, o botão Assinar avisa que a compra chega na
// próxima atualização do app.
self.MT_RC = {
  android: "",
  ios: "",
};
