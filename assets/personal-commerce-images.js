/* Imagens locais de produtos e parceiros. Rascunhos não alteram o cadastro. */
(function (root) {
  'use strict';
  var drafts = {loja:'', clube:''}, controls = {}, ctx;
  function safe(v) { return typeof v === 'string' && v.length <= 120000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : ''; }
  function process(file, kind) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Use uma imagem PNG, JPEG ou WebP.'));
      if (file.size > 8 * 1024 * 1024) return reject(new Error('A imagem deve ter no máximo 8 MB.'));
      var url = URL.createObjectURL(file), im = new Image();
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir esta imagem.')); };
      im.onload = function () {
        URL.revokeObjectURL(url);
        try {
          if (!im.width || !im.height || im.width * im.height > 40000000) throw new Error('Imagem muito grande. Use até 40 megapixels.');
          var cv = document.createElement('canvas'), size = 320, data;
          do {
            cv.width = cv.height = size;
            var g = cv.getContext('2d');
            if (kind === 'clube') {
              var scale = Math.min(size / im.width, size / im.height);
              g.drawImage(im, (size - im.width * scale) / 2, (size - im.height * scale) / 2, im.width * scale, im.height * scale);
              data = cv.toDataURL('image/png');
            } else {
              var side = Math.min(im.width, im.height);
              g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
              g.drawImage(im, (im.width-side)/2, (im.height-side)/2, side, side, 0, 0, size, size);
              data = cv.toDataURL('image/jpeg', .8);
            }
            size = Math.floor(size * .75);
          } while (data.length > 120000 && size >= 80);
          if (!safe(data)) throw new Error('Imagem muito detalhada. Escolha uma versão menor.');
          resolve(data);
        } catch (e) { reject(e); }
      };
      im.src = url;
    });
  }
  function editor(kind, initial, changed) {
    var box = document.createElement('fieldset'); box.style.cssText = 'margin:12px 0;min-width:0;border:1px solid var(--linha);border-radius:10px;padding:12px';
    var legend = document.createElement('legend'); legend.textContent = kind === 'clube' ? 'Logo do parceiro (opcional)' : 'Foto do produto (opcional)'; box.appendChild(legend);
    var img = document.createElement('img'); img.alt = 'Prévia da imagem'; img.style.cssText = 'display:block;width:96px;height:96px;object-fit:'+(kind==='clube'?'contain':'cover')+';border-radius:8px;margin-bottom:8px';box.appendChild(img);
    var input = document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.hidden=true;box.appendChild(input);
    var pick=document.createElement('button');pick.type='button';pick.className='btn sec mini';box.appendChild(pick);
    var remove=document.createElement('button');remove.type='button';remove.className='btn sec mini';remove.textContent='Remover imagem';remove.style.marginLeft='8px';box.appendChild(remove);
    var help=document.createElement('p');help.className='muted';help.textContent='PNG, JPEG ou WebP, até 8 MB. '+(kind==='clube'?'O logo é mantido inteiro, sem distorção.':'A foto é cortada em quadrado pelo centro.');box.appendChild(help);
    var status=document.createElement('p');status.setAttribute('role','status');box.appendChild(status);
    var value=initial||'', generation=0, busy=false;
    function render(){img.hidden=!value;img.style.display=value?'block':'none';if(value)img.src=value;else img.removeAttribute('src');pick.textContent=value?'Trocar imagem':'Escolher imagem';remove.hidden=!value;}
    function set(v){value=v;render();changed(v);}
    pick.onclick=function(){input.click();};remove.onclick=function(){generation++;busy=false;pick.disabled=false;status.textContent='';set('');};
    input.onchange=async function(){var f=input.files&&input.files[0];input.value='';if(!f)return;var gen=++generation;busy=true;pick.disabled=true;status.textContent='Preparando imagem…';try{var v=await process(f,kind);if(gen!==generation)return;set(v);status.textContent='Confira a prévia antes de salvar.';}catch(e){if(gen===generation)status.textContent=e.message;}finally{if(gen===generation){busy=false;pick.disabled=false;}}};
    render();return {box:box,value:function(){return value;},busy:function(){return busy;},reset:function(){generation++;busy=false;pick.disabled=false;status.textContent='';set('');},dispose:function(){generation++;}};
  }
  function init(context) {
    ctx=context;
    ['clube','loja'].forEach(function(kind){controls[kind]=editor(kind,'',function(v){drafts[kind]=v;});document.getElementById(kind+'Add').before(controls[kind].box);});
    document.addEventListener('click',function(e){
      var bt=e.target.closest('[data-commerce-image]');if(!bt)return;
      var kind=bt.dataset.commerceImage, key=kind==='clube'?'clube':'lojaItens', index=+bt.dataset.index;
      var snapshot=((ctx.load().config||{})[key]||[])[index];if(!snapshot)return;
      var fingerprint=JSON.stringify(snapshot), dialog=document.createElement('dialog');dialog.style.cssText='max-width:460px;width:calc(100% - 32px);background:var(--pt-card,#14161c);color:var(--pt-txt,#fff);border:1px solid #555;border-radius:14px';
      var heading=document.createElement('h2');heading.textContent=snapshot.n;dialog.appendChild(heading);
      var control=editor(kind,snapshot.f||'',function(){});dialog.appendChild(control.box);
      var status=document.createElement('p');status.setAttribute('role','status');dialog.appendChild(status);
      var save=document.createElement('button');save.type='button';save.className='btn';save.textContent='Salvar imagem';dialog.appendChild(save);
      var cancel=document.createElement('button');cancel.type='button';cancel.className='btn sec';cancel.textContent='Cancelar';cancel.style.marginLeft='8px';dialog.appendChild(cancel);
      function close(){control.dispose();dialog.close();dialog.remove();}cancel.onclick=close;dialog.addEventListener('cancel',function(e){e.preventDefault();close();});
      save.onclick=function(){
        if(control.busy()){status.textContent='Aguarde a imagem terminar de carregar.';return;}
        var st=JSON.parse(JSON.stringify(ctx.load())),list=(st.config||{})[key]||[];
        var it=snapshot.id?list.find(function(v){return v.id===snapshot.id;}):list[index];
        if(!it||JSON.stringify(it)!==fingerprint){status.textContent='Este cadastro mudou. Cancele e abra a imagem novamente.';return;}
        if(control.value())it.f=control.value();else delete it.f;
        ctx.mark(st);
        if(!ctx.save(st)){status.textContent='Não foi possível salvar. Sua prévia foi mantida para tentar novamente.';return;}
        ctx.render(st);document.getElementById(kind+'Status').textContent='Imagem salva. Use Publicar para atualizar os alunos.';close();
      };
      document.body.appendChild(dialog);dialog.showModal();
    });
  }
  root.MT_COMMERCE_IMAGES={init:init,safe:safe,draft:function(k){return drafts[k];},busy:function(k){return controls[k]&&controls[k].busy();},reset:function(k){controls[k].reset();},process:process};
})(window);
