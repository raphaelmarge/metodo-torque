# mt-v877 — Demos da Dra. Larissa Macedo

Pedido de Raphael em 14/11/2026: colocar a foto de Larissa nas demos de paciente e nutricionista e substituir o nome da Dra. Helena pelo dela.

- As rotas `/nutri/demo-paciente.html` e `/nutri/demo-nutricionista.html` apresentam **Dra. Larissa Macedo**. O nome também acompanha os planos fictícios gerados pela demonstração.
- A home profissional mostra o retrato com identificação; a home do paciente mostra o retrato junto ao nome da nutricionista. O avatar do paciente continua representando o paciente.
- A personalização é condicionada às duas rotas demonstrativas. Contas conectadas, clínica, dados, prescrição, cálculos e notificações reais não foram alterados.
- Cache Nutri v22 inclui a imagem local. Versão global e caches do portal/aluno permanecem sincronizados em mt-v877.

## Origem da foto

O nome e a imagem foram recuperados da [prévia pública anterior da Dra. Larissa Macedo](https://torque-nutri-larissa-aluno.raphaelmarge.chatgpt.site), cujo código e texto alternativo identificam a profissional explicitamente.

Arquivo original: `https://torque-nutri-larissa-aluno.raphaelmarge.chatgpt.site/assets/photos/larissa-macedo.jpeg`.
Destino: `nutri/assets/larissa-macedo.jpeg`, 183.341 bytes, 1320 × 1301 pixels.
SHA-256: `07770269cfef39337477383732d1a0851726477c5d2d6aed6e126502417cdd50`.

O arquivo foi copiado sem edição. O enquadramento circular é feito pelo CSS.

## Verificação

Passaram os checks locais de versão (17), caminhos/cache (18), autenticação e isolamento (33), integração das áreas (9) e apresentação do paciente (11). O teste visual passou seus dez grupos, com quatro larguras e ambos os temas; a atualização real em Chromium de v14 para v22 preservou rascunho, fila, vínculo e recursos offline, incluindo instalação interrompida. A inspeção visual das duas homes locais confirmou nome e retrato. CI e implantação devem ser conferidos no commit da entrega antes de declarar publicação.

O primeiro CI executou 260 suítes: 259 passaram e o teste de identidade do Personal falhou ao procurar um recibo fictício com data fixa de setembro, fora dos 30 pagamentos mais recentes. A falha foi reproduzida localmente. A fixture agora usa a data local de hoje do app; as mesmas 66 verificações passaram, sem alterar o produto nem as asserções. A nova execução completa é necessária para aprovar o commit corrigido.
