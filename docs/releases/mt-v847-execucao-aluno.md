# mt-v847 — Execução e retomada do aluno

## Comportamento

O aluno confere e ajusta a série perto do botão de confirmação, recebe orientação
da próxima série durante o descanso e vê um encerramento completo ou parcial.
Fechar uma ficha sem realizar séries não registra um dia de treino.
O aceite do termo também só fecha a tela depois de confirmar a gravação local;
falha de espaço ou troca de identidade conserva o termo com aviso e nova tentativa.

Corrida e circuito preservam a sessão localmente por identidade. Ao reabrir,
retomam pausados, conservando etapa/movimento, tempo observado e resultados.
A corrida publicada usa o token estável: mudar o nome da marca ou do aluno
não esconde uma sessão pendente. O modo local mantém isolamento por aluno/studio.
Ao recarregar e retomar a sessão salva, a lacuna não é acrescentada ao tempo
de exercício nem à distância. Com o circuito ainda aberto, minimizar mantém
o cronômetro, conforme o aviso mostrado na própria tela.
Trocar de aluno pela entrada `/app/?t=` preserva somente os checkpoints já
separados por identidade. Voltar ao aluno original permite retomá-los; registros
compartilhados continuam limpos na troca, e revogação/exclusão limpa as sessões.
O arquivo de exportação exclui os checkpoints internos de corrida/circuito,
que contêm a identidade na chave. Resultados concluídos do aluno continuam
exportados normalmente; a sessão de outro aluno no aparelho não entra no arquivo.
Falhas de armazenamento conservam a sessão/revisão e permitem tentar novamente.
A gravação do resultado e do dia é idempotente: falhar na segunda operação não
duplica a primeira ao repetir. O dia é o de início da sessão, inclusive à meia-noite.

Corrida destaca o restante da etapa e a orientação prescrita. Precisão acima de
40 metros e ausência de leitura recente não são apresentadas como GPS pronto.
O primeiro ponto após uma lacuna não liga posições distantes como um deslocamento.
Ao ocultar a página, a corrida pausa e interrompe a largada que ainda estiver em
contagem. O cadeado interno bloqueia toques; não habilita GPS em segundo plano.
O histórico novo preserva atividades além das últimas 30, mas não recupera
registros que versões anteriores já descartaram.

Circuitos mostram explicação do formato, aquecimento e observações prescritas,
próximo movimento, teste de som, voz opcional e desfazer último avanço.
Pausar impede novos avanços; minimizar mantém o cronômetro com aviso explícito.
EMOM/Tabata interrompidos salvam tempo e rodadas reais; For Time pode encerrar
pausado. Parciais não recebem medalhas de circuito concluído. Recordes comparam
prescrição, adaptação e duração equivalentes; registros legados sem esse contexto
permanecem consultáveis, sem nova afirmação de comparação.

## Contratos preservados

- Builder e skin canônicos, HTML/JS sem framework. Demos somente pelo gerador.
- Resultados continuam em `ptdc`, `ptwodres` e `ptcardio`, enviados pelo retorno
  existente. Checkpoints são locais, separados por identidade, sem nova tabela.
- `ptfeitos` representa dias, não quantidade de sessões. Modalidades no mesmo dia
  não duplicam constância. Esforço é opcional e o envio distingue local/pendente.
- Cargas sugeridas continuam dependendo de confirmação; editar não duplica série.
- Nenhuma cobrança, mensagem a clientes, alteração de preço, nutrição, banco,
  landing page ou configuração de Google Play/App Store neste lote.

## Validação

Novas suítes: `test-aluno-execucao-clareza.js`, `test-corrida-retomada.js`,
`test-circuito-retomada.js`, `test-aluno-loader-retomada.js` e
`test-aluno-termo-salvamento.js`. Exercitam o HTML
gerado e a entrada real `/app/` com dados fictícios e rede
externa bloqueada: armazenamento cheio, retomada/recarregamento, troca de aluno,
repetição de conclusão, etapas puladas, sessões parciais e meia-noite.
Regressões de medalhas verificam exclusão de circuitos parciais.

Geometria e execução são verificadas em 320, 390, 768 e 1440 pixels na musculação,
incluindo temas claro/escuro e altura reduzida que simula o espaço do teclado.
Corrida tem verificação adicional de 320×568 para impedir sobreposição de GPS,
etapa e controles. Os testes anteriores de template e etapas permanecem.

O gate do repositório deve passar antes da publicação. A execução no Windows
encontra uma restrição de Controle de Aplicativo que impede carregar uma DLL do
WebKit; a validação desse motor deve ser realizada pelo CI Linux, sem contornar
a política do computador. PostgreSQL de testes usa cluster local descartável.

## Limites

Não houve corrida real em Android/iPhone. GPS, bateria, áudio, teclado do sistema
e bloqueio físico de tela ainda exigem aceite em aparelhos reais. Emulador e
WebKit não equivalem a iPhone físico. Não há promessa de GPS em segundo plano.
Sem espaço local, o aplicativo avisa a falha; não pode garantir checkpoint que
o sistema recusou gravar. Sem conexão, mapas remotos podem ficar indisponíveis.
Movimentos de circuito legados possuem nome/quantidade, sem demonstração vinculada:
este lote não inventa GIFs ou instruções técnicas a partir do nome.
