# mt-v865 — Protocolos de dobras no Torque Nutri

A avaliação em `/nutri/` passa a oferecer Pollock 3 dobras, Pollock 7 dobras e
Guedes 3 dobras. A seleção mostra os pontos exigidos para o sexo informado,
mantém as outras medidas e apresenta a estimativa pela densidade corporal e
conversão de Siri (`495 / densidade - 450`). Não são atribuídas classificações
diagnósticas ou recomendações de peso.

## Uso e preservação dos registros

- A prévia não substitui o percentual informado. A nutri escolhe **Usar estimativa
  na avaliação** ou **Calcular pelas dobras**. Voltar a **Valor informado / outro
  método** restaura o valor anterior. Com a estimativa selecionada, as medidas
  recalculam o resultado e o salvamento o confere novamente.
- `fat` continua sendo o percentual usado pelos gráficos e composição. Quando
  calculado, é arredondado para uma casa decimal. `fatInformed` preserva o valor
  manual e `fatSource` distingue `informed` e `skinfolds`.
- `skinfoldProtocol` guarda a seleção. `skinfoldResult` contém protocolo, versão
  da fórmula, sexo, idade, soma, densidade, percentual sem arredondamento e
  somente as dobras usadas. Avaliações anteriores não são recalculadas na leitura.
- Dados antigos, campos desconhecidos, visibilidade, paciente, data e histórico
  permanecem preservados. Não há migração de banco ou mudança de autenticação.
- Coxa proximal de Guedes (`skinfolds.thighProximal`) é separada da coxa de
  Pollock (`skinfolds.thigh`). Trocar protocolo não reutiliza automaticamente uma
  medida de outro local anatômico. A orientação peitoral do Pollock muda por sexo.

## Equações e escopo

As faixas abaixo descrevem a população dos estudos, não uma garantia universal
de validade clínica. O cálculo automático do Nutri é limitado a essas faixas;
valores manuais e medidas parciais ainda podem ser registrados. Sexo e idade
devem ser explícitos. Guedes não usa idade na equação, mas a idade é usada para
conferir a população de referência.

| Protocolo | Masculino | Feminino |
| --- | --- | --- |
| Pollock 3 e 7 | 18–61 anos | 18–55 anos |
| Guedes 3 | 17–27 anos | 17–29 anos |

As medidas usadas no cálculo devem ser números finitos, maiores que zero e até
150 mm, limite do campo existente. Resultados não são truncados para caber no
cadastro: estimativas fora de `0 < percentual < 80` são recusadas. Esses limites
de entrada e de cadastro não constituem validação clínica do método.

Fontes conferidas em 13/10/2026:

1. [Jackson e Pollock, 1978](https://doi.org/10.1079/BJN19780152): estudo original masculino.
2. [Jackson, Pollock e Ward, 1980](https://pubmed.ncbi.nlm.nih.gov/7402053/): estudo original feminino; o resumo recomenda cautela acima de 40 anos.
3. [Salem, Pires Neto e Waissmann, 2007](https://revistadeeducacaofisica.emnuvens.com.br/revista/article/download/336/365/1220): revisão científica; página 69, tabelas 1 e 2, reproduz os coeficientes completos de Guedes e as faixas por sexo.
4. [Guedes e Calabrese, 2019](https://dartagnanguedes.com.br/downloads/Livro_Protocolos_Clinicos_Para_Analise_Da_Composicao_Corporal.pdf): manual do autor, páginas 110–115, equações, conversão de Siri e diferenças anatômicas entre protocolos.
5. [Guedes, 1985](https://periodicos.ufsm.br/kinesis/article/view/8617): o resumo informa 17–27 para ambos, mas a tabela da amostra feminina chega a 29,80 anos; a faixa de 17–29 anos completos é corroborada pela revisão de 2007.

## Verificação

- `tests/test-nutri-skinfolds.js`: seis referências numéricas independentes,
  faixas etárias, medidas incompletas/inválidas, ausência de defaults, soma dos
  pontos corretos, imutabilidade e coxa proximal distinta.
- `tests/test-nutri-skinfolds-browser.js`: seleção, prévia, aplicação/restauração,
  recálculo, rascunho, salvamento/reabertura, PDF, legado e visibilidade do paciente.
- Regressões de avaliação, apresentação e integração Nutri mantidas; os loaders
  de teste carregam o mesmo módulo puro usado pelo navegador.
- Runtime `mt-v865`, cache Nutri v14, com `skinfolds.js` no precache. A confirmação
  da versão publicada é feita em `release-info.json` e pela conferência dos
  arquivos servidos, seguida da navegação no demo público.
