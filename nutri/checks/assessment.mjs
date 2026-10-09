import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=fs.existsSync(new URL('../dist/assessment.js',import.meta.url))?new URL('../dist/',import.meta.url):new URL('../',import.meta.url);
const moduleURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const assessmentURL=moduleURL(fs.readFileSync(new URL('assessment.js',root),'utf8'));
const medalURL=moduleURL(fs.readFileSync(new URL('vendor/medalha-visual.js',root),'utf8'));
const {numberValue,fieldValue,validDay,recordDay,visibleRecords,composition,difference,safePhoto,createAssessments}=await import(assessmentURL);
const patientSource=fs.readFileSync(new URL('patient-experience.js',root),'utf8')
  .replace("'./assessment.js'",JSON.stringify(assessmentURL)).replace("'./vendor/medalha-visual.js'",JSON.stringify(medalURL));
const {journeyLevel}=await import(moduleURL(patientSource));

const tests=[];
const test=(name,fn)=>tests.push({name,fn});
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unescape=v=>v.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const a=(id,data={},extra={})=>({id,patient_id:'a',clinician_id:'pro',created_by:'pro',kind:'assessment',visibility:'patient',version:1,title:id,created_at:'2026-01-01T15:00:00Z',data,...extra});
const photo='data:image/png;base64,aGVsbG8=';

function harness({role='nutri',records=[],selected='a',user='pro'}={}){
  const state={role,records,selected,user:{id:user},demo:false,patients:[{id:'a',name:'Paciente A'},{id:'b',name:'Paciente B'}],clinic:{name:'Consultório',professional_name:'Nutri',crn:'CRN exemplo'}};
  let draft,lastHTML='',printed='';const saved=[],nodes=new Map(),buttons=[];
  const parse=html=>{
    nodes.clear();
    for(const m of html.matchAll(/<(input)\b([^>]*)>|<(textarea|select)\b([^>]*)>([\s\S]*?)<\/\3>/g)){
      const tag=m[1]||m[3],content=m[5]||'';
      const attrs=m[2]||m[4]||'',id=attrs.match(/\bid="([^"]+)"/)?.[1];if(!id)continue;
      let value=unescape(attrs.match(/\bvalue="([^"]*)"/)?.[1]||'');
      if(tag==='textarea')value=unescape(content);
      if(tag==='select'){const opts=[...content.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)],o=opts.find(x=>/\bselected\b/.test(x[1]))||opts[0];value=unescape(o?.[1].match(/\bvalue="([^"]*)"/)?.[1]??o?.[2]??'');}
      nodes.set(id,{value,files:[],style:{},dataset:{},disabled:attrs.includes('disabled')});
    }
  };
  globalThis.document={querySelector:sel=>nodes.get(sel.slice(1))||null,getElementById:id=>nodes.get(id)||null,querySelectorAll:sel=>sel==='[data-body-tab]'?buttons:[]};
  globalThis.window={open:()=>({document:{write:html=>printed=html,close(){}}})};
  const H={state:()=>state,esc:escape,today:()=> '2026-10-08',dateLabel:x=>x,heading:(_k,t,s,action='')=>'<h1>'+t+'</h1><p>'+s+'</p>'+action,render:()=>{},modal:(_title,html)=>{lastHTML=html;parse(html);},run:fn=>fn(),logs:()=>[],moodName:x=>x};
  const A=createAssessments(H,{pat:id=>state.patients.find(x=>x.id===(id||state.selected)),
    saveRecord:async(...args)=>{saved.push(args);},
    draftModal:(title,body,submit,key)=>{draft={title,body,submit,key};parse(body);},
    imageFile:async()=>photo,bind(){}});
  return {A,state,saved,nodes,buttons,get draft(){return draft;},get html(){return lastHTML;},get printed(){return printed;}};
}

