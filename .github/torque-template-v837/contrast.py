from pathlib import Path
import hashlib,json
p=Path('app/aluno-skin.js');assert hashlib.sha256(p.read_bytes()).hexdigest()=='25386cda47db803d5ca70ce0c9b6a9715ab94f8838ce26eee6b7b7fce19bb4d7'
s=p.read_text();old='  raiz.MT_APP_SKIN = { css: css, js: js };';assert s.count(old)==1
css='html.claro #guiaBox.player-template #gPe #gSerie,html.claro #guiaBox.player-template #gPe .prin{color:#fff!important}#guiaBox.player-template #gGif{border:0!important}'
s=s.replace(old,'  css += '+json.dumps(css)+';\n'+old);p.write_text(s)
t=Path('tests/test-aluno-template-player.js');assert hashlib.sha256(t.read_bytes()).hexdigest()=='d8423691c03083f6eca800f332fdb6017d11d9e1862fd070a7efe74502565f6e'
x=t.read_text();old="   ok(await q.locator('#gTemplateTabs [role=tab]').count()===3,width+' '+theme+': três abas únicas');";assert x.count(old)==1
x=x.replace(old,old+"\n   ok(await q.locator('#gSerie').evaluate((b,theme)=>getComputedStyle(b).color===(theme==='claro'?'rgb(255, 255, 255)':'rgb(6, 37, 26)'),theme),width+' '+theme+': texto da ação principal com contraste');");t.write_text(x)
assert hashlib.sha256(p.read_bytes()).hexdigest()=='62ed82138f681e4c51fa45eb18351c6216fcaa12677e791c1076608af8a85e7b'
assert hashlib.sha256(t.read_bytes()).hexdigest()=='34704272a89663a24e3a1ee92f5b433c0bcacba415e43801f51b64942af37785'
