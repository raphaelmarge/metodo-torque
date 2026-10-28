# mt-v878 — catálogo do Torque Nutri no Personal

O Personal e o módulo legado de nutrição carregam a mesma base pública utilizada
pelo Torque Nutri. A biblioteca e os seletores encontram nome, marca e código de
barras, exibem a porção e mantêm a fonte consultável.

## Dados e preservação

- 5.000 produtos adicionais do CSV oficial Open Food Facts de 28/10/2026, com
  país de venda Brasil na fonte; inclui prefixos GTIN 789/790 e outros prefixos.
- 22.520 candidatos extraídos, 12.865 aceitos pelo normalizador e 6.210 novos
  elegíveis após deduplicação e revisão adicional. Seleção final de 5.000.
- 4.927 referências por 100 g e 73 por 100 ml. Nenhuma conversão g/ml inferida.
- Duas referências antigas com possível confusão de porção ficam em quarentena
  até revisão do rótulo. Fontes originais e snapshots existentes são preservados.
- Catálogo ativo: **12.199 no Nutri**; com os 1.548 alimentos legados,
  **13.747 públicos no Personal**, além dos alimentos próprios.
- Macros e nutrientes opcionais são preservados; ausente não vira zero.
  Identidades antigas, favoritos, planos, histórico e recursos privados permanecem.
- O pacote do aluno conserva a biblioteca legada/privada e acrescenta os itens
  compartilhados usados no plano, alternativas, receitas ou favoritos. Os limites
  de 2.000 itens/1,2 MB continuam validados, sem truncamento silencioso.
- No módulo legado, a seleção enviada à IA passa a procurar um limite por
  categoria que caiba no orçamento de caracteres, incluindo quando 40 não cabem.

Relatórios, checksums, dados reutilizáveis, licenças ODbL/DbCL e limites da fonte
colaborativa: [fontes do catálogo](../../nutri/data/README.md).
Importação reproduzível: [ferramentas](../../tools/food-catalog/README.md).

## Validação local

- `test-food-catalog-expansion.js`: todo o catálogo disponível no Personal,
  5.000 IDs novos, fontes, unidades, cálculos, nutrientes e preservação do legado.
- `test-food-catalog-shared-ui.js`: busca, marcas, TACO, itens privados, rascunho,
  pacote publicável e geometria em 320/390/1280 px.
- `test-nutri-food-data.js`: todos os 12.199 registros e suas medidas; manifesto,
  composição persistida e quarentena.
- `test-nutri-food-measures.js`: 6 grupos; `test-nutricao-core-completa.js`: 48
  verificações; `test-versao.js`: 17 verificações.
- `test-nutri-food-catalog-ui.js`: 10 verificações; edição, publicação, paciente,
  medidas, receitas e tela móvel.
- `test-nutricao-personal-completa.js`: 58 verificações.
- `test-nutricao-integrada.js`: 160 verificações, sem chamadas externas.
- `test-nutricao.js`: suíte do módulo legado aprovada; inclui montagem do
  catálogo para IA dentro do orçamento e prioridade dos favoritos.
- `test-nutri-food-substitutions.js`: 7 grupos com o catálogo ativo completo.
- Inspeção da biblioteca publicada e da demonstração local do Personal. A
  demonstração apresenta busca por marca com fonte e composição no cartão.

Cache global/aluno mt-v878, cache Nutri v22. Sem alteração de banco, autenticação
ou builder do aluno. A validação local não representa implantação em produção;
merge e GitHub Pages são etapas separadas.
