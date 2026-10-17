/* Instalação explícita no player e na ficha do personal; sem dependências externas. */
(function(root){'use strict';
 function runtime(cfg){
  var dialog=null,epoch=0,localUrls=[],demoRows=[],demoFiles={},returnFocus=null,requests=[],destroyed=false;
  var labels={rascunho:'Envio incompleto',pendente:'Aguardando análise',respondida:'Resposta do professor',vista:'Resposta vista'};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var uuid=function(){return crypto.randomUUID();};
  function live(){if(destroyed||cfg.isCurrent&&!cfg.isCurrent()){close();throw Error('O aluno ou a conta mudou. Abra novamente.');}}
  function status(message,tick){if(dialog&&(tick==null||tick===epoch)){var el=dialog.querySelector('[data-status]');if(el)el.textContent=message;}}
  function revoke(u){if(u&&u.indexOf('blob:')===0)URL.revokeObjectURL(u);localUrls=localUrls.filter(function(x){return x!==u;});}
  function close(){epoch++;requests.splice(0).forEach(function(c){c.abort();});if(dialog){dialog.querySelectorAll('video,audio').forEach(function(el){el.pause();el.removeAttribute('src');el.load();});dialog.close();dialog.remove();dialog=null;}localUrls.slice().forEach(revoke);if(returnFocus&&returnFocus.isConnected)returnFocus.focus();}
  // Nunca seguir URLs arbitrárias recebidas em uma resposta: mídia privada usa o
  // mesmo projeto da API. O demo só usa blobs locais ou o vídeo público da fixture.
  function mediaUrl(value,upload){var u;try{u=new URL(value,location.href);}catch(_){throw Error('Endereço do arquivo inválido.');}
   if(cfg.demo&&!upload&&(u.protocol==='blob:'&&u.origin===location.origin||u.origin===location.origin&&u.pathname==='/assets/demo-video.webm'))return u.href;
   var base=new URL(cfg.url);if(u.origin!==base.origin||u.username||u.password||u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].indexOf(u.hostname)>=0)||u.pathname.indexOf('/storage/v1/object/'+(upload?'upload/sign/':'sign/')+'tecnica-privada/')!==0)throw Error('Endereço do arquivo indisponível.');return u.href;
  }
  async function request(url,options,timeout){live();var tick=epoch,c=new AbortController(),expired=false;requests.push(c);var timer=setTimeout(function(){expired=true;c.abort();},timeout||45000);
   try{var r=await fetch(url,Object.assign({},options,{signal:c.signal}));live();if(tick!==epoch)throw Error('A tela foi fechada.');return r;}catch(e){if(expired)throw Error('O envio demorou demais. Confira sua conexão e tente novamente.');if(e.name==='AbortError')throw Error('A tela foi fechada.');if(e instanceof TypeError)throw Error('Não foi possível conectar. Confira sua conexão e tente novamente.');throw e;}finally{clearTimeout(timer);requests=requests.filter(function(x){return x!==c;});}
  }
  async function call(action,body){
   live();var tick=epoch;body=Object.assign({},body||{},{action:action,actor:cfg.personal?'personal':'aluno'});
   if(cfg.demo){var r=await demo(action,body);live();if(tick!==epoch)throw Error('A tela foi fechada.');return r;}
   var auth=await cfg.auth();live();if(tick!==epoch)throw Error('A tela foi fechada.');
   body.token=cfg.personal?undefined:cfg.token;body.studentToken=cfg.personal?cfg.token:undefined;body.academia=cfg.personal?cfg.academia:undefined;
   var result=await request(cfg.url.replace(/\/$/,'')+'/functions/v1/tecnica-video',{method:'POST',headers:{apikey:cfg.key,Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(body)});
   var data;try{data=await result.json();}catch(_){throw Error('O serviço não respondeu como esperado. Tente novamente.');}live();if(tick!==epoch)throw Error('A tela foi fechada.');if(!result.ok)throw Error(data.error||'Não foi possível concluir.');return data;
  }
  // Demo exclusivamente em memória; não escreve nem envia mídia a servidores.
  async function demo(action,b){var row=demoRows.find(function(x){return x.id===b.id;});
   if(action==='list')return {items:demoRows.slice().reverse()};
   if(action==='create'){if(row){if(JSON.stringify(row.contexto)!==JSON.stringify(b.context))throw Error('Este envio já foi iniciado com outros dados.');return {item:row};}row={id:b.id,contexto:b.context,estado:'rascunho',comentarios:[],versao:1,criado_em:new Date().toISOString()};demoRows.push(row);return {item:row};}
   if(!row)throw Error('Análise não encontrada.');
   if(action==='get')return {item:row,files:Object.values(demoFiles).filter(function(f){return f.revisao===row.id;})};
   if(action==='complete'){demoFiles[b.fileId].pronto=true;if(!cfg.personal)row.estado='pendente';return {item:row};}
   if(action==='media')return {url:demoFiles[b.fileId].url};
   if(action==='reply'){if(row.comentarios.some(function(c){return c.id===b.comment.id;}))return {item:row};if(b.version!==row.versao)throw Error('Atualize a análise antes de responder.');row.comentarios.push(b.comment);row.estado='respondida';row.versao++;return {item:row};}
   if(action==='seen'){row.estado='vista';return {item:row};}
   if(action==='delete'){Object.keys(demoFiles).forEach(function(id){if(demoFiles[id].revisao===row.id){revoke(demoFiles[id].url);delete demoFiles[id];}});demoRows=demoRows.filter(function(x){return x.id!==row.id;});return {ok:true};}
   throw Error('Ação indisponível na demonstração.');
  }
  function shell(title){close();returnFocus=document.activeElement;dialog=document.createElement('dialog');dialog.className='tq-tech';dialog.setAttribute('aria-label',title);
   dialog.innerHTML='<header><h2>'+esc(title)+'</h2><button type="button" data-close aria-label="Fechar análise">×</button></header><div data-body></div><p data-status role="status" aria-live="polite"></p>';
   document.body.appendChild(dialog);dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',function(e){e.preventDefault();close();});dialog.showModal();return dialog.querySelector('[data-body]');
  }
  async function busy(button,work){var tick=epoch;button.disabled=true;try{live();await work();}catch(e){status(e.message,tick);}finally{if(button.isConnected)button.disabled=false;}}
  async function uploadedAlready(response){
   if(response.status===409)return true;
   if(response.status!==400)return false;
   // Storage também devolve duplicidade como HTTP 400 por compatibilidade.
   // Só esse erro permite retomar: complete ainda confere os bytes e o MIME.
   var error;try{error=await response.json();}catch(_){return false;}
   return !!error&&(error.code==='KeyAlreadyExists'||error.code==='ResourceAlreadyExists'||error.error==='Duplicate');
  }
  async function upload(row,file,kind,fileId){
   var supported=kind==='video'?['video/mp4','video/webm','video/quicktime']:['audio/mp4','audio/mpeg','audio/webm','audio/ogg','audio/wav'];
   if(!file||file.size<1||file.size>(kind==='video'?26214400:8388608)||supported.indexOf(file.type)<0)throw Error(kind==='video'?'Escolha um vídeo MP4, WebM ou MOV de até 25 MB.':'Escolha um áudio M4A, MP3, WebM, OGG ou WAV de até 8 MB.');
   var tick=epoch,id=fileId||uuid();status('Enviando '+(kind==='video'?'vídeo':'áudio')+'…');
   if(cfg.demo){if(demoFiles[id])revoke(demoFiles[id].url);var url=URL.createObjectURL(file);demoFiles[id]={id:id,revisao:row.id,tipo:kind,mime:file.type,bytes:file.size,url:url};}
   else{var data=await call('upload',{id:row.id,fileId:id,mime:file.type,bytes:file.size});
    if(!data.ready){var response=await request(mediaUrl(data.uploadUrl,true),{method:'PUT',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file},120000);if(!response.ok&&!await uploadedAlready(response))throw Error('O envio falhou. Tente novamente com o mesmo arquivo.');}}
   live();if(tick!==epoch)throw Error('A tela foi fechada.');await call('complete',{id:row.id,fileId:id});return id;
  }
  async function open(context){
   live();var host=shell(cfg.personal?'Correções de execução':'Minha execução'),tick=epoch;
   if(cfg.demo)host.innerHTML='<p class="tq-tech-muted">Demonstração: vídeos e respostas ficam apenas nesta página.</p>';
   if(context&&!cfg.personal){
    var box=document.createElement('section');box.innerHTML='<h3>'+esc(context.exercicio)+'</h3><p>'+esc(context.ficha)+' · série '+esc(context.serie)+'</p><label>Vídeo da execução<input type="file" accept="video/mp4,video/webm,video/quicktime" capture="environment"></label><p class="tq-tech-muted">Até 2 minutos e 25 MB. Apenas você e sua equipe de acompanhamento terão acesso.</p><video controls playsinline preload="metadata" hidden></video><label>O que você quer conferir?<textarea rows="2" maxlength="1000" placeholder="Ex.: posição dos braços"></textarea></label><button type="button" data-send>Enviar para análise</button>';
    host.appendChild(box);var chosen=null,row=null,fileId=null,reviewId=null,draftContext=null,previewUrl=null,preview=box.querySelector('video'),input=box.querySelector('input'),note=box.querySelector('textarea');
    input.onchange=function(){revoke(previewUrl);preview.pause();preview.removeAttribute('src');preview.load();chosen=input.files[0]||null;row=null;fileId=null;reviewId=null;draftContext=null;note.readOnly=false;if(chosen&&(chosen.size<1||chosen.size>26214400||['video/mp4','video/webm','video/quicktime'].indexOf(chosen.type)<0)){chosen=null;status('Escolha um vídeo MP4, WebM ou MOV de até 25 MB.',tick);}preview.hidden=!chosen;if(chosen){previewUrl=URL.createObjectURL(chosen);localUrls.push(previewUrl);preview.src=previewUrl;}};
    // WebM gravado pelo navegador pode chegar sem duração no cabeçalho. O player
    // local resolve a duração ao buscar o final; isto não é verificação no servidor.
    preview.onloadedmetadata=function(){if(preview.duration===Infinity){preview.onseeked=function(){preview.onseeked=null;preview.currentTime=0;};preview.currentTime=1e10;}};
    preview.onerror=function(){status('Este formato não pôde ser reproduzido. Tente um vídeo MP4 ou WebM.',tick);};
    box.querySelector('[data-send]').onclick=function(){var btn=this;busy(btn,async function(){if(!chosen)throw Error('Selecione ou grave um vídeo.');if(!Number.isFinite(preview.duration)||preview.duration<=0||preview.duration>120)throw Error('Escolha um vídeo legível de até 2 minutos.');input.disabled=true;note.readOnly=true;reviewId=reviewId||uuid();draftContext=draftContext||Object.assign({},context,{nota:note.value});
     try{if(!row)row=(await call('create',{id:reviewId,context:draftContext})).item;fileId=fileId||uuid();await upload(row,chosen,'video',fileId);await detail(row.id);}finally{if(input.isConnected)input.disabled=false;}
    });};
   }
   var list=document.createElement('section');list.innerHTML='<h3>Análises</h3><p>Carregando…</p>';host.appendChild(list);
   try{var r=await call('list');list.innerHTML='<h3>Análises</h3>'+(r.items.length?r.items.map(function(x){return '<button type="button" class="tq-tech-row" data-review="'+esc(x.id)+'"><span><b>'+esc(x.contexto.exercicio)+'</b><small>Série '+esc(x.contexto.serie)+' · '+esc(x.contexto.aluno||new Date(x.criado_em).toLocaleDateString('pt-BR'))+'</small></span><span>'+esc(x.revogado?'Acesso revogado':labels[x.estado])+'</span></button>';}).join(''):'<p class="tq-tech-muted">Nenhuma análise enviada.</p>');list.querySelectorAll('[data-review]').forEach(function(b){b.onclick=function(){detail(b.dataset.review);};});}catch(e){status(e.message,tick);list.innerHTML='';}
  }
  async function detail(id){
   var tick=epoch;
   try{live();var host=shell('Análise da execução');tick=epoch;status('Carregando…');var result=await call('get',{id:id}),row=result.item,files=result.files,videoFile=files.find(function(f){return f.tipo==='video'&&f.pronto;});
   host.innerHTML='<button type="button" data-back>‹ Minhas análises</button><h3>'+esc(row.contexto.exercicio)+'</h3><p>'+esc(row.contexto.ficha)+' · série '+esc(row.contexto.serie)+' · '+esc(labels[row.estado])+'</p>'+(row.contexto.nota?'<p>'+esc(row.contexto.nota)+'</p>':'')+'<div class="tq-tech-media"><video controls playsinline preload="metadata"></video><canvas width="640" height="360" aria-label="Marcação no vídeo" hidden></canvas></div><div data-comments></div><div data-reply></div><button type="button" class="tq-tech-delete" data-delete>Excluir vídeo e análise</button>';
   if(cfg.demo){var demoNotice=document.createElement('p');demoNotice.className='tq-tech-muted';demoNotice.textContent='Demonstração: vídeos e respostas ficam apenas nesta página.';host.prepend(demoNotice);}
   host.querySelector('[data-back]').onclick=function(){open().catch(function(e){status(e.message,tick);});};var v=host.querySelector('video'),canvas=host.querySelector('canvas'),lines=[];
   if(row.revogado){v.hidden=true;host.querySelector('.tq-tech-media').hidden=true;status('Acesso do aluno revogado. A mídia está bloqueada. Você pode excluir os arquivos e a análise.');}
   else if(videoFile)v.src=mediaUrl((await call('media',{id:id,fileId:videoFile.id})).url);else{v.hidden=true;status('Este envio está incompleto. Você pode excluí-lo e enviar novamente.');}
   v.onerror=function(){status('Não foi possível reproduzir o vídeo. Volte à lista e abra novamente para renovar o acesso.',tick);};
   var comments=host.querySelector('[data-comments]');
   (row.comentarios||[]).forEach(function(c){var section=document.createElement('section');section.className='tq-tech-comment';section.innerHTML='<button type="button" data-seek>'+esc(Number(c.segundo).toFixed(1))+' s · Ver orientação</button><p>'+esc(c.texto)+'</p>'+(c.audioId?'<button type="button" data-audio>Ouvir resposta</button>':'');section.querySelector('[data-seek]').onclick=function(){v.currentTime=Number(c.segundo)||0;v.pause();lines=c.tracos||[];canvas.hidden=!lines.length;draw();};if(c.audioId)section.querySelector('[data-audio]').onclick=function(){var b=this;busy(b,async function(){var audio=document.createElement('audio');audio.controls=true;audio.src=mediaUrl((await call('media',{id:id,fileId:c.audioId})).url);section.appendChild(audio);b.hidden=true;await audio.play().catch(function(){});});};comments.appendChild(section);});
   function draw(){var g=canvas.getContext('2d');g.clearRect(0,0,canvas.width,canvas.height);g.strokeStyle='#ffcc33';g.lineWidth=4;g.lineCap='round';lines.forEach(function(line){g.beginPath();line.forEach(function(p,i){g[i?'lineTo':'moveTo'](p[0]*canvas.width,p[1]*canvas.height);});g.stroke();});}
   v.onplay=function(){canvas.hidden=true;};
   if(cfg.personal&&videoFile&&!row.revogado){
    var reply=host.querySelector('[data-reply]');reply.innerHTML='<h3>Sua orientação</h3><label>Ponto do vídeo (segundos)<input type="number" data-second min="0" max="120" step="0.1" value="0"></label><div class="tq-tech-actions"><button type="button" data-now>Usar ponto atual</button><button type="button" data-draw>Marcar no vídeo</button><button type="button" data-clear>Limpar marcas</button></div><label>Orientação<textarea maxlength="3000" rows="3"></textarea></label><label>Resposta em áudio (opcional)<input type="file" accept="audio/mp4,audio/mpeg,audio/webm,audio/ogg,audio/wav" data-audio-file></label><button type="button" data-answer>Enviar orientação</button>';
    var second=reply.querySelector('[data-second]');reply.querySelector('[data-now]').onclick=function(){second.value=v.currentTime.toFixed(1);};reply.querySelector('[data-draw]').onclick=function(){v.pause();second.value=v.currentTime.toFixed(1);canvas.hidden=!canvas.hidden;draw();};reply.querySelector('[data-clear]').onclick=function(){lines=[];draw();};
    var drawing=false;canvas.onpointerdown=function(e){if(lines.length>=20)return;drawing=true;lines.push([]);canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=function(e){if(!drawing||lines[lines.length-1].length>=150)return;var rect=canvas.getBoundingClientRect();lines[lines.length-1].push([Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))]);draw();};canvas.onpointerup=canvas.onpointercancel=function(){drawing=false;};
    var commentId=uuid(),audioId=null,audioFile=null,pendingComment=null;
    reply.querySelector('[data-audio-file]').onchange=function(){audioFile=this.files[0]||null;audioId=null;};
    reply.querySelector('[data-answer]').onclick=function(){var b=this;busy(b,async function(){
     if(!pendingComment){var value=Number(second.value),text=reply.querySelector('textarea').value.trim();if(!text&&!audioFile)throw Error('Escreva uma orientação ou selecione um áudio.');if(!Number.isFinite(value)||value<0||value>120)throw Error('Marque um ponto entre 0 e 120 segundos.');if(audioFile){if(audioFile.size<1||audioFile.size>8388608||['audio/mp4','audio/mpeg','audio/webm','audio/ogg','audio/wav'].indexOf(audioFile.type)<0)throw Error('Escolha um áudio M4A, MP3, WebM, OGG ou WAV de até 8 MB.');audioId=audioId||uuid();}pendingComment={id:commentId,texto:text,segundo:value,tracos:JSON.parse(JSON.stringify(lines)),audioId:audioId};}
     reply.querySelectorAll('input,textarea,button').forEach(function(el){if(el!==b)el.disabled=true;});canvas.hidden=true;
     if(audioFile)await upload(row,audioFile,'audio',audioId);await call('reply',{id:id,version:row.versao,comment:pendingComment});if(await detail(id))status('Orientação enviada.');
    });};
   }else if(!cfg.personal&&row.estado==='respondida'){var seen=document.createElement('button');seen.type='button';seen.textContent='Marcar resposta como vista';seen.onclick=function(){busy(seen,async function(){await call('seen',{id:id,version:row.versao});await detail(id);});};host.appendChild(seen);}
   host.querySelector('[data-delete]').onclick=function(){var b=this;if(!confirm('Excluir este vídeo, áudios e respostas? Esta ação não pode ser desfeita.'))return;busy(b,async function(){await call('delete',{id:id});await open();});};
   if(videoFile)status('');return true;
   }catch(e){status(e.message,tick);return false;}
  }
  if(cfg.demo){var demoId=uuid(),demoFileId=uuid();demoRows.push({id:demoId,contexto:{exercicio:'Supino reto · demonstração',ficha:'Treino A',serie:1,nota:'Exemplo para experimentar a análise de execução.'},estado:cfg.personal?'pendente':'respondida',comentarios:cfg.personal?[]:[{id:uuid(),segundo:1,texto:'Exemplo: controle a descida e mantenha os pés apoiados.',tracos:[[[.25,.6],[.75,.6]]],audioId:null}],versao:1,criado_em:new Date().toISOString()});demoFiles[demoFileId]={id:demoFileId,revisao:demoId,tipo:'video',pronto:true,mime:'video/webm',bytes:295481,url:new URL('/assets/demo-video.webm',location.href).href};}
  window.addEventListener('mt:conta-divergente',close);
  return {open:open,close:close,destroy:function(){destroyed=true;close();window.removeEventListener('mt:conta-divergente',close);Object.values(demoFiles).forEach(function(f){revoke(f.url);});demoFiles={};demoRows=[];}};
 }
 root.MT_TECNICA_VIDEO={runtime:runtime};if(typeof module==='object'&&module.exports)module.exports=root.MT_TECNICA_VIDEO;
})(typeof self!=='undefined'?self:this);
