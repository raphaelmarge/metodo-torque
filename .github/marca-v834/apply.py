from pathlib import Path
import hashlib
root=Path('.')
original = {
'app/aluno-builder.js':'d36dbf935bf76e0f50cfdd078d8a187be73a4b328bb6ccf9415073246fc97a67',
'app/app-sw.js':'1529259d11660363423323ae1d96181c85ff5dd068a21177a89b9b913e8037cd',
'app/index.html':'fd867b98673d13e5b5c6f06f3eaad2c82f55aa4d15d8ebdf9fc167bfda3eaf1b',
'assets/personal-estornos.js':'b43863175f72e67d29a2e0b1887a34ffe330465d507192e73b5550c13098a25a',
'assets/personal-ferramentas.js':'547ca6a16542943c103b46166700790aba89816b84a2028c9651dea6d0d8fed9',
'personal.html':'2ea7abc3a713749e9dab6b38ed2993561817143a917b62d27e7a2b66c1a43682',
'sw.js':'e943071cf5daec307201bf0655bd161ec8d0c276aac35b17c4808f849eaa9559'
}
for f,d in original.items():
 assert hashlib.sha256((root/f).read_bytes()).hexdigest()==d, 'Base mudou: '+f

def rep(f,a,b,n=1):
 p=root/f;s=p.read_text();assert s.count(a)==n,(f,a[:80],s.count(a),n);p.write_text(s.replace(a,b))
rep('personal.html','<script src="app/aluno-skin.js"></script>', '<link rel="stylesheet" href="assets/personal-marca.css">\n<script src="assets/identidade-marca.js"></script>\n<script src="assets/personal-marca.js"></script>\n<script src="app/aluno-skin.js"></script>')
anchor='    <p id="persStatus" class="muted" style="margin: 0 0 10px; font-size: 12.5px;"></p>'
markup='''
    <section class="ptmarca" aria-labelledby="marcaTitulo">
      <h2 id="marcaTitulo">Identidade da marca</h2>
      <p class="muted">Seu nome ou o nome do estúdio em destaque no app do aluno. Escolha a identidade, confira a prévia e salve antes de publicar.</p>
      <div class="ptmarca-grid">
        <form id="marcaForm">
          <div class="ptmarca-campos">
            <label class="ptmarca-wide" for="marcaModo">Como você quer aparecer?
              <select id="marcaModo"><option value="">Manter identidade atual até escolher</option><option value="profissional">Meu nome</option><option value="estudio">Nome do estúdio / marca</option><option value="ambos">Marca + meu nome</option></select>
            </label>
            <label for="marcaProfissional">Nome do profissional<input id="marcaProfissional" maxlength="120" autocomplete="off"><small>Nome da pessoa responsável. Não muda o nome do seu login.</small></label>
            <label for="marcaEstudio">Nome do estúdio / marca<input id="marcaEstudio" maxlength="120" autocomplete="off"><small>Nome fantasia apresentado aos alunos.</small></label>
            <label id="marcaDestaqueCampo" class="ptmarca-wide" for="marcaDestaque" hidden>Qual nome fica em destaque?<select id="marcaDestaque"><option value="estudio">Estúdio / marca em destaque</option><option value="profissional">Profissional em destaque</option></select></label>
            <label for="marcaCurto">Nome curto (opcional)<input id="marcaCurto" maxlength="32" autocomplete="off"><small>Para recados e notificações. Vazio mantém o nome principal.</small></label>
            <label for="marcaSlogan">Slogan (opcional)<input id="marcaSlogan" maxlength="100" autocomplete="off"></label>
          </div>
          <div class="ptmarca-actions"><button type="submit" class="btn" id="marcaSalvar">Salvar identidade</button><button type="button" class="btn sec" id="marcaRecarregar">Recarregar campos</button><button type="button" class="btn sec" id="marcaLogoAtalho">Editar logo</button></div>
          <p id="marcaStatus" role="status" aria-live="polite"></p>
        </form>
        <aside class="ptmarca-preview" aria-label="Prévia da identidade no celular">
          <span>PRÉVIA · APP DO ALUNO</span>
          <div class="ptmarca-brand"><img id="marcaPreviewLogo" hidden alt=""><strong id="marcaPreviewPrincipal"></strong><p id="marcaPreviewSecundario" hidden></p><em id="marcaPreviewSlogan" hidden></em></div>
          <p>Recados com <b id="marcaNomeCurtoPreview"></b></p>
          <small id="marcaPreviewNota"></small>
        </aside>
      </div>
    </section>'''
