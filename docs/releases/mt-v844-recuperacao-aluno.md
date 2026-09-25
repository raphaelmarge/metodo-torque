# mt-v844 — Recuperação do acesso do aluno

Base: `40ff23111f93dd9769234382593197a249077041` (mt-v843).

## Fluxo e escopo

A entrada compartilhável é `https://www.torqueon.com.br/aluno-login.html`.
`app/index.html` precisa de token individual ou sessão já guardada.

A tela agora oferece **Esqueci minha senha**. O aluno informa o e-mail usado
como login e recebe um link de uso único, com validade de 20 minutos. O link
abre a criação/confirmação da senha, inclusive com outra sessão guardada no
aparelho. O segredo sai do endereço após a leitura. O sucesso retorna ao
login, sem abrir automaticamente outro aluno nem apagar registros locais.
Logins por celular continuam com recuperação assistida pelo profissional.

A recuperação usa o login próprio de `app_aluno`, não Supabase Auth.
Nenhuma migração das contas existentes, ficha, pacote, agenda ou registro.

## Servidor

- Migração `20260925012235_aluno_recuperacao_acesso.sql`, criada pelo CLI.
- Tabelas privadas com RLS e sem acesso de anon/authenticated.
- RPCs SECURITY INVOKER executáveis somente por service_role.
- Segredo aleatório de 256 bits; somente SHA-256 fica no banco.
- Nova senha: mínimo de 8 caracteres e máximo de 72 bytes (bcrypt).
- Comparação atômica com a senha/login anteriores impede repetição, inclusive
  concorrente, e invalida links após alteração da senha/login ou revogação.
- A troca comprovada limpa somente o contador de tentativas do login recuperado.
- 60 segundos entre pedidos, até três links/hora por login e teto global
  conservador de 100 pedidos/dia. Resposta pública genérica para conta ausente,
  limite atingido e envio recusado, sem expor cadastro ou token do app.
- Edge `aluno-recupera` com verify_jwt habilitado. O gateway aceita a chave
  pública do site; **a autorização da troca é o segredo recebido por e-mail**.
- Reutiliza secrets existentes `RESEND_API_KEY`, `EMAIL_DE`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`. Não recebe destinatário/HTML/redirect livres.
- Envio em background com EdgeRuntime.waitUntil, template fixo HTML/texto,
  chave de idempotência, timeouts e logs sem dados pessoais ou segredos.
- Preserva o contrato legado de links/sessões do aluno: trocar a senha **não
  revoga os links de acesso já emitidos**. A revogação desses links continua
  sendo a ação do profissional; não declarar encerramento global de sessões.

## Evidência local

- PGlite com pgcrypto: 22 verificações aprovadas, incluindo permissões,
  expiração, repetição, revogação, mudança de senha e preservação de dados.
- Handler da Edge com serviços fictícios: 12 verificações aprovadas.
- Versão/precache: 17 verificações aprovadas; versão nos três marcadores.
- Regressões existentes: 13 de autenticação do profissional, 18 de recuperação
  móvel, 13 de identidade/reconexão e 15 de concorrência lógica, aprovadas.
- Sintaxe dos scripts de aluno-login e git diff --check aprovados.
- Chromium local não iniciou: sandbox recusou socket() com EPERM. Nenhuma
  verificação de navegador local é declarada aprovada.
- Nova suíte Playwright cobre 320/390/1280 px, pedido, cooldown, senha
  divergente, segredo fora da URL, sessão anterior, sucesso, expiração,
  falha de rede e ausência de overflow. O CI canônico executa esta suíte
  junto com as existentes de player, GIFs, tema, treinos e sincronização.
- Com PGTESTURL local, a suíte SQL também usa duas conexões PostgreSQL reais
  e exige um único consumo bem-sucedido do mesmo link.

## Sequência de implantação

1. CI completo aprovado no commit revisado.
2. Aplicar migração aditiva e conferir privilégios/RLS; publicar Edge.
3. Conferir handler em caso inválido, sem envio real nem alteração de aluno.
4. Integrar frontend; Pages deve publicar o artefato do mesmo commit testado.
5. Conferir versão servida e tela pública. Registrar resultados no PR.

Este documento descreve a preparação; o status de integração/implantação
é registrado no PR. Não significa que essas etapas já foram executadas.

## Aceite no iPhone físico — permanece necessário

Registrar modelo, iOS, Safari/atalho e versão carregada. Não limpar dados para
contornar problemas. Usar conta de teste identificada e anotar cada resultado:

- [ ] Abrir login e recuperar senha; receber e-mail, trocar e entrar novamente.
- [ ] Gerar → revisar → aplicar → voltar → ajustar → reabrir → publicar treino;
      conferir a confirmação junto às ações e a ficha recebida pelo aluno.
- [ ] Receber no celular o aluno criado no PC e selecionar pelo nome.
- [ ] Registrar série, ficar sem internet, reabrir e reconectar sem perda nem
      duplicação; conferir conflitos preservando os dois trabalhos.
- [ ] Player, GIFs, cores personalizadas e conclusão no Safari e no atalho.

WebKit em Linux ou viewport de iPhone não substitui esse aceite. Nenhum
cadastro real foi usado nos testes locais nem se atesta entrega na caixa real.
