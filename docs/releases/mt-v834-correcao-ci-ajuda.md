# mt-v834 — correção da validação da ajuda

Base: `35f84fb7919a9538ae0c2144a581b854ac1066cc`, PR #843. Falha examinada: workflow `34912639984`, job `104203312661`, artefato `evidencias-testes-34912639984-1`. O lote executou 108 suítes e duas reprovaram.

## Causas verificadas

- `test-infra.js`: a regra existente exige o caminho explícito `require('./_nuvem.js')`. A nova suíte de ajuda já utilizava `comMockNuvem`, mas importava `./_nuvem` sem extensão. Corrigida a importação, sem alterar ou dispensar a regra de infraestrutura.
- `test-personal.js`: a verificação de orientação ainda buscava o caminho antigo resumido `Personalização → Loja`. A ajuda revisada deixou a instrução genérica. O destino real, conferido em `assets/personal-ferramentas.js`, é `Personalização → Benefícios e loja → Loja do app`. A resposta agora informa o caminho completo e o teste anterior exige essa mesma orientação, mantendo as demais verificações de nomes, navegação e dados.

## Cobertura acrescentada

O contrato editorial exige que o caminho completo esteja na resposta da Loja, não em comentários. A suíte de interface abre essa resposta e percorre Personalização, Benefícios e loja e Loja do app, verificando o campo de produto e a ação de cadastro sem executar qualquer gravação. A preservação integral de `ptStudio` continua sendo verificada após a navegação. A importação canônica também é verificada antes da suíte longa.

Não há mudança em cancelamentos, valores, estornos, identidade opcional, banco, autenticação, sincronização, dependências ou workflows permanentes de teste/publicação. A versão proposta continua mt-v834, ainda não publicada quando esta correção foi preparada.

## Validação e publicação

Resultados de testes e o HEAD aprovado devem ser consultados no PR. A preparação direcionada não substitui a suíte completa do commit final nem comprova deploy. O Chromium local recusou navegação com `ERR_BLOCKED_BY_ADMINISTRATOR`; a interface é exercitada no GitHub Actions com dados fictícios. Nenhuma conta ou operação financeira real é usada nos testes.