test('Missing, malformed and impossible measurements do not become clinical defaults',()=>{
  for(const v of [null,undefined,'',false,{},[],NaN,Infinity,'<img src=x>'])assert.equal(numberValue(v),null);
  assert.equal(numberValue('68,2'),68.2);
  assert.equal(numberValue(0),0);
  assert.equal(fieldValue({weight:0},'weight'),null);
  assert.equal(fieldValue({fat:0},'fat'),0);
  assert.equal(fieldValue({height:999},'height'),null);
  assert.deepEqual(composition({}),{weight:null,height:null,fat:null,fatMass:null,leanMass:null,bmi:null,whr:null,muscle:null,water:null});
});
test('Composition distinguishes muscle from calculated fat-free mass and retains missing fields',()=>{
  const c=composition({weight:80,height:200,fat:25});
  assert.equal(c.bmi,20);assert.equal(c.fatMass,20);assert.equal(c.leanMass,60);assert.equal(c.muscle,null);
  assert.equal(composition({weight:80}).leanMass,null);
  assert.equal(composition({weight:80,fat:0}).fatMass,0);
  assert.equal(difference(null,40),null);assert.equal(difference(27.5,29.1),-1.6);
});
test('Visibility, archival and patient isolation apply before chronological comparison',()=>{
  const rows=[a('later',{day:'2026-06-01'}),a('private',{day:'2026-01-01'},{visibility:'private'}),a('other',{day:'2026-01-01'},{patient_id:'b'}),a('archive',{archived:true}),a('earlier',{day:'2025-12-01'})];
  assert.deepEqual(visibleRecords(rows,'a','patient').map(x=>x.id),['earlier','later']);
  assert.deepEqual(visibleRecords(rows,'a','nutri').map(x=>x.id),['earlier','private','later']);
  assert.equal(visibleRecords(rows,'','nutri').length,0);
  assert.equal(recordDay(a('legacy',{})),'2026-01-01');
  assert.equal(validDay('2026-02-31'),false);assert.equal(validDay('2024-02-29'),true);
});
test('Equal-date records have stable ordering and imported invalid dates fall back to creation',()=>{
  assert.deepEqual(visibleRecords([a('z'),a('a'),a('m')],'a','patient').map(x=>x.id),['a','m','z']);
  assert.equal(recordDay(a('bad',{day:'2026-99-99'})),'2026-01-01');
});
test('Private photos cannot load remote pixels or execute SVG/data URLs',()=>{
  assert.equal(safePhoto(photo),photo);
  for(const v of ['https://tracker.invalid/photo.jpg','javascript:alert(1)','data:image/svg+xml;base64,aaaa','data:image/png;base64,!!','data:image/jpeg;base64,'+'a'.repeat(260000)])assert.equal(safePhoto(v),'');
});
test('Editing an assessment preserves private visibility, unknown JSON and selected patient identity',async()=>{
  const record=a('existing',{day:'2026-02-01',weight:70,waist:80,circ:{legacyNote:'kept'},external:{reference:'keep'}},{visibility:'private',version:4});
  const h=harness({records:[record]});h.A.edit(record);
  assert.match(h.draft.key,/:v4$/);
  h.nodes.get('body-waist').value='79.5';h.state.selected='b';
  await h.draft.submit();
  const [kind,title,data,visibility,existing,patientId]=h.saved[0];
  assert.equal(kind,'assessment');assert.equal(title,'existing');assert.equal(visibility,'private');assert.equal(existing,record);assert.equal(patientId,'a');
  assert.equal(data.waist,79.5);assert.equal(data.circ.legacyNote,'kept');assert.deepEqual(data.external,{reference:'keep'});
  assert.equal(data.sex,'');assert.equal(data.age,null);
});
test('An explicit visibility selection is required to share an existing private assessment',async()=>{
  const record=a('private',{weight:70},{visibility:'private'});
  const h=harness({records:[record]});h.A.edit(record);
  assert.equal(h.nodes.get('body-visibility').value,'private');
  h.nodes.get('body-visibility').value='patient';await h.draft.submit();assert.equal(h.saved[0][3],'patient');
});
test('Stale form drafts have different storage keys after a record revision',()=>{
  const h=harness();h.A.edit(a('same',{}, {version:1}));const k=h.draft.key;
  h.A.edit(a('same',{}, {version:2}));assert.notEqual(h.draft.key,k);
});
test('Partial measurements stay partial and an invalid number fails before persistence',async()=>{
  const h=harness();h.A.edit();
  h.nodes.get('body-waist').value='82';h.nodes.get('body-fat').value='not-a-number';
  await assert.rejects(h.draft.submit,/Gordura corporal/);assert.equal(h.saved.length,0);
  h.nodes.get('body-fat').value='';await h.draft.submit();
  assert.equal(h.saved[0][2].weight,null);assert.equal(h.saved[0][2].height,null);assert.equal(h.saved[0][2].waist,82);
});
test('Editing an old private photo preserves its date, pixels and privacy',async()=>{
  const record=a('old-photo',{image:photo},{kind:'progress_photo',visibility:'private',version:3});
  const h=harness({records:[record]});h.A.editPhoto(record);
  assert.equal(h.nodes.get('photo-day').value,'2026-01-01');assert.match(h.draft.key,/:v3$/);
  await h.draft.submit();assert.equal(h.saved[0][3],'private');assert.equal(h.saved[0][2].day,'2026-01-01');assert.equal(h.saved[0][2].image,photo);
  assert.equal(h.saved[0][2].angle,'unspecified');
});
test('Patients can edit their own photos but cannot edit professional assessments or another author’s photo',()=>{
  const h=harness({role:'patient',user:'patient-a'});
  assert.throws(()=>h.A.edit(a('evaluation')),/profissional/);
  assert.throws(()=>h.A.editPhoto(a('photo',{image:photo},{kind:'progress_photo'})),/próprias fotos/);
  h.A.editPhoto(a('own',{image:photo},{kind:'progress_photo',created_by:'patient-a'}));
  assert.ok(h.draft);
});
test('Assessment HTML escapes notes and ignores injected measurement markup',()=>{
  const record=a('source',{day:'2026-03-01',weight:'<img src=x onerror=alert(1)>',height:170,source:'<script>bad()</script>',text:'<b>Not markup</b>'});
  const h=harness({records:[record],role:'patient',user:'patient-a'});
  const html=h.A.view();assert(!html.includes('<script>bad'));assert(!html.includes('<img src=x'));assert(html.includes('&lt;b&gt;Not markup&lt;/b&gt;'));
});
test('Changing patients clears the comparison and never carries an earlier patient into the report',()=>{
  const rows=[a('a1',{day:'2026-01-01',weight:70}),a('a2',{day:'2026-02-01',weight:68}),a('b1',{day:'2026-02-01',weight:90},{patient_id:'b'})];
  const h=harness({records:rows});h.A.view();h.state.selected='b';const html=h.A.view();
  assert(!html.includes('value="a1"'));assert(!html.includes('value="a2"'));assert(html.includes('value="b1"'));
  h.A.print(rows[2]);assert(!h.printed.includes('a1'));assert(h.printed.includes('Primeira avaliação'));
});
test('A partial assessment can be printed and fat changes are expressed in percentage points',()=>{
  const rows=[a('first',{day:'2026-01-01',fat:30}),a('second',{day:'2026-02-01',fat:28.5,waist:78})];
  const h=harness({records:rows});h.A.view();h.A.print(rows[1]);
  assert(h.printed.includes('-1,5 p.p.'));assert(h.printed.includes('Cintura'));assert(h.printed.includes('—'));
});
test('Photo comparator handles no/one/two photos and never combines angles or private records for patients',()=>{
  const rows=[a('front1',{day:'2026-01-01',angle:'front',image:photo},{kind:'progress_photo'}),a('front2',{day:'2026-02-01',angle:'front',image:photo},{kind:'progress_photo'}),a('back',{day:'2026-01-01',angle:'back',image:photo},{kind:'progress_photo'}),a('private',{day:'2026-01-01',angle:'front',image:photo},{kind:'progress_photo',visibility:'private'})];
  const h=harness({role:'patient',user:'patient-a',records:[]});assert(h.A.photoPanel().includes('Nenhuma foto'));
  h.state.records=rows.slice(0,1);assert(h.A.photoPanel().includes('Com duas fotos'));assert(!h.A.photoPanel().includes('id="body-photo-slider"'));
  const two=harness({role:'patient',user:'patient-a',records:rows});const html=two.A.photoPanel();assert(html.includes('id="body-photo-slider"'));
  const selectors=html.slice(html.indexOf('compare-controls'),html.indexOf('photo-stage'));assert(!selectors.includes('value="back"'));assert(!html.includes('value="private"'));
});
test('Journey thresholds remain compatible with existing XP',()=>{
  assert.deepEqual(journeyLevel(0),{level:1,next:100,percent:0});
  assert.deepEqual(journeyLevel(100),{level:2,next:300,percent:0});
  assert.equal(journeyLevel(300).level,3);
});

let failed=0;
for(const {name,fn} of tests){try{await fn();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}}
console.log((tests.length-failed)+'/'+tests.length+' assessment regressions passed.');
if(failed)process.exitCode=1;
