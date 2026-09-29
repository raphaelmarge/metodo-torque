# mt-v848 — mapa e GPS da corrida

O app do aluno passa a usar Mapbox GL JS 3.30.0 quando há token público configurado em `MT_MAPA.mapboxToken`. O SDK e o CSS só são carregados ao abrir um mapa visível com uma posição observada. A mesma instância acompanha a prévia e a tela cheia; a navegação entre mapa e métricas não cria novos mapas. O token do responsável foi validado e armazenado na variável de repositório Actions `MAPBOX_PUBLIC_TOKEN`; ele não pertence às fontes versionadas nem deve ser reproduzido em relatórios ou fixtures.

## Comportamento

- Mapa 2D segue a posição durante a corrida, permite explorar manualmente e voltar com Centralizar. Traçado na cor da marca, posição atual e marcos de quilômetro; lacunas não viram linhas ou distância.
- Estilos escuro, claro, colorido, ruas e satélite. Recarregar um estilo repõe as camadas do percurso. Logo e atribuição do fornecedor permanecem visíveis.
- Revisão 3D usa o mesmo fornecedor e relevo, preservando trechos separados. Falha do estilo ou relevo troca para um fundo local com o percurso e uma mensagem explícita.
- Sem configuração, sem WebGL, sem conexão ou com falha do fornecedor, a execução continua independente do mapa; o desenho anterior preserva a alternativa existente. Não há download de áreas para uso offline.
- O GPS valida coordenadas, precisão de até 40 m, tempo real da leitura e ordem dos eventos. Duplicatas, eventos atrasados de capturas encerradas e saltos incompatíveis com o intervalo não acrescentam distância. O intervalo anterior à largada não integra o registro.
- Retomada após lacuna inicia outro trecho e reinicia a janela de ritmo. A documentação de privacidade descreve o GPS opcional e as comunicações do mapa externo.

## Validação

- Teste Mapbox isolado: 88 verificações, incluindo falhas de CSS/SDK/WebGL/autorização, ciclo de vida, câmera, marcos, estilos e 3D. Nenhum acesso à conta nesse teste.
- GPS: 44 verificações; recuperação de sessão: 56 verificações. Coordenadas, identidade e armazenamento são fictícios.
- Configuração de publicação: 58 verificações; pipeline de release: 59; variantes das demos: 32. O pós-deploy rejeita uma configuração antiga mesmo quando o commit é o mesmo.
- SDK real com estilo isolado: geometrias em 320, 390, 768 e 1440 pixels, controles por teclado e créditos visíveis.
- Mapbox real: estilo HTTP 200, ruas vetoriais e relevo carregados com a conta configurada, quatro larguras, nenhum erro de JavaScript ou resposta de erro do Mapbox. Usado somente um percurso fictício.
- A publicação depende do gate completo do commit final; o resultado do CI e o commit servido devem ser registrados na entrega.

## Configuração no artefato publicado

`assets/mapa-config.js` é carregado depois de `assets/cloud-config.js` no app e no Personal. As demos carregam a mesma configuração antes de inicializar seu runtime simulado. O arquivo versionado não contém token. A publicação gera seu conteúdo a partir de `MAPBOX_PUBLIC_TOKEN`, sem alterar outras configurações, e exige um valor público válido com `REQUIRE_MAPBOX_PUBLIC_TOKEN=true`. A variável foi criada por API (HTTP 201) e conferida sem exposição do valor.

O artefato registra o SHA-256 da configuração gerada em `release-info.json`, junto de commit e versão. Na conferência do site, os demais arquivos de produto devem coincidir com o commit aprovado; a configuração deve coincidir com seu hash no artefato. O metadado de release é também gerado. Nenhuma outra divergência de conteúdo fica autorizada por essa exceção. O procedimento completo está em [Conferência da publicação](../corrida-mapbox.md#conferência-da-publicação).

## Limites explícitos

O app web continua pausando ao ficar oculto. Localização contínua com tela apagada exige implementação nativa e testes em dispositivos; não foi entregue nesta versão. Precisão física, consumo de bateria e áudio em rua ainda precisam de aceite em Android e iPhone reais. O Mapbox não fornece automaticamente segmentos, ranking ou dados de popularidade do Strava.

A integração fornece mapas; não muda contratos, tabelas, preços, sincronização ou publicação nas lojas. Não envia fichas ou percursos à API de upload, cálculo de rotas ou Map Matching. Requisições do mapa revelam a área visualizada e o SDK mantém seus eventos técnicos de uso.

Ver configuração, restrições do token, franquia e condições de ativação em [corrida-mapbox.md](../corrida-mapbox.md).
