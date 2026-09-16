# mt-v840 — banco de GIFs dos exercícios

O cadastro de exercícios passa a ter uma área própria de demonstração animada. Em **Treinos → Exercícios → Abrir**, o personal pode manter a escolha automática pelo nome, pesquisar o acervo TORQUE, selecionar um GIF já existente, enviar um arquivo da própria equipe ou marcar explicitamente que o exercício não terá GIF. A prévia aparece antes de salvar.

O app do aluno recebe apenas o caminho do arquivo e a regra compacta do acervo; o GIF não entra no pacote. A escolha do personal chega tanto à ficha quanto ao player guiado. Caminhos são validados e codificados por segmento. O alias inicial liga `Supino reto` e `Supino reto com barra` a `supino-reto-barra.gif`, arquivo confirmado no bucket público.

Pacotes antigos, que ainda não possuem a regra do acervo, usam a configuração pública carregada pelo próprio `/app/`. Assim o modo automático passa a funcionar na próxima abertura sem republicação em massa. Uma escolha manual ou “sem GIF” continua sendo dado do exercício e entra após salvar/publicar normalmente.

O bucket `exercicios` já contém 759 GIFs. A migração desta versão não move nem substitui esse acervo: limita novos arquivos a GIF de até 8 MB e cria políticas para que usuários autenticados listem o acervo global, enviem/excluam somente em `<academia_uuid>/` e não alterem arquivos curados da raiz. O download continua público porque o app do aluno roda sem sessão.

## Verificação e liberação

Passaram a sintaxe do app montado, testes unitários de alias/caminho/ausência, versão/cache, segurança web, os 28 testes visuais de tokens e as 99 verificações do player. Treze cenários SQL isolados cobrem listagem, upload, exclusão, duas academias, usuário anônimo, extensão, subpastas e limite do bucket. O arquivo real do Supino respondeu `206 image/gif` e tem 313.659 bytes.

As três demos foram regeneradas pelo builder canônico e continuam sem requisições externas. No Playwright, passaram a prévia automática do Supino, os aliases, caminho escolhido, “sem GIF”, transporte até ficha/player e a regra compacta do acervo. A tela móvel de 390 × 844 foi conferida visualmente. A suíte ampla ainda registra quatro falhas da própria `main` neste Chromium alternativo — duas de WebGL/câmera e duas de temporização do tour/push — e a comparação no mesmo ambiente confirmou o resultado idêntico antes desta branch.

A migração SQL não foi aplicada, e esta branch não foi mesclada nem publicada; essas ações dependem de aprovação explícita e da validação no CI oficial.
