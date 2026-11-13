import {STEPS,buildStudy} from './pipeline-model.mjs';

const $=id=>document.getElementById(id);
const state={scenario:'support',partial:false,step:0,document:0,chunk:0,query:''};
let study;
const titles={
  discover:'Discovered candidate URLs',acquire:'Acquired source document',
  normalize:'Raw HTML → normalized Markdown',chunk:'Structured Markdown chunks',
  index:'Proposed vector records and sync rules',retrieve:'Passages matching the query'
};
const counts={discover:'CANDIDATES',acquire:'DOCUMENTS',normalize:'DOCUMENTS',chunk:'CHUNKS',index:'RECORDS',retrieve:'MATCHES'};
function make(tag,className,text){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=String(text);
  return el;
}
function append(parent,...nodes){parent.append(...nodes);return parent;}
function flag(text,pending=false){return make('span','result-flag'+(pending?' pending':''),text);}
function resultItem(title,detail,meta,status){
 const card=make('article','result-item'),top=make('div','result-top');
 append(top,make('strong','',title),flag(status||'SOURCE'));
 append(card,top,make('div','result-path',detail));
 if(meta)card.append(make('small','',meta));
 return card;
}
function note(text){return make('p','result-note',text);}
function labelValue(name,value){
 const row=make('div','fact-row');
 append(row,make('b','',name),make('span','',value));
 return row;
}
function renderDiscover(root){
 root.append(note('The source configuration defines the scope. A website crawler discovers candidates; the GitHub repository profile selects files from a pinned revision rather than browsing a global sitemap.'));
 const list=make('div','result-list');
 for(const item of study.discovered){
  const acquired=study.documents.some(d=>d.path===item.path);
  const label=acquired?'ELIGIBLE':'PENDING';
  list.append(resultItem(item.title,item.url,acquired?'Candidate retained in example scope':'Not acquired in this incomplete-snapshot simulation',label));
  if(!acquired)list.lastElementChild.querySelector('.result-flag').classList.add('pending');
 }
 root.append(list);
}
function documentAt(){return study.documents[Math.min(Math.max(0,state.document),study.documents.length-1)];}
function renderAcquire(root){
 const page=documentAt();if(!page)return;
 root.append(note('This is authored HTML representing the acquisition stage. The actual library applies URL policy, HTTP/browser selection, redirects, budgets and structured errors. No HTTP request occurs in this page.'));
 const list=make('div','result-list');
 const section=make('section','result-item');
 const top=make('div','result-top');
 append(top,make('strong','',page.title),flag('LOCAL FIXTURE'));
 append(section,top,make('div','result-path',page.url));
 list.append(section);root.append(list);
 const pre=make('pre','artifact-code',page.markup);
 pre.style.marginTop='18px';root.append(pre);
}
function renderNormalize(root){
 const page=documentAt();if(!page)return;
 root.append(note('Compare the fictional source markup with the prepared Markdown representation. The actual implementation uses Readability / extraction and normalization modules, not this authored conversion.'));
 const grid=make('div','comparison');
 const raw=make('article'),clean=make('article');
 append(raw,make('h4','','ACQUIRED HTML'),append(make('pre'),make('code','artifact-code',page.markup)));
 append(clean,make('h4','','NORMALIZED MARKDOWN'),append(make('pre'),make('code','artifact-code',page.markdown)));
 append(grid,raw,clean);root.append(grid);
}
function renderChunks(root){
 const page=documentAt();if(!page)return;
 const parts=study.chunks.filter(c=>c.path===page.path);
 if(state.chunk>=parts.length)state.chunk=0;
 root.append(note('The sample groups content by section heading. The production splitter has its own configurable structural/semantic policies, bounds and metadata. These are educational chunk boundaries, not a measured run.'));
 const picker=make('div','chunk-picker');
 parts.forEach((chunk,index)=>{
  const button=make('button','','CHUNK '+String(index+1).padStart(2,'0'));
  button.type='button';button.setAttribute('aria-pressed',String(state.chunk===index));
  button.addEventListener('click',()=>{state.chunk=index;renderOutput();});
  picker.append(button);
 });root.append(picker);
 const chunk=parts[state.chunk],article=make('article','chunk-body');
 append(article,make('h4','',chunk.heading),make('p','',chunk.text));
 root.append(article);
 const metadata=make('div');
 append(metadata,labelValue('Document',chunk.title),labelValue('Source',chunk.origin),labelValue('Section',chunk.heading),labelValue('Example ID',chunk.id));
 root.append(metadata);
}
function renderIndex(root){
 root.append(note('This stage illustrates intended records and safe synchronization decisions. No embeddings are generated and no vectors are sent to a provider. Display identifiers are educational fingerprints, not production chunk hashes.'));
 const list=make('div','result-list');
 for(const rec of study.records.slice(0,12)){
  const row=make('article','result-item');
  const top=make('div','result-top');
  append(top,make('strong','',rec.heading),flag('WOULD INDEX'));
  append(row,top,make('div','result-path',rec.origin),make('small','',`Demo fingerprint: ${rec.displayId} · source: ${rec.sourceId} · section: ${rec.part}`));
  list.append(row);
 }root.append(list);
 const info=make('p','index-hint',study.outcome.snapshotComplete?
  'COMPLETE EXAMPLE: the source snapshot is complete. Actual deletion still requires reconciliation, successful downstream writes, and compatible pipeline revisions.':
  'PARTIAL SNAPSHOT: one source was not acquired. Unseen documents and their vectors must not be deleted solely because this run did not discover/materialize them.');
 root.append(info);
}
function renderRetrieve(root){
 const matches=study.retrieval;
 root.append(note('For visibility, this local demo ranks passages by query-term overlap, with a heading bonus. These values are not embedding vectors, model similarities, cosine scores, or results from a live provider.'));
 if(!matches.length){
  root.append(resultItem('No literal matches','Try reset password, invoice, API key, or retry depending on the selected example.','','NO MATCH'));
  return;
 }
 const list=make('div','result-list');
 for(const [i,match] of matches.entries()){
  const card=make('article','result-item'),top=make('div','result-top');
  append(top,make('strong','',String(i+1).padStart(2,'0')+' · '+match.heading),
    make('span','retrieval-score',match.lexicalScore+' overlap pts'));
  append(card,top,make('small','',match.text),make('div','result-path',match.origin));
  const tags=make('div','match-list');for(const word of match.matches)tags.append(make('span','',word));card.append(tags);
  list.append(card);
 }root.append(list);
}
const stageRender={discover:renderDiscover,acquire:renderAcquire,normalize:renderNormalize,chunk:renderChunks,index:renderIndex,retrieve:renderRetrieve};
function renderOutput(){
 const current=STEPS[state.step],root=$('stage-output');
 root.replaceChildren();
 stageRender[current.id](root);
 $('output-count').textContent=String(({discover:study.discovered,acquire:study.documents,normalize:study.documents,chunk:study.chunks,index:study.records,retrieve:study.retrieval})[current.id].length).padStart(2,'0')+' '+counts[current.id];
 const status=$('inspector-footer')??document.querySelector('.inspector-footer');
 status.classList.toggle('partial',study.partial);
 $('status-label').textContent=study.partial?'PARTIAL SNAPSHOT · DELETION UNSAFE':'COMPLETE EXAMPLE SNAPSHOT';
 $('status-description').textContent=study.partial?'One source is intentionally unavailable; preserve previously known records.':'All three fictional pages were materialized; no real indexing took place.';
}
function renderNav(){
 const nav=$('stage-nav');nav.replaceChildren();
 for(const [i,stage] of STEPS.entries()){
  const btn=make('button');btn.type='button';btn.setAttribute('aria-current',i===state.step?'step':'false');
  append(btn,make('span','step-id',stage.number),make('span','step-name',stage.title),make('span','step-sub',stage.output));
  btn.addEventListener('click',()=>{state.step=i;render();});
  nav.append(btn);
 }
}
function renderDocumentPicker(){
 const chooser=$('document-select');chooser.replaceChildren();
 for(const [i,page] of study.documents.entries()){
  const option=make('option','',page.path+' · '+page.title);option.value=String(i);chooser.append(option);
 }
 state.document=Math.min(state.document,study.documents.length-1);
 chooser.value=String(state.document);
 $('document-toolbar').hidden=!['acquire','normalize','chunk'].includes(STEPS[state.step].id);
}
function render(){
 study=buildStudy(state.scenario,{partial:state.partial,query:state.query});
 const step=STEPS[state.step];
 $('scenario-source').textContent=study.scenario.url;
 $('scenario-namespace').textContent=study.scenario.namespace;
 $('stage-number').textContent='STEP '+step.number+' / 06';
 $('stage-title').textContent=step.title;
 $('stage-caption').textContent=step.caption;
 $('stage-why').textContent=step.why;
 $('stage-modules').textContent=step.module;
 $('stage-result-kind').textContent=step.output;
 $('output-heading').textContent=titles[step.id];
 $('previous-stage').disabled=state.step===0;
 $('next-stage').disabled=state.step===STEPS.length-1;
 $('next-stage').textContent=state.step===STEPS.length-1?'You reached the search step':'Next step →';
 $('search-region').hidden=step.id!=='retrieve';
 $('search-query').value=state.query;
 for(const btn of document.querySelectorAll('[data-scenario]'))btn.setAttribute('aria-pressed',String(btn.dataset.scenario===state.scenario));
 renderNav();renderDocumentPicker();renderOutput();
}
function changeScenario(id){
 state.scenario=id;state.document=0;state.chunk=0;state.query=buildStudy(id).scenario.defaultQuery;
 render();
}
for(const button of document.querySelectorAll('[data-scenario]'))button.addEventListener('click',()=>changeScenario(button.dataset.scenario));
$('partial-snapshot').addEventListener('change',event=>{state.partial=event.target.checked;state.document=0;state.chunk=0;render();});
$('document-select').addEventListener('change',event=>{state.document=Number(event.target.value);state.chunk=0;renderOutput();});
$('previous-stage').addEventListener('click',()=>{if(state.step>0){state.step--;render();}});
$('next-stage').addEventListener('click',()=>{if(state.step<STEPS.length-1){state.step++;render();}});
const search=()=>{state.query=$('search-query').value;study=buildStudy(state.scenario,{partial:state.partial,query:state.query});renderOutput();};
$('search-run').addEventListener('click',search);
$('search-query').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search();}});
$('copy-code').addEventListener('click',async()=>{
 const content=$('integration-code').textContent;
 try{
  await navigator.clipboard.writeText(content);
  $('copy-code').textContent='Copied';
  setTimeout(()=>$('copy-code').textContent='Copy',1400);
 }catch{
  $('copy-code').textContent='Select & copy';
  const selection=window.getSelection(),range=document.createRange();
  range.selectNodeContents($('integration-code'));selection.removeAllRanges();selection.addRange(range);
 }
});
changeScenario('support');
