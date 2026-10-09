# mt-v860 — Demos separadas do Torque Nutri

O paciente e o nutricionista têm entradas próprias, usando os mesmos componentes
e dados fictícios da plataforma:

- `/nutri/demo-paciente.html`: abre Meu dia, com alimentação, evolução e Menu do paciente.
- `/nutri/demo-nutricionista.html`: abre o consultório, com seus pacientes e módulos.

Cada entrada conserva seu perfil durante a navegação e ao recarregar. As demos
não mostram o botão de troca de perfil nem criam um cliente Supabase. Sessão,
convites, cache clínico e fila de uma conta real permanecem intactos e não são
carregados. Entrar na minha conta abre a entrada normal com o perfil correto.
Parâmetros de login, convite ou recuperação não desviam uma URL de demonstração.
Os dados do demo são fictícios; alguns rascunhos locais podem durar até fechar a aba.

As duas páginas compartilham `app.js`, estilos, componentes e catálogos existentes.
Não carregam o SDK Supabase nem o manifesto que inicia a conta real. O cache Nutri
v7 inclui ambas as entradas; a versão do ecossistema passa a mt-v860 nos três
arquivos canônicos. A entrada principal e as demos legadas da raiz são preservadas.

Validação local: 71 checks Nutri (29 de Auth/isolamento, 18 de assets/cache,
16 de avaliação e oito de integração), wrapper 8/8 e 17 checks de versão aprovados.
As duas entradas renderizaram o perfil correto na prévia CUA; saída para conta
e retorno à demo do paciente também foram conferidos. CI e publicação são
registrados no PR antes da entrega; nenhuma mudança de banco ou SMTP nesta release.
