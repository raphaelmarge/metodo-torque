# Contraste do circuito com o tema real — mt-v858

A verificação pública da mt-v857 confirmou os arquivos publicados, mas reprovou o contraste dos botões +1 volta e Terminei no tema claro. A inspeção visual também encontrou o mesmo problema no preparo e no botão Testar aviso sonoro. O complemento do circuito passou 168 de 176 verificações; suas oito falhas de contraste são independentes das 320 verificações aprovadas da inspeção geral.

Duas causas distintas explicam a divergência: o produto usava regras de fundo que dependiam da grafia exata do atributo `style`, perdida quando a interface serializava esse atributo; a fixture local omitia `D.PAL`, deixando fundos transparentes e mascarando o defeito. A troca de tema local também não exercitava a API real.

O skin passa a aplicar o fundo claro existente por IDs, apenas nos dois controles, no preparo e no aviso sonoro do circuito livre. Não altera o botão Iniciar, o tema escuro, a cor de marca, a lógica de execução ou outras telas. O teste usa a paleta padrão do Personal e uma marca azul com fundo personalizado, aplica `__temaApp`, alterna nos dois sentidos e mede contraste sobre fundos reais. Mantém geometria, áreas de toque, ações e preservação dos registros nas quatro larguras.

A reprodução anterior à correção permanece registrada separadamente do resultado corrigido. A verificação pública da nova versão continua pendente até sua publicação; este documento não declara implantação. Demos regeneradas pela fonte canônica e versão mt-v858 nos três arquivos de cache/versão. Sem alteração de banco, landing, cobrança ou integrações.
