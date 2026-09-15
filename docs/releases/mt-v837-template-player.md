# mt-v837 — template de execução aprovado pelo usuário

Implementação sobre o HEAD `6da18dbaacb8a2dcbb393ccac010016380d15c86` do PR #845. O pedido de 15/09/2026 aprovou um mockup escuro com acentos verdes, prescrição, histórico, steppers e tabela de séries. Esta nota não comprova integração à main ou publicação.

A camada de apresentação fica em `app/aluno-skin.js`, incorporada pelo construtor canônico. Reorganiza os controles existentes em cabeçalho, progresso real por séries concluídas, card do exercício, abas Vídeo/Instruções/Dicas do prof., prescrição, histórico e registro. A ação principal e a navegação ficam alcançáveis enquanto o conteúdo central rola. Há tema claro equivalente, abas por teclado, estados ARIA e ausência explícita quando não há mídia, carga ou histórico. O exemplo gráfico não é uma fonte de resultados de clientes.

A confirmação abre a tabela de séries e o feedback discreto. Editar usa o mesmo slot; avançar não marca exercícios pendentes. Mais opções conserva réguas, anotação sem concluir, encerramento sem anotação e controles anteriores. O resumo final, revisão, pausa, descanso e retomada continuam no executor canônico. Não há nova Central Pro.

O único acréscimo ao registro é `rpe`, opcional, de 1 a 10. Não é preenchido como resultado com o alvo da prescrição; preserva rascunho, edição e retomada. Chamada antiga com quatro argumentos não apaga um RPE já registrado; envio explícito vazio permite limpar. Valores inválidos são recusados antes de gravar. Ausência de carga permanece diferente de zero. A percepção de esforço diária existente não é renomeada nem usada como RPE de uma série.

Demonstrações geradas pelo fluxo canônico, preservando entrada direta e cadastro separado. Versão/cache atualizados em três arquivos. Nenhuma migração, RPC, política, pagamento, credencial ou conta real é alterada.

## Verificação e liberação

62 verificações do novo template passaram na prévia local em memória (o ambiente bloqueia navegação HTTP de Chromium). Isso não equivale a armazenamento real, Safari físico ou produção. O mesmo teste, por padrão sem o modo de prévia, executa no CI com documento HTTP e armazenamento real. Testes de dados e concorrência não devem ser enfraquecidos para acomodar a nova apresentação. A suíte visual anterior pode precisar de adaptação dos caminhos recolhidos; todas as suítes do HEAD final e a dependência #845 devem ser aprovadas antes do merge. Confirmar Pages e SHA servido antes de anunciar publicação.
