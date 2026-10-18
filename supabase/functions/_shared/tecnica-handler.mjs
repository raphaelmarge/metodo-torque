// Adaptador injetável: nenhuma credencial ou token de aluno é incluído em logs/respostas.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','audio/mp4':'m4a','audio/mpeg':'mp3','audio/webm':'webm','audio/ogg':'ogg','audio/wav':'wav'};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const text=(x,n)=>typeof x==='string'?x.trim().slice(0,n):'';
const clean=r=>({id:r.id,contexto:r.contexto,estado:r.estado,comentarios:r.comentarios,versao:r.versao,criado_em:r.criado_em});
export function context(value){
  const c=value&&typeof value==='object'?value:{};
  const x={exercicio:text(c.exercicio,160),exercicioId:text(c.exercicioId,180),sessao:text(c.sessao,180),ficha:text(c.ficha,160),serie:Number(c.serie),reps:text(String(c.reps??''),40),carga:text(String(c.carga??''),40),nota:text(c.nota,1000)};
  if(!x.exercicio||!Number.isInteger(x.serie)||x.serie<1||x.serie>50)fail('Confira o exercício e a série.');
  return x;
}
export function comment(value,duration=120){
  const c=value&&typeof value==='object'?value:{};
  if(!UUID.test(c.id||''))fail('Identificação da resposta inválida.');
  const x={id:c.id,texto:text(c.texto,3000),segundo:Number(c.segundo),tracos:[],audioId:c.audioId||null};
  if(!Number.isFinite(x.segundo)||x.segundo<0||x.segundo>duration)fail('Marque um ponto válido do vídeo.');
  if(x.audioId&&!UUID.test(x.audioId))fail('Áudio inválido.');
  if(!x.texto&&!x.audioId)fail('Escreva uma orientação ou inclua um áudio.');
  if(c.tracos!=null){if(!Array.isArray(c.tracos)||c.tracos.length>20)fail('Há marcações demais.');
    x.tracos=c.tracos.map(line=>{if(!Array.isArray(line)||line.length>150)fail('Marcação inválida.');return line.map(p=>{if(!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))fail('Marcação inválida.');return p;});});}
  return x;
}
export function handler(db){return async(body,authorization)=>{
  if(!body||typeof body!=='object'||Array.isArray(body))fail('Pedido inválido.');
  const professional=body.actor==='personal';
  // As duas identidades são verificadas novamente em CADA operação.
  let who=professional?await db.professional(authorization,body.academia):await db.student(body.token);
  if(!who)fail('Seu acesso expirou. Entre novamente.',401);
  const action=body.action;
  if(action==='list'){
    // A limpeza usa apenas tombstones desta academia depois do vencimento de
    // todos os links de upload. Falhas não tornam dados excluídos acessíveis.
    if(db.cleanup)await db.cleanup(who.academia).catch(()=>{});
    const rows=(await db.list(who,professional?body.studentToken:null)).filter(r=>r.academia_id===who.academia&&!r.apagado_em&&(professional?(!body.studentToken||r.token===body.studentToken):r.token===who.token));
    const active=new Set(await db.activeTokens(who.academia,[...new Set(rows.map(r=>r.token))]));
    const items=rows.filter(r=>professional||active.has(r.token)).map(r=>active.has(r.token)?clean(r):({...clean(r),comentarios:[],revogado:true}));
    return {items};
  }
  if(action==='create'){
    if(professional)fail('O vídeo deve ser enviado pelo aluno.',403);
    if(!UUID.test(body.id||''))fail('Identificação inválida.');
    // A RPC trava a linha do aluno, valida replay e aplica a quota no mesmo commit.
    return {item:clean(await db.create({id:body.id,token:who.token,academia_id:who.academia,contexto:context(body.context)}))};
  }
  if(!UUID.test(body.id||''))fail('Registro indisponível.',404);
  const review=await db.review(body.id);
  if(!review||review.academia_id!==who.academia||!professional&&review.token!==who.token||professional&&body.studentToken&&review.token!==body.studentToken)fail('Registro indisponível.',404);
  const active=await db.active(review.token);
  if(!active&&!(professional&&(action==='get'||action==='delete')))fail('Registro indisponível.',404);
  if(review.apagado_em&&action!=='delete')fail('Registro indisponível.',404);
  // A equipe pode remover os objetos de um acesso revogado, sem reabrir mídia.
  if(!active&&action==='get')return {item:{...clean(review),comentarios:[],revogado:true},files:[]};
  if(action==='get')return {item:clean(review),files:await db.files(review.id)};
  if(action==='upload'){
    const kind=professional?'audio':'video',mime=text(body.mime,80);
    if(!UUID.test(body.fileId||'')||!TYPES[mime]||!mime.startsWith(kind+'/')||!Number.isInteger(body.bytes)||body.bytes<1||body.bytes>(professional?8388608:26214400))fail('Use um arquivo compatível, até 25 MB para vídeo ou 8 MB para áudio.');
    if(!professional&&review.estado!=='rascunho'){
      const prior=(await db.files(review.id)).find(f=>f.id===body.fileId&&f.tipo==='video'&&f.pronto&&f.mime===mime&&f.bytes===body.bytes);
      if(prior)return {fileId:prior.id,ready:true};
      fail('Este vídeo já foi enviado. Abra uma nova análise.',409);
    }
    // Reserva atômica por revisão: duas requisições não abrem duas vagas de vídeo.
    const file=await db.prepareFile({id:body.fileId,revisao_id:review.id,academia_id:who.academia,tipo:kind,mime,bytes:body.bytes});
    if(file.pronto)return {fileId:file.id,ready:true};
    return {fileId:file.id,...await db.signUpload(file.caminho)};
  }
  const files=await db.files(review.id);
  if(action==='complete'){
    const file=files.find(f=>f.id===body.fileId&&f.tipo===(professional?'audio':'video'));
    if(!file)fail('Arquivo indisponível.',404);
    if(!file.pronto){const actual=await db.info(file.caminho);if(!actual||actual.bytes!==file.bytes||actual.mime.split(';')[0]!==file.mime)fail('O envio não terminou. Tente novamente.',409);await db.fileReady(file.id,review.id,who.academia);}
    if(!professional&&review.estado==='rascunho')return {item:clean(await db.update(review,{estado:'pendente'}))};
    return {item:clean(review)};
  }
  if(action==='media'){
    const file=files.find(f=>f.id===body.fileId&&f.pronto);
    if(!file)fail('Arquivo indisponível.',404);
    return {url:await db.signRead(file.caminho),expiresIn:300};
  }
  if(action==='reply'){
    if(!professional||review.estado==='rascunho')fail('Resposta não permitida.',403);
    const c=comment(body.comment);
    const previous=(review.comentarios||[]).find(x=>x.id===c.id);
    if(previous){if(JSON.stringify(comment(previous))!==JSON.stringify(c))fail('Esta resposta já foi salva com outro conteúdo. Atualize a análise.',409);return {item:clean(review)};}
    if(body.version!==review.versao)fail('Outra resposta chegou. Atualize antes de salvar.',409);
    if(c.audioId&&!files.some(f=>f.id===c.audioId&&f.tipo==='audio'&&f.pronto))fail('Conclua o envio do áudio primeiro.');
    if((review.comentarios||[]).length>=50)fail('Limite de respostas atingido.');
    c.autor=who.user;c.em=new Date().toISOString();
    return {item:clean(await db.update(review,{estado:'respondida',comentarios:[...(review.comentarios||[]),c]}))};
  }
  if(action==='seen'){
    if(professional)fail('Ação não permitida.',403);
    if(body.version!==review.versao)fail('Há uma nova resposta. Atualize a análise.',409);
    return {item:clean(review.estado==='respondida'?await db.update(review,{estado:'vista'}):review)};
  }
  if(action==='delete'){
    // Tombstone primeiro bloqueia novos uploads, respostas e URLs de leitura.
    // Mantém caminhos privados para remover uploads assinados que cheguem tarde.
    await db.tombstone(review.id,who.academia);const all=await db.files(review.id);
    await db.removeFiles(all.map(f=>f.caminho));return {ok:true};
  }
  fail('Ação desconhecida.');
};}
export {TYPES};
