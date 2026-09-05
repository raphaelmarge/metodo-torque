# TORQUE PERSONAL — imagens para a seção Sobre

## O que já está na página

A seção **Sobre** já foi construída com duas fotografias ilustrativas existentes no projeto, em camadas, com profundidade, luz violeta e enquadramento responsivo. Os prompts abaixo são uma direção de arte para substituí-las: **as novas imagens ainda não foram geradas**.

As imagens geradas devem continuar identificadas como ilustrativas. Não apresentar pessoas fictícias como a equipe, o fundador ou clientes reais da Torque. Para um retrato do fundador, usar uma fotografia autorizada como referência, em um trabalho separado.

## 1. Fotografia principal — presença e acompanhamento

**Uso:** quadro maior da seção Sobre.
**Proporção:** vertical, 4:5. **Exportação sugerida:** 1600 × 2000 px, WebP.
**Arquivo novo:** `assets/vendas/lifestyle/sobre-atendimento.webp`.

### Prompt para copiar

> Crie uma fotografia editorial cinematográfica para a seção Sobre de uma plataforma de gestão chamada Torque Personal. Uma personal trainer adulta, com roupa esportiva preta discreta e confortável, acompanha um aluno adulto em uma academia contemporânea. Ela consulta um tablet e conversa com ele com atenção e naturalidade, durante uma pausa entre atividades. Pessoas com aparência cotidiana, proporções naturais e diversidade realista, sem foco em definição muscular ou transformação corporal. A história da imagem é a qualidade do atendimento humano, apoiado por tecnologia.
>
> Composição vertical 4:5, plano médio, câmera à altura dos olhos, lente de aproximadamente 50 mm. A profissional ocupa a região central, levemente à direita; o aluno aparece parcialmente à esquerda, dando profundidade. Manter rostos, mãos e tablet dentro da área central, com margem nas bordas para pequenos recortes responsivos. Reservar o quinto inferior mais escuro e visualmente tranquilo para uma legenda aplicada depois no site.
>
> Ambiente premium e verossímil: estruturas metálicas pretas, piso escuro, equipamentos coerentes em segundo plano. Paleta preto profundo #09080D, carvão e violeta #8B5CF6. Luz de contorno violeta suave ao fundo; luz principal ampla e neutra preservando o tom natural da pele. Profundidade de campo moderada, três planos de distância, reflexos controlados, contraste elegante, textura de pele natural, acabamento de fotografia comercial. A tela do tablet fica inclinada e sem conteúdo legível; não inventar uma interface. Sem palavras, letras, logos, marcas-d’água, gráficos flutuantes ou moldura de celular. Mãos anatomicamente corretas e equipamento sem deformações. A imagem final deve parecer uma cena profissional espontânea, não uma pose de fisiculturismo.

**Enquadramento na página:** o quadro já usa `aspect-ratio: 4 / 5`, `object-fit: cover` e `object-position: 58% center`. A fotografia vertical ocupará o quadro sem achatamento.

## 2. Fotografia de detalhe — conexão e orientação

**Uso:** quadro menor sobreposto à fotografia principal.
**Proporção:** vertical, 3:4. **Exportação sugerida:** 1200 × 1600 px, WebP.
**Arquivo novo:** `assets/vendas/lifestyle/sobre-conexao.webp`.

### Prompt para copiar

> Crie uma fotografia editorial vertical 3:4, pertencente à mesma campanha visual da fotografia principal da Torque Personal. Um personal trainer adulto e uma aluna adulta conversam ao lado de um equipamento de academia, em uma pausa tranquila. Ele aponta um ajuste simples do equipamento enquanto ela acompanha a explicação. O foco é a comunicação, a confiança e a atenção individual, não intensidade, esforço extremo ou aparência física. Pessoas com proporções naturais, roupa esportiva preta discreta e expressão espontânea.
>
> Plano médio aproximado, rostos e mãos visíveis, sem cortar articulações nas bordas. Posicionar a interação no centro do quadro, ligeiramente à direita, com espaço de segurança ao redor. A imagem será exibida em um cartão pequeno e inclinado; usar uma ação simples e uma silhueta clara. Deixar a área inferior mais escura para uma pequena legenda adicionada depois.
>
> Academia contemporânea com estruturas pretas e luz de contorno violeta #8B5CF6, mantendo a mesma direção de luz, contraste e tratamento de cor da fotografia principal. Pele com cor natural, textura real, fundo fora de foco e iluminação suave. Lente de aproximadamente 65 mm, perspectiva natural, fotografia comercial de alta qualidade. Equipamento estruturalmente plausível, mãos e dedos corretos. Sem celular em primeiro plano, sem interface inventada, sem texto, números, logos ou marcas-d’água. Sem poses de competição, proporções corporais exageradas ou brilho artificial na pele.

