# mt-v829 — Medalhas em aço escovado

Ao abrir uma medalha evolutiva, o aluno volta a ver um medalhão com profundidade, relevo, borda chanfrada e textura de aço escovado. Bronze, prata, ouro e demais níveis conservam suas tonalidades. As medalhas anteriores recebem o mesmo acabamento na cor da marca.

`runtimeMedalhaVisual`, em `app/aluno-builder.js`, produz um SVG autocontido. O modal e o canvas de compartilhamento usam a mesma imagem, incluindo textura, reflexos e ícone. A exportação mantém o formato PNG de 1080×1350 e os botões existentes de compartilhar/salvar. Emoji de medalha personalizada também é suportado.

O arrasto permanece disponível. O giroscópio é desligado ao fechar, trocar de medalha ou compartilhar; uma permissão que chega depois do fechamento não o reativa. Movimento reduzido evita sensor e transição, mantendo o arrasto voluntário. Falha ao preparar a imagem exibe erro e permite tentar novamente, sem criar arte vazia.

Níveis, próximos objetivos, fixação, grade parcialmente recolhida, medalhas anteriores, XP, histórico e demais funcionalidades não mudam. Não há novos campos de pacote, dependências externas, gravações ou alterações de banco.

As três demos são regeneradas pelo fluxo canônico. A verificação cobre igualdade do SVG no modal e no canvas, pixels da imagem exportada, cores, emojis, giro, sensores, falhas e geometrias em 320/390/1280px. Sensores e permissão iOS são simulados em navegador; não houve teste em iPhone físico. A publicação exige a suíte completa do commit de integração e conferência dos arquivos servidos.
