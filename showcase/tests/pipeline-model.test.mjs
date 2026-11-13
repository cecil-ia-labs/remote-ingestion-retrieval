import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStudy,toMarkdown,chunksForPage,tokens,searchFixture,sketchFingerprint} from '../pipeline-model.mjs';

test('support fixture progresses from three discovered documents to nine chunks',()=>{
 const run=buildStudy('support');
 assert.equal(run.discovered.length,3);
 assert.equal(run.documents.length,3);
 assert.equal(run.chunks.length,9);
 assert.equal(run.outcome.status,'completed');
});
test('Markdown retains source headings and meaningful text',()=>{
 const run=buildStudy('support');
 assert.match(toMarkdown(run.scenario.pages[1]),/## Reset your password/);
 assert.equal(run.chunks[0].sourceId,'support');
 assert.match(run.chunks[0].origin,/help\.example\.com\/start/);
});
test('search is strictly lexical and respects provenance',()=>{
 const run=buildStudy('support',{query:'reset password'});
 assert.equal(run.retrieval[0].heading,'Reset your password');
 assert.equal(run.retrieval[0].origin,'https://help.example.com/account');
 assert.ok(run.retrieval[0].matches.includes('password'));
});
test('partial snapshot cannot authorize deletion of unseen source content',()=>{
 const run=buildStudy('repository',{partial:true});
 assert.equal(run.discovered.length,3);
 assert.equal(run.documents.length,2);
 assert.equal(run.outcome.snapshotComplete,false);
 assert.equal(run.outcome.deletionAllowed,false);
 assert.equal(run.outcome.status,'partial');
});
test('fixtures never claim SHA-256, trained embeddings or exact retrieval quality',()=>{
 assert.equal(sketchFingerprint('sample').length,8);
 assert.deepEqual(tokens('How can I reset my password?'),['reset','password']);
 assert.equal(searchFixture([], 'any query').length,0);
});
test('reject unknown fixture rather than inventing a source',()=>{
 assert.throws(()=>buildStudy('does-not-exist'),/Unknown educational fixture/);
});
