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