rep('personal.html',anchor,anchor+markup)
rep('personal.html','  function nomeStudio() {','''  function marcaPublica(cfg, padrao) {
    var m = self.MT_IDENTIDADE_MARCA && self.MT_IDENTIDADE_MARCA.resolve(cfg);
    return m && m.personalizado ? m.principal : (cfg || {}).nome || padrao;
  }
  function nomeStudio() {
    var marca = self.MT_IDENTIDADE_MARCA && self.MT_IDENTIDADE_MARCA.resolve(load().config);
    if (marca && marca.personalizado) return marca.principal;''')
rep('personal.html','    var studio = (st.config || {}).nome || "Meu Personal";', '    var studio = marcaPublica(st.config, "Meu Personal");',2)
# Display-only statements/exports. Keep gateway, account identity and Pix recipient unchanged.
rep('personal.html','    var studio = (st.config || {}).nome || "Personal";', '    var studio = marcaPublica(st.config, "Personal");',2)
rep('personal.html','    var studio = (st.config || {}).nome || "TORQUE PERSONAL";', '    var studio = marcaPublica(st.config, "TORQUE PERSONAL");',2)
rep('personal.html','      marca: (st.config || {}).nome || "TORQUE PERSONAL",', '      marca: marcaPublica(st.config, "TORQUE PERSONAL"),')
rep('personal.html','    var quem = cfg.nome ? nomeStudio() : "Personal trainer";', '    var quem = (cfg.nome || cfg.identidadeMarca) ? nomeStudio() : "Personal trainer";')
rep('personal.html','      nome: a.nome || "Aluno", quando: av.data, marca: "TORQUE PERSONAL",\n      profissional: (st.config || {}).nome || "", historico: histDe(st, av.alunoId),','      nome: a.nome || "Aluno", quando: av.data, marca: marcaPublica(st.config, "TORQUE PERSONAL"),\n      profissional: (st.config || {}).professor || (st.config || {}).nome || "", historico: histDe(st, av.alunoId),')
rep('personal.html','          var studio = (load().config || {}).nome || "Seu personal";', '          var studio = marcaPublica(load().config, "Seu personal");')
rep('personal.html','    if ($("persNome")) $("persNome").textContent = (stP.config || {}).nome || "Seu studio";', '    if ($("persNome")) $("persNome").textContent = marcaPublica(stP.config, "Seu studio");\n    if (self.MT_PERSONAL_MARCA) self.MT_PERSONAL_MARCA.render();')
rep('personal.html','      studio: studio, COR: COR,', '      identidadeApp: self.MT_IDENTIDADE_MARCA ? self.MT_IDENTIDADE_MARCA.resolve(st.config) : null,\n      studio: studio, COR: COR,')
rep('personal.html','  function pushAluno(token, titulo, corpo) {', '''  function pushAluno(token, titulo, corpo) {
    var identidade = self.MT_IDENTIDADE_MARCA && self.MT_IDENTIDADE_MARCA.resolve(load().config);
    if (identidade && identidade.personalizado) titulo = identidade.curto + " · " + titulo;''')
