# Jornada do Personal com serviços descartáveis

Este diagnóstico adicional executa o navegador real sobre a fonte exata declarada em `source-base.json`. O verificador recusa alterações nos arquivos do produto ou SQL em relação a esse commit. O SHA do harness, hashes SHA256 de fontes e o manifesto dos contratos SQL acompanham o resultado.

O workflow separado só dispara na branch diagnóstica `codex/jornada-personal-auth-20261006` ou por acionamento manual. Não publica site, não aplica migração remota e não utiliza segredo de produção. Usa as versões travadas dos testes e Chromium.

## Prova executada

1. O harness existente cria PostgreSQL, Supabase Auth e PostgREST oficiais, em rede descartável interna. Executa **todos os 90 grupos HTTP existentes antes** deste diagnóstico.
2. O instalador complementar preserva os dados anteriores e oito funções já instaladas; acrescenta apenas contratos canônicos necessários para o app, extraídos das fontes com hashes e verificações de permissões.
3. A API administrativa do Auth **local** cria uma identidade fictícia já confirmada, ainda sem sessão e sem Personal. A senha é aleatória e não aparece nos artefatos.
4. O navegador usa o formulário de login verdadeiro. A sessão vem do Auth, a conta Personal vem de `criar_personal`, o cadastro mínimo e a ficha vêm de cliques e campos da interface. O banco é observado para verificar os efeitos; não injeta esses dados no app.
5. O Personal revisa e publica a primeira prescrição pelo botão da tela. O aluno novo não recebe token antecipado por fixture, convite, contrato ou mensagem.
6. Outro contexto vazio abre `/app/` com o token realmente publicado, confere a ficha e registra uma série. A confirmação é verificada no evento persistido pelo servidor.
7. A musculação é concluída pela interface. Em seguida, o aluno inicia uma **corrida livre com distância fictícia digitada manualmente** e um **circuito livre For Time**. Cada atividade é pausada, passa por recarga real da página e é retomada pelos botões da tela. O roteiro confere a mesma sessão, o tempo parado durante a pausa, os quilômetros e as voltas preservados.
8. A finalização das duas atividades precisa chegar ao PostgreSQL: um início e um encerramento por sessão, resultado atual sem conflito, parentes de revisão válidos, duração ativa e origem manual correta. Nenhuma rota GPS é inventada. Um terceiro contexto inicialmente vazio consulta o histórico real do servidor e deve recuperar as três modalidades concluídas, com os mesmos resultados.
9. Após cada confirmação no banco, uma leitura simultânea exige o estado global `sincronizado` e o mesmo estado/texto no nó dedicado do recibo. Os três recibos são rolados à vista e capturados. A prova anterior em c7 preserva a falha de texto; esta execução verifica a fonte mt-v856 declarada no manifesto.

Essas etapas adicionais cobrem execução, pausa, retomada e histórico dos **modos livres**. Não comprovam criar, prescrever e publicar corrida ou circuito pelo Personal. Os tempos curtos são medidos pelo cronômetro real do navegador durante o teste; não representam atividade física. A localização é explicitamente negada pelo contexto do navegador, sem substituir APIs nem fornecer coordenadas.

## Transporte e limites

`local-server.cjs` serve os arquivos do checkout, sem alterar seu conteúdo. A única substituição é a resposta de `assets/cloud-config.js`: origem local, chave anônima do banco descartável e mídia externa desligada. As rotas Auth/PostgREST são encaminhadas a duas origens loopback fixas; não seguem redirects. A chave de serviço nunca entra no navegador. Routes de funções externas retornam indisponibilidade, jamais sucesso simulado; o navegador também recusa rede externa, WebSocket e service worker.

O teste não valida cadastro Auth por e-mail, entrega ou confirmação de e-mail, gateway hospedado, pagamentos, IA, notificações, conversa/agenda/nutrição além da navegação mínima, mídias externas, GPS nem produção. As rotas secundárias não instaladas podem retornar erros reais, registrados no inventário. Um fracasso do fluxo principal torna o resultado vermelho; não há fallback para mocks ou outro caminho de publicação.

Os artefatos incluem capturas de usuários fictícios e JSON de fases, fontes e status de rotas sem querystrings, corpos, tokens ou senhas. Não há trace, HAR, dumps de banco nem storage state. A limpeza original destrói todo o stack mesmo em falha.

## Verificações locais sem Auth

`node tests/personal-journey-ci/test-transport.cjs` e `node tests/personal-journey-ci/test-application-contracts.js` verificam isolamento e extração. Eles **não** demonstram login, instalação SQL ou jornada completa. A execução real fica restrita ao workflow Linux com as guardas do harness existente; não exige instalar Docker local.
