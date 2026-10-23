# Landing PERSONAL — título do treino na imagem principal

O proprietário pediu que o nome do treino corresponda à foto de leg press na
abertura da página. A captura agora mostra **Treino A Pernas**, em lugar de
**Treino A Peito e tríceps**. A mesma captura foi atualizada na etapa Publicar
do tour e na cena de 8–12 segundos do vídeo.

`tools/capture-sales-screens.cjs --hero-only` reproduz a correção. A captura
usa o HTML da demonstração publicada em `748aa94448badc7384cdcf480d73db40e699bf8f`
para preservar a composição anterior; requer esse commit disponível no Git.
Somente o título `#htTitulo` é alterado na página isolada de captura, com
restauração imediata. Nenhum arquivo do aplicativo, ficha ou dado de aluno muda.
As demais capturas e o pôster de nutrição permanecem iguais.

A nova imagem mantém 780×1688. Imagem, vídeo e JavaScript usam novos caminhos,
com versão mt-v871 nos três arquivos de atualização, para evitar mídia antiga
no cache. Os arquivos antigos de mídia e JavaScript continuam disponíveis para
abas antigas e para a instalação do service worker legado durante a atualização.

Validação local: landing em 320, 375, 390, 430, 768 e 1440px, incluindo proporções,
ampliação, tours, vídeo, preço, demos e WhatsApp; teste de versão (17 verificações)
e atualização de cache (9 cenários). A publicação depende dos checks do GitHub
e da verificação do commit efetivamente servido pelo domínio.