rep('personal.html','      x.fillText(studio.toUpperCase(), lg ? 210 : 84, 148);','      x.fillText(studio.toUpperCase(), lg ? 210 : 84, 148, lg ? 786 : 912);')
rep('personal.html','  window.__ptStudio = { load: load, render: render }; // testes','''  window.__ptStudio = { load: load, render: render }; // testes
  if (self.MT_PERSONAL_MARCA) self.MT_PERSONAL_MARCA.init({
    load: load, save: save, marca: marcaAppPendente,
    render: function () { renderPers(); verificaOnboarding(); },
    onChange: function (fn) { S.onChange(fn); },
    conta: function () { var c = S.cloud && S.cloud(); return JSON.stringify([c && c.aid || "", (S.usuario && (S.usuario() || {}).email) || "local"]); },
    permitido: function () { var b = document.querySelector('#abas [data-a="pers"]'); return !(b && b.style.display === "none") && !(S.usuario && (S.usuario() || {}).papel === "funcionario"); }
  });''')
# Identity in the canonical student builder, no change to the athlete's photo/identity.
rep('app/aluno-builder.js','    var studio = D.studio || "Meu Personal";','''    var MARCA = raiz.MT_IDENTIDADE_MARCA ? raiz.MT_IDENTIDADE_MARCA.doPacote(D) : { principal: D.studio || "Meu Personal", personalizado: false };
    var studio = MARCA.principal;''')
rep('app/aluno-builder.js','    var STUDIO_CURTO = nomeCurto(studio);','    var STUDIO_CURTO = MARCA.personalizado ? MARCA.curto : nomeCurto(studio);')
rep('app/aluno-builder.js','    var PAL = D.PAL || [], LOGOAPP = D.LOGOAPP || "";','''    var PAL = D.PAL || [], LOGOAPP = D.LOGOAPP || "";
    function marcaHtml(comLogo) {
      var imagem = raiz.MT_IDENTIDADE_MARCA && raiz.MT_IDENTIDADE_MARCA.logo(LOGOAPP);
      return "<div class='al-brand' aria-label='Identidade do acompanhamento'>" +
        (comLogo && imagem ? "<img class='al-brand-logo' src='" + imagem + "' alt=''>" : "") +
        "<div class='al-brand-copy'><strong class='al-brand-primary'>" + esc(studio) + "</strong>" +
        (MARCA.secundario ? "<span class='al-brand-secondary'>" + esc(MARCA.secundario) + "</span>" : "") +
        (MARCA.slogan ? "<span class='al-brand-slogan'>" + esc(MARCA.slogan) + "</span>" : "") + "</div></div>";
    }''')
