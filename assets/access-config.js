// Controle de acesso do portal Método Torque.
//
// Os códigos de acesso são guardados como hash SHA-256 (o código em si não
// aparece aqui). Para criar um código novo, abra gerador-codigo.html no
// navegador, digite o código desejado e cole a linha gerada na lista abaixo.
//
// exigirCadastro: false → portal aberto (sem tela de cadastro).
self.MT_ACCESS = {
  exigirCadastro: true,
  // Código inicial: TORQUE2026 (troque assim que possível)
  codigos: [
    "382408191ce340f9e8fad971f8ff05d8dc966a9f1d198a52d433b330af421eef", // TORQUE2026
  ],
  // Opcional: receber cada cadastro por e-mail via formsubmit.co.
  // Preencha com o seu e-mail e confirme o e-mail de ativação que o serviço
  // envia no primeiro cadastro. Deixe "" para desativar.
  notificarEmail: "",
  // WhatsApp do suporte TORQUESYS (aparece no card 🆘 do Central de Ajuda).
  // Só números com DDI+DDD, ex.: "5531999990000". Deixe "" para esconder o botão.
  suporteZap: "",
};
