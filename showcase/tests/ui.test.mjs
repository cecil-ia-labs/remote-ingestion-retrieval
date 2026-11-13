import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const get=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=get('../index.html'),css=get('../studio.css'),app=get('../studio.mjs');
const model=get('../pipeline-model.mjs'),data=get('../demo-data.mjs');
const workflow=get('../../.github/workflows/publish-showcase.yml');

test('all interactive inspector controls have matching elements',()=>{
 const ids=new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map(x=>x[1]));
 for(const id of ids)assert.ok(html.includes('id="'+id+'"')||id==='inspector-footer','Missing #'+id);
 for(const id of ['stage-nav','stage-output','partial-snapshot','document-select','search-query','copy-code'])
   assert.ok(html.includes('id="'+id+'"'),'Missing '+id);
});

test('the narrative distinguishes fictitious fixtures from real services',()=>{
 assert.match(html,/SYNTHETIC DATA · LOCAL ONLY/);
 assert.match(html,/no real embeddings/);
 assert.match(html,/no live crawling/i);
 assert.match(app,/not embedding vectors, model similarities, cosine scores/);
 assert.match(model,/NOT a SHA-256 hash or an embedding/);
});

test('the demo does not send user data to a backend',()=>{
 for(const source of [app,model,data]){
   assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|sendBeacon\s*\(|WebSocket\s*\(/);
 }
});

test('stage rendering is complete and the partial snapshot is user-selectable',()=>{
 for(const step of ['Discover','Acquire','Normalize','Chunks','Index','Retrieve']){
  const functionName=step==='Chunks'?'renderChunks':step==='Index'?'renderIndex':'render'+step;
  assert.ok(app.includes('function '+functionName+'('),functionName);
 }
 assert.match(app,/partial-snapshot/);
 assert.match(app,/deletion unsafe|deletion unsafe/i);
});

test('mobile view and keyboard interactions have dedicated support',()=>{
 assert.match(css,/@media\(max-width:510px\)/);
 assert.match(css, /:focus-visible/);
 assert.match(html,/aria-live="polite"/);
 assert.match(app,/event\.key==='Enter'/);
});

test('Pages deploy is manual-only with full pinned official action SHAs',()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/^\s*(push|pull_request):/m);
 const uses=[...workflow.matchAll(/uses:\s*([^\s]+)@([^\s]+)/g)];
 assert.ok(uses.length>=4);
 for(const [,action,ref] of uses){
  assert.match(action,/^actions\//);
  assert.match(ref,/^[a-f0-9]{40}$/);
 }
 assert.match(workflow,/node --test showcase\/tests\/\*\.test\.mjs/);
});