rep('app/aluno-builder.js','      "<div class=\'tpmarca\'>" + (LOGOAPP ? "<img src=\'" + LOGOAPP + "\' alt=\'\'>" : "") + "<span class=\'k\'>" + esc(studio).toUpperCase() + "</span></div>" +','      "<div class=\'tpmarca\'>" + (MARCA.personalizado ? marcaHtml(true) : (LOGOAPP ? "<img src=\'" + LOGOAPP + "\' alt=\'\'>" : "") + "<span class=\'k\'>" + esc(studio).toUpperCase() + "</span>") + "</div>" +')
rep('app/aluno-builder.js','          "<div style=\'font-size:9.5px;letter-spacing:.22em;font-weight:800;color:rgba(255,255,255,.72);text-transform:uppercase;\'>" + esc(studio).toUpperCase() + "</div>" +','          (MARCA.personalizado ? marcaHtml(true) : "<div style=\'font-size:9.5px;letter-spacing:.22em;font-weight:800;color:rgba(255,255,255,.72);text-transform:uppercase;\'>" + esc(studio).toUpperCase() + "</div>") +')
# Menu/profile coach card already contains the primary name; add the secondary without replacing authorship fields.
rep('app/aluno-builder.js','      "<span style=\'flex:1;min-width:0;\'><span style=\'display:block;font-size:22px;font-weight:900;letter-spacing:-.02em;\'>" + esc(studio) + "</span>" +', '      "<span style=\'flex:1;min-width:0;overflow-wrap:anywhere;\'><span style=\'display:block;font-size:22px;font-weight:900;letter-spacing:-.02em;\'>" + esc(studio) + "</span>" + (MARCA.secundario ? "<span class=\'al-brand-secondary\'>" + esc(MARCA.secundario) + "</span>" : "") +')
brandcss=".al-brand{display:flex;align-items:center;gap:10px;min-width:0;color:inherit}.al-brand-copy{min-width:0;overflow-wrap:anywhere}.al-brand .al-brand-logo{width:40px;height:40px;object-fit:contain;border-radius:8px;flex:none}.al-brand-primary{display:block;font-size:clamp(17px,4.8vw,24px);line-height:1.1;font-weight:900;letter-spacing:-.025em;text-transform:none}.al-brand-secondary,.al-brand-slogan{display:block;font-size:12px;line-height:1.4;margin-top:5px;overflow-wrap:anywhere}.al-brand-slogan{font-size:11px;opacity:.9}#heroTopo:has(.al-brand){align-items:flex-start!important}#heroTopo .al-brand{align-items:flex-start}#heroTopo .al-brand-logo{width:30px;height:30px}.mgstudio{overflow-wrap:anywhere}"
rep('app/aluno-builder.js','      ".tpmarca{display:flex;align-items:center;gap:9px;margin-bottom:13px}" +','      "'+brandcss+'" +\n      ".tpmarca{display:flex;align-items:center;gap:9px;margin-bottom:13px}" +')
rep('app/aluno-builder.js', '      "var sa=document.getElementById(\'heroSauda\');if(sa){var hh=new Date().getHours();sa.textContent=(hh<12?\'Bom dia\':hh<18?\'Boa tarde\':\'Boa noite\')+\', \'+PRIMEIRO;}" +', '''      "var sa=document.getElementById('heroSauda');if(sa){var hh=new Date().getHours();sa.textContent=(hh<12?'Bom dia':hh<18?'Boa tarde':'Boa noite')+', '+PRIMEIRO;}" +
      // Nomes completos não são truncados; o espaço do hero cresce quando necessário.
      "(function(){var h=document.getElementById('heroTopo'),b=document.getElementById('blocoHoje');if(!h||!b||!h.querySelector('.al-brand'))return;" +
      "function ajusta(){var px=Math.ceil(h.getBoundingClientRect().height);if(!px)return;var cards=b.querySelectorAll('#heroCarr>div');" +
      "for(var i=0;i<cards.length;i++)cards[i].style.minHeight=(px+260)+'px';if(!cards.length&&b.firstElementChild!==h)b.firstElementChild.style.minHeight=(px+18)+'px';}" +
      "ajusta();if(window.ResizeObserver){new ResizeObserver(ajusta).observe(h);}else window.addEventListener('resize',ajusta);})();" +''')
# Loader identifies the studio ONLY from the package belonging to this token, never URL name parameters.
rep('app/index.html','<script src="aluno-skin.js"></script>','<script src="../assets/identidade-marca.js"></script>\n<script src="aluno-skin.js"></script>')
rep('app/index.html','<title>Meu app — TORQUE FIT</title>', '<title>Meu app — TORQUE ON</title>')
rep('app/index.html','<div class="box"><div class="marca">TORQUE</div><p id="msg">Abrindo seu app…</p></div>', '<div class="box"><img id="marcaAberturaLogo" hidden alt="" style="width:64px;height:64px;object-fit:contain"><div class="marca" id="marcaAberturaNome">TORQUE</div><div id="marcaAberturaSecundario"></div><p id="msg">Abrindo seu app…</p></div>')
rep('app/index.html','  function montaDoPacote(pac) {','''  function marcaAbertura(pac) {
    var C = self.MT_IDENTIDADE_MARCA, d = pac && (pac.dados || (pac.a ? pac : null));
    if (!C || !d || d.tipo === "nutri") return;
    var m = C.doPacote(d), nome = document.getElementById("marcaAberturaNome");
    if (!nome || !m.personalizado) return;
    nome.textContent = m.principal; nome.style.cssText = "font-size:24px;letter-spacing:0;overflow-wrap:anywhere;max-width:360px;margin:14px auto;text-transform:none";
    document.getElementById("marcaAberturaSecundario").textContent = m.secundario;
    var img = document.getElementById("marcaAberturaLogo"), src = C.logo(d.LOGOAPP);
    img.hidden = !src; if (src) img.src = src;
    document.title = m.principal + " · App do aluno";
  }
  // Só a cópia do token atual serve de prévia durante a abertura.
  if (t && t === tAnt) { try { marcaAbertura(JSON.parse(guardado("tq_app_pacote") || "null")); } catch (e) {} }
  function montaDoPacote(pac) {
    marcaAbertura(pac);''')