**Enquadramento na página:** o quadro já usa `aspect-ratio: 3 / 4`, `object-fit: cover` e `object-position: 53% center`.

## 3. Imagem ambiente opcional — profundidade do espaço

**Uso:** opção para uma futura faixa editorial ou fundo de seção. **Não está vinculada automaticamente na página entregue.**
**Proporção:** horizontal, 16:9. **Exportação sugerida:** 1920 × 1080 px, WebP.
**Arquivo novo:** `assets/vendas/lifestyle/sobre-studio.webp`.

### Prompt para copiar

> Fotografia arquitetônica cinematográfica de uma academia boutique contemporânea, vazia, em formato horizontal 16:9. Equipamentos de treino em aço preto fosco distribuídos com coerência, piso de borracha escuro e uma linha discreta de iluminação violeta #8B5CF6 atravessando o fundo. Composição com três planos de profundidade: uma estrutura levemente desfocada na borda direita, equipamentos definidos no plano médio e pontos suaves de luz ao fundo. Perspectiva natural, lente de aproximadamente 35 mm, verticais corretas e equipamentos sem deformações.
>
> Manter o terço esquerdo escuro, limpo e pouco detalhado para texto aplicado posteriormente no site. Atmosfera premium e silenciosa, reflexos sutis, sombras com detalhe, preto #09080D, luz violeta contida e ligeira luz neutra para revelar os materiais. Fotografia realista de alta resolução. Sem pessoas, palavras, números, logos, marcas-d’água ou névoa excessiva. Representar um ambiente ilustrativo, sem simular ou afirmar que seja uma unidade real da Torque.

## Como trocar as imagens sem afetar outras páginas

Criar os dois arquivos novos dentro de `assets/vendas/lifestyle/`. **Não substituir os arquivos compartilhados** `personal-mulher.webp` e `coaching.webp`, pois outras partes do projeto também podem utilizá-los.

Em `personal-vendas.html`, localizar apenas a seção `<section ... id="sobre">` e fazer estas substituições:

```html
<!-- Quadro principal -->
<img src="assets/vendas/lifestyle/sobre-atendimento.webp"
     alt="Cena ilustrativa de atendimento: personal com tablet acompanhando um aluno"
     width="1600" height="2000" loading="lazy" decoding="async">

<!-- Quadro menor -->
<img src="assets/vendas/lifestyle/sobre-conexao.webp"
     alt="Cena ilustrativa de orientação: personal e aluna conversando junto ao equipamento"
     width="1200" height="1600" loading="lazy" decoding="async">
```

Os atributos `width` e `height` devem refletir as dimensões reais dos arquivos exportados. Manter a identificação “Imagens ilustrativas do contexto de atendimento”.

## Regra para os celulares — não gerar telas por IA

As telas dos celulares são capturas reais do produto, originalmente em **780 × 1688 px**. Elas devem continuar inteiras e proporcionais: `object-fit: contain`, não `fill` e não `cover`. A perspectiva é aplicada à moldura do aparelho, não é uma deformação da imagem de origem.

Não pedir a um gerador de imagens que redesenhe textos, botões ou telas do aplicativo. Quando for necessário atualizar uma tela, fazer uma nova captura real, sem dados pessoais de clientes, e inseri-la no mesmo componente. A ação **“Ver tela sem perspectiva”** permite conferir a captura inteira.

Para as fotos editoriais, `cover` faz um recorte proporcional do enquadramento; não estica a imagem. Para as telas de interface, `contain` mantém todo o conteúdo visível. Referência técnica: MDN, documentação de `object-fit`, consultada em 05/09/2026.
