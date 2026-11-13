import { scenarios } from './demo-data.mjs';

// Educational projection, not the package's real extractor, splitter, embedder, or search adapters.
export const STEPS = Object.freeze([
  {id:'discover',number:'01',title:'Discover',caption:'Where are the documents?',why:'A website may have many pages; the ingestion source is not automatically one document.',module:'src/discovery/ · src/github/',output:'Candidate URLs and scope'},
  {id:'acquire',number:'02',title:'Acquire',caption:'What was fetched?',why:'HTTP and browser acquisition are separate paths. Redirects, origin rules, byte limits, and errors belong here.',module:'src/remote/ · src/rendering/',output:'Raw source + provenance'},
  {id:'normalize',number:'03',title:'Normalize',caption:'What content remains?',why:'Extract useful text, discard interface clutter, and keep Markdown with origin and title metadata.',module:'src/extraction/ · src/normalization/',output:'Markdown documents'},
  {id:'chunk',number:'04',title:'Chunk',caption:'What are the meaningful units?',why:'Split normalized Markdown into smaller passages while maintaining headings and source references.',module:'src/chunking/',output:'Passages + metadata'},
  {id:'index',number:'05',title:'Index & sync',caption:'What reaches the vector store?',why:'Host embeddings or provider-native vectorization generate the searchable representation. Revision and completeness govern incremental updates and safe deletion.',module:'src/vector/ · src/sync/ · src/knowledge/',output:'Planned writes and sync decisions'},
  {id:'retrieve',number:'06',title:'Retrieve',caption:'Which passage answers the query?',why:'Search returns relevant passages and their source provenance. Real vector relevance requires a configured embedding model and provider.',module:'src/knowledge/qdrant-search-adapter.ts · weaviate-search-adapter.ts',output:'Ranked passages + citations'}
]);

export function toMarkdown(page) {
  return ['# '+page.title,...page.body.flatMap(([heading,text])=>['','## '+heading,'',text])].join('\n');
}

export function toMarkup(page) {
  // Intentional, *authored* HTML fixture representing an acquisition stage, not a live fetch.
  const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  return ['<header>Example product navigation</header>','<main><article>','<h1>'+escape(page.title)+'</h1>',
    ...page.body.flatMap(([heading,text])=>['<h2>'+escape(heading)+'</h2>','<p>'+escape(text)+'</p>']),
    '</article></main>'].join('\n');
}

export function chunksForPage(page,sourceUrl,sourceId) {
  return page.body.map(([heading,text],index)=>({
    id:sourceId+'-'+page.path.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')+'-'+(index+1),
    heading,markdown:'## '+heading+'\n\n'+text,text,title:page.title,
    origin:sourceUrl.replace(/\/$/,'')+page.path,
    path:page.path,part:index+1,sourceId
  }));
}

const STOP=new Set(['a','an','and','are','as','be','by','can','do','for','from','how','i','in','is','it','my','of','on','or','the','to','we','what','where','with','you','your']);
export function tokens(value) {
  return [...new Set(String(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9]{2,}/g)?.filter(w=>!STOP.has(w))??[])];
}
export function searchFixture(chunks,query,limit=4) {
  const words=tokens(query);
  if(!words.length)return [];
  return chunks.map(chunk=>{
    const heading=new Set(tokens(chunk.heading));
    const content=new Set(tokens(chunk.text));
    const matches=words.filter(w=>heading.has(w)||content.has(w));
    return {...chunk, matches, lexicalScore:matches.reduce((s,w)=>s+(heading.has(w)?3:1),0)};
  }).filter(r=>r.lexicalScore>0).sort((a,b)=>b.lexicalScore-a.lexicalScore||a.id.localeCompare(b.id)).slice(0,limit);
}

// Fingerprint is a deterministic display identifier; it is NOT a SHA-256 hash or an embedding.
export function sketchFingerprint(text) {
  let state=2166136261;
  for(const ch of text){state=Math.imul(state^ch.charCodeAt(0),16777619)>>>0;}
  return state.toString(16).padStart(8,'0');
}

export function buildStudy(scenarioId='support',options={}) {
  const scenario=scenarios[scenarioId];
  if(!scenario)throw Error('Unknown educational fixture');
  const partial=Boolean(options.partial),query=options.query??scenario.defaultQuery;
  const discovered=scenario.pages.map(page=>({
    path:page.path,url:scenario.url.replace(/\/$/,'')+page.path,title:page.title
  }));
  const acquired=scenario.pages.filter((_,i)=>!partial||i<scenario.pages.length-1);
  const documents=acquired.map(page=>({
    ...page,url:scenario.url.replace(/\/$/,'')+page.path,
    markdown:toMarkdown(page),markup:toMarkup(page),
  }));
  const chunks=documents.flatMap(page=>chunksForPage(page,scenario.url,scenario.id));
  const records=chunks.map(chunk=>({...chunk,displayId:sketchFingerprint(chunk.id+':'+chunk.markdown)}));
  return {scenario,discovered,documents,chunks,records,query,partial,
    retrieval:searchFixture(chunks,query),
    outcome:{status:partial?'partial':'completed',
      snapshotComplete:!partial,discovered:discovered.length,materialized:documents.length,
      pending:discovered.length-documents.length,
      deletionAllowed:!partial,
      note:partial?'The last document is unavailable in this example. Incomplete snapshots must not authorize deleting unseen documents or vectors.':'A complete example snapshot is available. Deletes still require the actual sync planner and reconciliation checks.'}
  };
}
