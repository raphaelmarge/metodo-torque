# mt-v849 — execução do treino conforme a referência

A composição segue a imagem enviada pelo proprietário em 29/09/2026. A mudança
fica na camada de apresentação do executor canônico, em `app/aluno-skin.js`.
As demonstrações usam os mesmos dados fictícios e as mesmas mídias de exercício
do acervo já existente, sem copiar a fotografia da referência para outro exercício.

## Composição

- Marca do profissional no topo; ficha, nome e posição do exercício em destaque.
- Mídia ampla em 16:9, com `object-fit: contain`: o movimento não é esticado nem
  cortado. Vídeo existente, dica real e estado sem mídia continuam disponíveis.
- Séries em seletor horizontal. A comparação Prescrito/Anterior fica antes dos
  campos de repetições e carga, nessa ordem, com controles de pelo menos 44 px.
- RPE e ajustes recolhidos. Instruções, técnicas, histórico e registros permanecem
  acessíveis. Mensagens de validação e de rascunho continuam visíveis.
- Conteúdo na mesma rolagem; descanso prescrito e ação de confirmar acessíveis.
  Edição com teclado ajusta a rolagem para manter o campo focado à vista.

## Contratos preservados

O skin não altera GP/SR, banco, publicação de pacotes ou sincronização. Visualizar
prescrição e sugestões não registra uma série. Zero e ausência continuam distintos;
RPE realizado é opcional, validado separadamente do alvo. Editar, desfazer, fechar,
retomar, concluir sem anotar e revisar o treino seguem o executor existente.

As três variantes da demo foram regeneradas pelo script canônico. A versão de
cache dos dois service workers acompanha `assets/versao.js`.

## Validação e limites

- Oito suítes específicas: 694 verificações aprovadas, incluindo registro,
  retomada, referências, prescrição, identidade e falhas de armazenamento.
- Referência: 176 verificações em 320, 390, 768 e 1440 px, claro/escuro, mídia com
  proporção de origem diferente e alturas reduzidas para simular teclado.
- Cores personalizadas: contraste renderizado da ação conferido nas oito cores.
- Demo local em 320/390: GIF público real, imagem inteira, nenhuma exceção ou
  rolagem horizontal. Somente a imagem pública externa foi consultada.
- Variantes da demo: 32 verificações; versão/cache: 17 verificações.

A validação visual usa navegador automatizado e dados fictícios. Teclado físico,
leitor de tela e uso em Android/iPhone reais ainda precisam de conferência. O
gate completo do commit final e a publicação devem ser confirmados na entrega.
Google Play e App Store continuam fora do escopo. A corrida web mantém o limite
de pausa ao ficar oculta descrito na versão anterior.