rep('app/index.html','else { if (!self.MT_MEDALHAS) f.push("medalhas-core.js");', 'else { if (d.identidadeApp && !self.MT_IDENTIDADE_MARCA) f.push("../assets/identidade-marca.js"); if (!self.MT_MEDALHAS) f.push("medalhas-core.js");')
rep('app/app-sw.js','  "../assets/versao.js",','  "../assets/versao.js",\n  "../assets/identidade-marca.js",')
rep('sw.js','  "assets/versao.js",','  "assets/versao.js",\n  "assets/identidade-marca.js",\n  "assets/personal-marca.js",\n  "assets/personal-marca.css",')
rep('assets/personal-estornos.js',"    var html = '<!doctype html>","    var marca = root.MT_IDENTIDADE_MARCA && root.MT_IDENTIDADE_MARCA.resolve(st.config);\n    var html = '<!doctype html>")
rep('assets/personal-estornos.js',"esc((st.config || {}).nome || 'TORQUE PERSONAL') + '</p><dl>'", "esc(marca && marca.personalizado ? marca.principal : (st.config || {}).nome || 'TORQUE PERSONAL') + '</p>' + (marca && marca.personalizado && marca.profissional ? '<p>Profissional responsável: ' + esc(marca.profissional) + '</p>' : '') + '<dl>'")
rep('assets/personal-ferramentas.js','[["marca", "Cores e logo"],', '[["marca", "Identidade, cores e logo"],')
rep('assets/personal-ferramentas.js','    root.querySelectorAll(".fotoguia").forEach', '    var identidade = $("marcaForm"); if (identidade) panes.marca.prepend(identidade.closest(".ptmarca"));\n    root.querySelectorAll(".fotoguia").forEach')

expected = {
'app/aluno-builder.js':'4510cf916c251181564e96b7652ec900999cc9d78531cb1be01446eae75cd65f',
'app/app-sw.js':'985c0c90b5a946a7c2beca2315f74a5c80a3ac5a77fefb66e895cde805a44894',
'app/index.html':'6f03b8d39d9aed05613bb5587d1e3bb6a5429e663a0578370db13fb9a683019c',
'assets/personal-estornos.js':'c809f501145c22faa16fc4fd40d334c58718225074d8e2727a10348999e48e1b',
'assets/personal-ferramentas.js':'b7f9584cb5cdacc6c051c64067c8be7930763d18e0aaa9b1e955e9b70d7ef332',
'personal.html':'38f32500bccaa4e2a7df386df86c96269ba50cf10299432c7eac7a665eb73135',
'sw.js':'7284d7ebaeec8b9c1961685785fb82cea2f1b4684cf4820a534828cd066401d7',
'assets/identidade-marca.js':'d2f38cdc148f2213e04100a0b47587f9916cd8d102bff037738fbacc9728d28f',
'assets/personal-marca.js':'7c5c1024f74ef374ae06e6ce9b3ac3771a430c77580757ca1b7a4437629c4670',
'assets/personal-marca.css':'f19bed4f52061c8eb49c170abb3c7b8cf6d8bf8439ddcab3b7fafa15efaa57a0',
 'tests/test-identidade-marca-core.js':'ead5d34d5cf21048773202d92bed66218a87f76afdff98f69a2a10bf65b80cd6',
 'tests/test-identidade-marca-ui.js':'5afbac47a687dffcaf195d438e3244b6efba40949d7a98247cff90d5b21c547f'
}
for f,d in expected.items():
 actual=hashlib.sha256((root/f).read_bytes()).hexdigest()
 assert actual==d, 'Resultado divergiu: '+f+' '+actual
 print(actual,f)
