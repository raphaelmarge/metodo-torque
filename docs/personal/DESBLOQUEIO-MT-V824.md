# Desbloqueio mt-v824 — issue #826

Base conferida: `102fcdbc4f5c83dc3ec0aa18cb32d4d6dd0dc176`, árvore `154261c34527c210f5396f6a6ed0a434f842e6bb`. Preserva integralmente as entregas #823, #827 e #828.

## Alimentação: defeito reproduzido e correção

A lista de registros recriava seu innerHTML a cada render, removendo o botão, expansão e foco. Um teste DOM sobre o HTML, CSS e módulo canônicos falhou antes da correção ao conferir a identidade do nó após `render()`. O diagnóstico remoto encontrou o botão entre y=793 e 837, sob a navegação fixa entre y=773 e 844 no viewport 390×844.

A lista agora mantém os nós quando o conteúdo não mudou; em mudanças preserva expansão/foco apenas para o mesmo registro e a mesma identidade (conta, aluno, token). Filtros e troca de identidade não recuperam elementos removidos. Ao abrir ou focar a ação encoberta pelo rodapé, desloca somente o trecho necessário. Não oculta a navegação nem força cliques. O perfil do aluno usa a mesma atualização estável.

O teste novo passou em 26 verificações locais, nos temas claro/escuro e larguras 320/390/1280, com clique nativo, foco, filtro, atualização e troca de aluno/conta. A suíte de nutrição existente também ganhou o cenário de render entre abrir o registro e clicar.

## Sincronização: testar o evento, não um contador após 50 ms

O diagnóstico remoto executou a suíte Personal completa e passou; o trecho registrou uma chamada `dados_cas`, fila vazia e reconciliação concluída. Não foi reproduzido um defeito no motor que explique conclusivamente o resultado intermitente anterior. Não alegar correção de dados em produção com esse diagnóstico.

O teste antigo trocava o cliente/estado privado de uma janela longa e contava TODAS as RPCs após duas esperas de 50 ms. A substituição mantém a regra de ferro, mas cria uma janela isolada com o store real, identidade fictícia validada e respostas explicitamente controladas. Aguarda a consulta, observa a ausência de gravações antes de reconciliar, libera a consulta, segura a confirmação e confirma revisão/fila após o retorno. Não modifica `_estado` nem o motor do produto.

O cenário também escreve uma chave comum: são duas RPCs legítimas, mas apenas um CAS. Isso demonstra por que um contador global igual a um não representa o contrato. O novo helper é usado tanto na suíte Personal existente quanto em uma suíte dedicada (8 verificações). A suíte de identidade passou a detectar RPCs indevidas antes da reconciliação, além de upserts antigos.

## Evidências e limites

Diagnóstico `34606880145`: artefato Personal `10266368330`, SHA-256 `87eabdd1adb2e4fd2898217b42b48c1c2b962a0624dbcdd8b74957581a6f8754`, terminou com TUDO PASSOU. Artefato alimentação `10266732930`, SHA-256 `252c6ce2278c5847f489643238c3fde8048b74afd5d04453051c9e3f3aac6dab`: os 57 casos funcionais passaram e os logs de geometria foram obtidos, mas a limpeza do observador falhou por referência a `path`; não declarar esse workflow diagnóstico aprovado nem capturas que não foram geradas. Os arquivos de instrumentação temporários não integram esta release.

Testes locais adicionais: CAS 15, identidade 13, agenda 20, release/guard/lock 32 e versão 17, aprovados. O navegador local é diferente do CI; a navegação HTTP local estava bloqueada e os testes locais de navegador usaram DOM offline. A suíte completa do commit final no GitHub e o deploy/commit servido continuam sendo requisitos de publicação.

Runtime alterado somente no módulo visual de alimentação do Personal, além dos três marcadores de versão/cache mt-v824. Sem migração Supabase, registros reais, preços, restauração de histórico ou mudança das regras CAS/RLS. Não encerra a auditoria completa de concorrência/permissões nem a homologação física. O gate de testes e o workflow Pages permanecem intactos.
