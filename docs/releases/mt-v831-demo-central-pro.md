# mt-v831 — Demo direto da Central Pro

## Resultado

`demo-central-pro.html` abre diretamente a Central Pro, sem cadastro, login ou questionário inicial. São os mesmos cinco painéis e handlers de `assets/personal-pro-suite.js`, com o tema atual do Personal. As demais áreas e demonstrações permanecem disponíveis.

O demo permite revisar um CSV de exemplo ou arquivo próprio, salvar a importação, iniciar e concluir uma sessão presencial com séries, criar regras e simular eventos, registrar espera e créditos, e atribuir responsável/substituto a três alunos fictícios.

## Isolamento e limites

- O adaptador dedicado mantém oito coleções somente em memória. Não lê nem escreve localStorage, sessionStorage, IndexedDB ou cookies, não carrega SDK e não contata APIs. A política CSP bloqueia conexões.
- Toda gravação afeta apenas esta demonstração. Atualizar a página ou usar **Recomeçar demo** restaura os exemplos; nenhuma conta real é alterada.
- As simulações de automação criam providências fictícias apenas para regras ativas. Não enviam mensagens, cobram, assinam ou publicam dados para alunos.
- A importação preserva os formatos efetivamente suportados pelo módulo. CSV, JSON e TXT funcionam; PDF/Excel exigem parsers opcionais que esta página não carrega. Arquivos sem suporte exibem erro, sem indicar sucesso.
- A prévia da importação é para revisão, não uma tabela editável. A demonstração não acrescenta capacidades ao módulo real.

## Arquivos e verificação

- Entrada e camada dedicada: `demo-central-pro.html`, `assets/demo-central-pro.js`, `assets/demo-central-pro.css`, `assets/demo-central-pro-data.js`.
- O módulo de produção, os contratos do aluno e o Supabase não foram modificados. Versão sincronizada em `assets/versao.js`, `sw.js` e `app/app-sw.js`; novos arquivos no precache raiz.
- `tests/test-demo-central-pro.js`: cinco abas e fluxos, erros de entrada, regras ativas/pausadas, reinicialização e preservação do armazenamento; larguras 320, 390, 768 e 1280 nos dois temas; nenhuma chamada de API, escrita de rede ou erro de página.
- Testes de versão e da Central Pro preservados. A checagem desta última aceita versões futuras, mantendo sincronismo entre os dois service workers e a versão pública.
- Publicação condicionada ao workflow completo do commit que será servido e à conferência pública de `release-info.json`.
