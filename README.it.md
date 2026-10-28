# Remote Ingestion Retrieval

[Português](README.pt.md) | [English](README.en.md) | Italiano

Libreria TypeScript per trasformare URL e siti web in Markdown, suddividere il contenuto e inserirlo in una base di conoscenza. Include acquisizione HTTP e tramite browser, individuazione delle pagine, metadati, limiti di esecuzione e sincronizzazione incrementale dei vettori.

Il pacchetto offre due modalità di archiviazione:

- **Vettori precalcolati:** `RemoteSourceIngestion` riceve un `EmbeddingProvider` e un `VectorStore`. Gli adapter `WeaviateVectorStore` e `QdrantVectorStore` scrivono ed eliminano vettori, anche su installazioni gestite autonomamente.
- **File Markdown:** `KnowledgeBaseVectorStoreAdapter` riceve file e metadati. Gli adapter Weaviate/Qdrant dividono il testo e usano la vettorizzazione nativa del cluster; Qdrant accetta anche embedding forniti dall'applicazione host.

Questi contratti hanno responsabilità diverse. Un'API che riceve file non deve necessariamente implementare il contratto per vettori precalcolati.

## Configurazione comune dei provider

`AUTO_VECTOR_STORE_BASE_URL` è l'URL principale dell'archiviazione selezionata. La configurazione condivisa viene risolta da `resolveVectorStoreProviderConfiguration()` e utilizzata da `createKnowledgeBaseVectorStoreAdapter()` e `createPrecomputedVectorStore()`.

| Variabile | Funzione |
| --- | --- |
| `AUTO_VECTOR_STORE_PROVIDER` | `weaviate`, `qdrant`, `openai-compatible` oppure `custom`. |
| `AUTO_VECTOR_STORE_BASE_URL` | Endpoint HTTP(S) dell'API di archiviazione. |
| `AUTO_VECTOR_STORE_API_KEY` | Chiave del provider selezionato. |
| `AUTO_VECTOR_STORE_COLLECTION` | Collection Weaviate/Qdrant. |
| `AUTO_VECTOR_STORE_TIMEOUT_MS` | Timeout per richiesta; predefinito 30000. |
| `AUTO_VECTOR_STORE_BATCH_SIZE` | Dimensione del batch; predefinita 100, intervallo comune 1–200. |
| `AUTO_VECTOR_STORE_MAX_CHUNKS` | Limite prima delle chiamate di embedding; predefinito 10000. |
| `AUTO_VECTOR_STORE_MAX_CHUNK_CHARACTERS` | Suddivisione locale; predefinito 6400 caratteri. |
| `AUTO_VECTOR_STORE_VERIFICATION_ATTEMPTS` | Tentativi di verifica; predefinito 3. |
| `AUTO_VECTOR_STORE_VERIFICATION_DELAY_MS` | Intervallo tra tentativi; predefinito 250, ammette zero. |
| `AUTO_EMBEDDING_MODE` | `native` oppure `provided`; senza valore esplicito, un modulo di embedding seleziona `provided`. |
| `AUTO_EMBEDDING_MODEL` / `AUTO_EMBEDDING_DIMENSIONS` | Modello e dimensioni degli embedding. |
| `AUTO_EMBEDDING_BASE_URL` / `AUTO_EMBEDDING_API_KEY` | Configurazione di un servizio esterno, passata al modulo host. |
| `AUTO_EMBEDDING_PROVIDER_MODULE` | Modulo che esporta `embeddingProvider` o `createEmbeddingProvider(configuration)`. |

I valori generici **non vuoti** hanno precedenza sugli alias precedenti, ancora riconosciuti per compatibilità ma omessi dalla configurazione di riferimento. Le chiavi specifiche di un altro provider non vengono riutilizzate. `QDRANT_DISTANCE` resta specifico di Qdrant perché seleziona la metrica della collection.

Quando si migra un vecchio `.env`, rimuovere i valori generici che puntano a un altro servizio: ora hanno precedenza anche per Weaviate. La libreria non modifica `.env` né migra automaticamente le credenziali.

L'endpoint degli embedding è distinto dall'archiviazione: `AUTO_EMBEDDING_BASE_URL` non sostituisce `AUTO_VECTOR_STORE_BASE_URL`. Gli embedding nativi usano la chiave del cluster. Weaviate consente anche di configurare l'URL del vectorizer nativo; Qdrant nativo usa il Cloud Inference del cluster e rifiuta un endpoint esterno in questa modalità.

```ts
import {
  resolveVectorStoreProviderConfiguration,
  createKnowledgeBaseVectorStoreAdapter,
} from "remote-ingestion-retrieval";

const configuration = resolveVectorStoreProviderConfiguration(process.env);
const adapter = await createKnowledgeBaseVectorStoreAdapter(configuration);
const result = await adapter.ingest({ name: "Support", namespace: "support", files });
```

I moduli personalizzati ricevono la configurazione in `createVectorStoreAdapter(configuration)`; i moduli precedenti senza argomenti rimangono compatibili. Senza provider esplicito, un modulo selezionato usa `custom`; senza modulo, il fallback è `openai-compatible`.

## Installazione

È richiesto Node.js 22 o successivo.

```bash
npm ci
npm run build
```

Per pagine che dipendono da JavaScript, installare la versione di Chrome corrispondente a Puppeteer:

```bash
npx puppeteer browsers install chrome
```

Per usare questa directory come dipendenza in un altro progetto locale:

```bash
npm install /percorso/remote-ingestion-retrieval
```

Il nome del pacchetto è `remote-ingestion-retrieval` e l'entry point compilato è `dist/index.js`. Importare la libreria non avvia un crawl, non apre il browser e non chiama provider. Per eseguire un'ingestione usare gli esempi seguenti o il runner; non eseguire `node src/index.ts`.

## Ingestione con Weaviate Cloud

Copiare `.env.example` in `.env` e configurare una fonte e una collection:

```dotenv
SOURCE_ID=product-docs
SOURCE_TITLE=Product documentation
SOURCE_URL=https://docs.example.com/
AUTO_KB_NAMESPACE=product_docs
AUTO_VECTOR_STORE_PROVIDER=weaviate
AUTO_VECTOR_STORE_BASE_URL=https://your-cluster.weaviate.cloud
AUTO_VECTOR_STORE_API_KEY=your-cluster-api-key
AUTO_VECTOR_STORE_COLLECTION=ProductDocs
AUTO_EMBEDDING_MODEL=Snowflake/snowflake-arctic-embed-l-v2.0
```

```bash
npm run ingest
```

Il runner individua le pagine, materializza il Markdown, arricchisce i metadati, applica lo splitter e carica automaticamente il risultato. I moduli Weaviate sono inclusi nel repository.

La collection viene creata se assente. Una collection esistente deve avere vectorizer, modello, configurazione di embedding e proprietà compatibili; l'adapter rifiuta incompatibilità senza modificarne lo schema. Usare una collection dedicata con un vettore senza nome. Il nome deve iniziare con una maiuscola e contenere solo lettere, numeri e `_`.

`text2vec-weaviate` genera gli embedding durante l'importazione degli oggetti ed è disponibile su Weaviate Cloud. L'integrazione non chiama separatamente `/embeddings`. Consultare la [documentazione degli embedding Weaviate](https://docs.weaviate.io/weaviate/model-providers/weaviate/embeddings) per disponibilità, modelli e dimensioni.

I documenti originali vengono salvati in `kb/<SOURCE_ID>/`; i file dopo la suddivisione e il relativo `manifest.json` in `kb/<SOURCE_ID>/split/<id>/`. I report sono in `data/ingestion-results/<SOURCE_ID>/`. Il risultato Weaviate identifica collection e oggetti `{filename, id, chunkId}`, non upload tramite l'API Files di OpenAI.

L'importazione di file esegue upsert di snapshot e non elimina i vecchi chunk di file modificati. Usare una nuova collection per snapshot isolati oppure il percorso incrementale con vettori precalcolati per riconciliare le eliminazioni. Un batch può fallire dopo la persistenza di altri oggetti; il successo viene restituito solo dopo le verifiche. Gli ID sono deterministici per collection, namespace e identità del chunk.

### Limiti e metadati del runner

| Variabile | Valore predefinito / funzione |
| --- | --- |
| `AUTO_MAX_PAGES` | 100 pagine individuate. |
| `AUTO_MAX_DEPTH` | Profondità 4. |
| `AUTO_CRAWL_CONCURRENCY` | 4 operazioni di individuazione. |
| `AUTO_MATERIALIZATION_CONCURRENCY` | 4 materializzazioni. |
| `AUTO_MAX_KB_FILES` | 100 documenti originali, prima dello splitter. |
| `AUTO_MAX_SPLIT_FILES` | 10000 file dopo lo splitter. |
| `AUTO_MAX_KB_BYTES` | 50 MiB di Markdown; verificati anche dopo lo splitter. |
| `AUTO_SPLITTER_MAX_CHARS` | 6400 caratteri per segmento strutturale. |
| `AUTO_SPLITTER_MAX_INPUT_CHARACTERS` | 3.000.000 caratteri prima della suddivisione della raccolta. |
| `AUTO_METADATA_MODE` | `local`; `model` usa un enricher. |
| `AUTO_MARKDOWN_SPLITTER_MODULE` | Modulo con `markdownSplitter` o `createMarkdownSplitter()`. |
| `AUTO_VECTOR_STORE_ADAPTER_MODULE` | Modulo con `vectorStoreAdapter` o `createVectorStoreAdapter()`. |
| `AUTO_METADATA_ENRICHER_MODULE` | Modulo con `metadataEnricher` o `createMetadataEnricher()`. |

Altri limiti: `AUTO_MAX_ELAPSED_MS`, `AUTO_PAGE_TIMEOUT_MS`, `AUTO_MAX_BYTES_PER_DOCUMENT` e `AUTO_MAX_FAILURES`. Consultare report e stato per distinguere un risultato parziale da una base completa.

La modalità locale ricava `domain`, `tags` e `keywords` da contenuto e gerarchia delle pagine. La modalità modello usa cache per provider, dominio, URL e hash. È controllata da `AUTO_METADATA_MAX_REQUESTS` (100), `AUTO_METADATA_MAX_INPUT_CHARS` (3.000.000), `AUTO_METADATA_MAX_CHARS`, `AUTO_METADATA_MODEL` e `AUTO_METADATA_CONCURRENCY`. I limiti di richieste e caratteri non costituiscono un tetto monetario.

Weaviate e Qdrant integrati hanno precedenza sul modulo custom. `openai-compatible` usa l'adapter OpenAI incluso quando non è indicato un modulo. Solo l'enricher modello precedente mantiene un fallback nel progetto fratello `../3_benchmarks/realtime-compare-mcp-x-function/MarkdownSplitter/`; configurare `AUTO_METADATA_ENRICHER_MODULE` negli altri checkout. Con metadati locali e splitter strutturale quel modulo non serve.

Le opzioni di verifica e suddivisione comuni sono elencate sopra e in `.env.example`. Il limite di caratteri non garantisce token o overlap esatti. Gli adapter Weaviate/Qdrant rifiutano `request.chunking` in token; il runner omette il campo quando l'adapter segnala `supportsTokenChunking = false`.

## MarkdownSplitter

### Suddivisione locale

`StructuralMarkdownSplitter` è il valore predefinito della facciata e del runner. Conserva testo e offset UTF-16, preferisce confini tra paragrafi e non chiama modelli. Un limite può dividere un blocco lungo di codice o una tabella: iniettare uno splitter diverso quando tali blocchi devono rimanere integri.

```ts
import { StructuralMarkdownSplitter } from "remote-ingestion-retrieval";

const splitter = new StructuralMarkdownSplitter({ maxCharacters: 6400 });
const segments = await splitter.split(markdown, {
  sourceId: "docs",
  documentId: "installation",
  canonicalUrl: "https://docs.example.com/install",
  documentContentHash: "document-hash",
});
```

Per riutilizzare uno splitter dell'applicazione, usare `ExistingMarkdownSplitterAdapter` con `split`, `toMarkdown` e, se disponibili, `toMetadata`.

### Suddivisione semantica compatibile con inx-nlp

`SemanticMarkdownSplitter` incorpora il contratto `files + metadata` e le regole del progetto MarkdownSplitter e della task `markdown-splitter` di inx-nlp. L'esecutore del modello/task è iniettato dall'host; non è obbligatorio un SDK o modello specifico.

Lo splitter fornisce istruzioni, JSON Schema e contesto della fonte. Richiede nomi sequenziali `NN_semantic_domain.md`, Markdown senza front matter o fence esterni, metadati completi e corrispondenza esatta tra file e manifest. L'output viene validato prima della conversione in chunk o file.

```ts
import {
  SemanticMarkdownSplitter,
  type SemanticMarkdownExecutionRequest,
} from "remote-ingestion-retrieval";

// runStructuredTask deve essere implementato/importato dall'applicazione host.
export function createMarkdownSplitter() {
  return new SemanticMarkdownSplitter({
    execute: (request: SemanticMarkdownExecutionRequest) => runStructuredTask(request),
    namespace: "product_docs",
    normalizedFrom: "markdown",
    normalizedOn: "2026-10-27",
    maxInputCharacters: 200_000,
    maxOutputCharacters: 400_000,
    maxFiles: 100,
  });
}
```

L'esecutore deve rispettare `request.signal` e restituire `files + metadata`, come oggetto o JSON. Non è un export della libreria. Per il runner impostare `AUTO_MARKDOWN_SPLITTER_MODULE=./percorso/splitter.ts`; `tsx` carica i moduli TypeScript.

`split(markdown, context)` restituisce segmenti per `WebDocumentChunker`; `files(markdown, context)` restituisce `KnowledgeBaseFile[]`; `normalize(markdown, context)` restituisce il contratto originale:

```ts
const knowledgeBase = await splitter.normalize(markdown, context);
// { files: [{ filename, markdown }], metadata: [{ filename, attributes }] }
```

Gli attributi compatibili sono `organization`, `language`, `document_type`, `domain`, `audience`, `kb_namespace`, `source_file`, `source_pages`, `temporal_sensitivity`, `review_required`, `source_effective_date`, `normalized_from`, `normalized_on` e `tags`. Origine, namespace e data forniti all'esecutore devono essere conservati. Le fonti web possono usare `markdown` e `html` per `normalized_from`, oltre ai valori PDF originali.

Le istruzioni preservano lingua, numeri, condizioni, eccezioni e ambiguità. La validazione strutturale non dimostra la fedeltà fattuale di un modello: `review_required` rimane rilevante. Lo splitter non inventa offset: il chunker marca una posizione come risolta solo con corrispondenza nel testo oppure offset espliciti.

I metadati semantici restano in `chunk.metadata.splitter.attributes` e vengono proiettati nei metadati vettoriali. Identificatori e hash del pipeline prevalgono sugli attributi dello splitter.

## Pipeline incrementale con vettori precalcolati

Usare questo percorso quando l'host fornisce embedding o serve la riconciliazione incrementale, comprese le eliminazioni dei vecchi chunk. Weaviate usa `vectorizer: none`.

```ts
import {
  RemoteSourceIngestion,
  StructuralMarkdownSplitter,
  WeaviateVectorStore,
} from "remote-ingestion-retrieval";

// embeddingProvider appartiene all'applicazione e implementa EmbeddingProvider.
const vectorStore = new WeaviateVectorStore({
  url: process.env.AUTO_VECTOR_STORE_BASE_URL!,
  apiKey: process.env.AUTO_VECTOR_STORE_API_KEY,
  collection: "ProductDocsVectors",
});
await vectorStore.ensureCollection();

const ingestion = new RemoteSourceIngestion({
  pipelineRevision: "structural-v1:embedding-model-and-dimensions-v1:metadata-v1",
  markdownSplitter: new StructuralMarkdownSplitter({ maxCharacters: 6400 }),
  embeddingProvider,
  vectorStore,
  stateRootDirectory: "./data/sync",
});

try {
  const now = new Date();
  const outcome = await ingestion.runSourceInsertion({
    source: {
      id: "product-docs",
      type: "website",
      url: "https://docs.example.com/",
      createdAt: now,
      updatedAt: now,
      options: {
        crawl: {
          discoveryStrategy: "sitemap-and-crawl",
          sameOriginOnly: true,
          maxPages: 100,
          maxDepth: 3,
          concurrency: 3,
        },
      },
    },
    namespace: "product_docs",
    failurePolicy: "continue-partial",
    materializationConcurrency: 3,
    limits: {
      maxElapsedMs: 300_000,
      maxFetchedBytes: 100 * 1024 * 1024,
      maxChunks: 10_000,
      maxEmbeddingInputs: 5_000,
    },
  });
  if (outcome.ok) console.log(outcome.status, outcome.summary);
  else console.error(outcome.status, outcome.error);
} finally {
  await ingestion.close();
}
```

Per un URL singolo usare `source.type: "url"`, mantenendo gli altri campi di base. Cambiare `pipelineRevision` quando cambiano splitter, modello, dimensioni, preprocessamento o proiezione dei metadati. Conservare la directory di stato per riconoscere contenuti invariati nell'esecuzione successiva.

`insertSource(request)` propaga eccezioni. `runSourceInsertion(request)` restituisce `completed`, `partial`, `failed` o `aborted`, con `runId`, riepilogo ed errore strutturato quando applicabile. Uno snapshot incompleto non autorizza l'eliminazione di documenti non osservati.

Il namespace partecipa agli ID ed è salvato come proprietà per i filtri. La separazione è logica; l'host deve configurare le autorizzazioni del cluster.

## Uso diretto dell'adapter di file

```ts
import { WeaviateKnowledgeBaseAdapter } from "remote-ingestion-retrieval";

const adapter = new WeaviateKnowledgeBaseAdapter({
  url: process.env.AUTO_VECTOR_STORE_BASE_URL!,
  apiKey: process.env.AUTO_VECTOR_STORE_API_KEY,
  collection: "SupportKnowledge",
  model: "Snowflake/snowflake-arctic-embed-l-v2.0",
  maxChunkCharacters: 6400,
});

const result = await adapter.ingest({
  name: "Support knowledge",
  namespace: "support",
  files: [{
    filename: "01_billing.md",
    markdown: "# Billing\n\nPayment instructions from the source.",
    metadata: { domain: "billing", tags: "billing,payments", source_url: "https://example.com/billing" },
  }],
});
console.log(result.storeId, result.objects);
```

`domain` usa tokenizzazione `field`, adatta all'uguaglianza esatta. `tags` e `keywords` accettano array o stringhe separate da virgole, salvate come array. La provenienza completa è conservata in `metadataJson`.

L'inx-voice-assistant-inxide consultato usa `/vector_stores/{id}/search` di OpenAI e filtri esatti per dominio. Una collection Weaviate non sostituisce direttamente quell'ID. `WeaviateSearchAdapter` conserva filtri e provenienza, ma l'host deve selezionarlo nel proprio percorso di ricerca; la libreria non modifica i servizi inx.

## Upload di file esistenti

Configurare endpoint, collection e credenziali in `.env` e caricare Markdown/testo senza ripetere il crawl:

```bash
npm run upload:vector-store -- --namespace support --domain billing ./kb/01_billing.md
npm run upload:vector-store -- --namespace support --manifest ./kb/source/split/run/manifest.json
```

Il comando precedente `upload:weaviate` rimane disponibile e seleziona Weaviate esplicitamente. Il manifest contiene `files: [{ filename, metadata }]` e i file si trovano accanto ad esso. Sono accettati `.md`, `.markdown` e `.txt` UTF-8.

I limiti predefiniti dei documenti sono 100 file, 5 MiB per file nell'upload isolato e 50 MiB complessivi; usare `AUTO_MAX_KB_FILES`, `AUTO_MAX_BYTES_PER_DOCUMENT` e `AUTO_MAX_KB_BYTES`. Un valore esplicito di bytes per documento vale per entrambi i comandi; il default di `ingest` è 10 MiB. I manifest già suddivisi usano `AUTO_MAX_SPLIT_FILES`. Gli adapter limitano inoltre i chunk con `AUTO_VECTOR_STORE_MAX_CHUNKS` o `maxChunks`.

`--report` seleziona il report, altrimenti salvato in `data/vector-store-uploads/<provider>/`; il comando precedente Weaviate conserva `data/weaviate-uploads/`. Nell'API usare `adapter.ingestFiles({ name, namespace, files: [{ path, filename?, metadata? }], signal? })` oppure `loadKnowledgeBaseFiles()`. I formati binari, incluso PDF, devono passare prima dalla conversione.

Dopo i batch, gli adapter verificano gli oggetti/punti persistiti, testo, provenienza e vettori finiti, non vuoti e di dimensione corretta. Il risultato contiene ID reali dei chunk per file, hash, bytes e `verification`. `AUTO_VECTOR_STORE_VERIFICATION_ATTEMPTS` e `AUTO_VECTOR_STORE_VERIFICATION_DELAY_MS` controllano le verifiche.

Il report di ingestione conserva `files` per i documenti originali e `splitFiles`, `objects` e `splitManifestPath` per gli output effettivi. I nomi cambiati dallo splitter non vengono scambiati per un upload incompleto.

## Ricerca Weaviate per consumatori inx

`WeaviateSearchAdapter` usa SDK ufficiale/gRPC e restituisce `{ data, has_more: false }`, con `file_id`, `filename`, `score`, `distance`, `attributes` e `content: [{ type: "text", text }]`.

```ts
import weaviate from "weaviate-client";
import { connectWeaviateSearch } from "remote-ingestion-retrieval";

const search = await connectWeaviateSearch({
  collection: "SupportKnowledge",
  connection: {
    mode: "cloud",
    url: process.env.AUTO_VECTOR_STORE_BASE_URL!,
    options: { authCredentials: new weaviate.ApiKey(process.env.AUTO_VECTOR_STORE_API_KEY!) },
  },
});
try {
  const results = await search.search({ query: "Come pagare la fattura?", namespace: "support", domain: "billing", limit: 5 });
  console.log(results.data);
} finally {
  await search.close();
}
```

Il namespace è obbligatorio, il dominio è un filtro opzionale di uguaglianza. La ricerca usa `nearText` per embedding nativi o `nearVector` con lo stesso `EmbeddingProvider` usato nell'ingestione. Sono disponibili connessioni proprie con `connection: { mode: "custom", options }` e client iniettati.

`score` è la distanza vettoriale negativa: maggiore significa migliore, senza rappresentare una probabilità o la scala OpenAI. Adeguare eventuali soglie del consumatore. Il percorso SDK/gRPC evita la dipendenza da [GraphQL dismesso o REST Search in preview](https://docs.weaviate.io/weaviate/api/graphql/migration).

## Acquisizione di repository GitHub

Il runner riconosce URL di repository, `/tree/` e `/blob/` e seleziona automaticamente l'acquisizione dei file. `SOURCE_PROFILE=github-repository` la seleziona esplicitamente; `SOURCE_PROFILE=website` forza il crawler convenzionale.

```dotenv
SOURCE_URL=https://github.com/qdrant/qdrant
SOURCE_ID=githubqdrant
SOURCE_PROFILE=github-repository
GITHUB_TOKEN=
GITHUB_INCLUDE_CODE=false
GITHUB_MAX_FILES=100
GITHUB_MAX_API_REQUESTS=200
```

Eseguire `npm run ingest` con il provider configurato. Il profilo non consulta sitemap o pagine sociali. Risolve la referenza in un commit, enumera la sua struttura Git e scarica blob grezzi per SHA, verificando hash Git e dimensione. L'ordine favorisce README principale, documentazione, riferimenti API ed esempi. Non esegue codice e non segue link esterni o dell'interfaccia GitHub.

Nella libreria, il profilo va selezionato esplicitamente:

```ts
const source = {
  id: "qdrant-docs", type: "website" as const,
  url: "https://github.com/qdrant/qdrant",
  createdAt: new Date(), updatedAt: new Date(),
  options: {
    profile: "github-repository" as const,
    github: { ref: "master", path: "docs", includeCode: false, maxFiles: 100 },
    crawl: { maxPages: 100, concurrency: 3 },
  },
};
// Passare githubToken nelle opzioni di RemoteSourceIngestion, non nei metadati.
```

Scegliere referenze e percorsi esistenti. Il runner usa `GITHUB_REF` e `GITHUB_PATH`; senza referenza usa il branch predefinito. Le referenze con slash negli URL tree/blob vengono risolte dall'API senza assumere che il primo segmento sia il branch.

`GITHUB_INCLUDE`/`GITHUB_EXCLUDE` sono liste di glob relativi al repository separate da virgole, ad esempio `docs/**,README.md`. Il codice richiede `GITHUB_INCLUDE_CODE=true`. Binari, lockfile, generati, dipendenze, submodule e symlink sono esclusi. Puntatori Git LFS o contenuti binari inattesi causano un errore di materializzazione, senza indicizzare il puntatore.

Limiti: `GITHUB_MAX_FILES` 100, `GITHUB_MAX_FILE_BYTES` 5 MiB, `GITHUB_MAX_API_REQUESTS` 200, `GITHUB_MAX_API_RESPONSE_BYTES` 16 MiB e `GITHUB_MAX_TREE_ENTRIES` 100.000. Il limite pagine della fonte limita anche i file. Un token Contents in lettura è necessario per repository privati; viene inviato solo ad `api.github.com`, senza redirect, e non entra nei metadati. Senza token valgono i limiti pubblici GitHub.

Alberi ricorsivi troncati attivano l'enumerazione delle sottostrutture. Un troncamento residuo o un budget esaurito produce uno snapshot parziale. Il report registra commit, scope, file eleggibili/selezionati/in attesa, chiamate e campioni dei percorsi ignorati con i motivi. La provenienza include `{ owner, repo, ref, commitSha, path, blobSha }`; identità per referenza/percorso stabile tra commit, acquisizione per blob immutabile. Si applicano protezioni DNS, bytes, tempo e cancellazione.

Uno snapshot parziale non autorizza l'eliminazione dei documenti non osservati. Anche il limite di pagine del crawler convenzionale viene trattato in modo conservativo.

## Qdrant

`npm run ingest` esegue automaticamente l'upload dopo individuazione, materializzazione, metadati e suddivisione, sia per Weaviate sia per Qdrant. Dopo un'ingestione completata non serve un secondo comando di upload. Controllare report e stato quando limiti o errori impediscono il caricamento.

Sono disponibili `QdrantVectorStore`, `QdrantKnowledgeBaseAdapter` e `QdrantSearchAdapter`, con REST, autenticazione `api-key`, timeout/cancellazione, UUID deterministici per namespace e scritture `wait=true`.

Per Cloud Inference abilitarlo nel cluster e copiare **modello e dimensioni esatti** dalla scheda Inference. L'adapter non presume questi valori. Vedere la [documentazione ufficiale](https://qdrant.tech/documentation/inference/cloud-inference/).

```dotenv
AUTO_VECTOR_STORE_PROVIDER=qdrant
AUTO_VECTOR_STORE_BASE_URL=https://your-cluster.qdrant.io:6333
AUTO_VECTOR_STORE_API_KEY=your-cluster-api-key
AUTO_VECTOR_STORE_COLLECTION=knowledge_chunks
AUTO_EMBEDDING_MODE=native
AUTO_EMBEDDING_MODEL=your-enabled-model
AUTO_EMBEDDING_DIMENSIONS=384
QDRANT_DISTANCE=Cosine
```

`384` è solo un esempio: sostituirlo con le dimensioni del modello scelto.

```bash
npm run ingest
npm run upload:vector-store -- --namespace support --domain billing ./file.md
npm run upload:vector-store -- --namespace support --manifest ./kb/source/split/run/manifest.json
```

Il provisionamento richiede un unico vettore denso senza nome, con dimensioni e distanza compatibili, e crea indici `keyword` per namespace e dominio se assenti. Il readback verifica payload e vettori. La ricerca richiede namespace e accetta dominio, limite e `scoreThreshold`, restituendo il punteggio nativo del Qdrant, dipendente dalla metrica.

```ts
import { QdrantSearchAdapter, resolveVectorStoreProviderConfiguration } from "remote-ingestion-retrieval";

const configuration = resolveVectorStoreProviderConfiguration();
const search = new QdrantSearchAdapter({
  url: configuration.baseUrl!,
  apiKey: configuration.apiKey,
  collection: configuration.collection!,
  model: configuration.embedding.model,
  dimensions: configuration.embedding.dimensions!,
});
const results = await search.search({ query: "Come pagare?", namespace: "support", domain: "billing", limit: 5 });
```

Per installazioni locali o modelli dell'host usare `AUTO_EMBEDDING_MODE=provided` e `AUTO_EMBEDDING_PROVIDER_MODULE=./embedding-provider.ts`. Il modulo implementa `EmbeddingProvider` e riceve solo la configurazione degli embedding, non la chiave del database. È possibile iniettarlo direttamente:

```ts
const adapter = await createKnowledgeBaseVectorStoreAdapter(configuration, { embeddingProvider });
```

La modalità deve essere `provided`; le dimensioni provengono dalla configurazione o da `embeddingProvider.dimensions` e devono corrispondere alla collection. Usare lo stesso provider per la ricerca. Su Weaviate, gli embedding host passano invece da `WeaviateVectorStore` e dalla facciata incrementale.

`createPrecomputedVectorStore(configuration)` crea lo storage per il percorso incrementale; chiamare `ensureCollection()` prima dell'uso. Il percorso file non elimina vecchi chunk di file cambiati. Un cambio di modello/dimensioni richiede una collection compatibile e una nuova `pipelineRevision`.

I limiti dello splitter sono in caratteri, non token. Adeguarli al contesto del modello: Cloud Inference può troncare input troppo lunghi. Vettori nominati, sparse/multivector e ricerca ibrida non fanno parte di questo adapter denso.

## Riprendere soltanto l'upload dopo un errore

`AUTO_MAX_KB_FILES` limita i documenti originali a 100; `AUTO_MAX_SPLIT_FILES` limita i file generati a 10000. Quindi 97 pagine possono generare oltre 100 segmenti senza superare il limite documenti. `AUTO_MAX_KB_BYTES` è indipendente ed è verificato anche dopo la divisione.

Con documenti e metadati salvati:

```bash
npm run upload:vector-store -- --ingestion-report ./data/ingestion-results/weaviateacademy/744e47aa-741b-4a38-bd87-fbfebdea4895.json
```

Il comando non ripete individuazione, materializzazione o arricchimento. Verifica gli hash, riapplica lo splitter e carica sul provider attualmente selezionato. Gli eventuali documenti falliti nell'acquisizione originale rimangono nel report iniziale; vengono caricati solo quelli salvati.

Report con un risultato Vector Store o risorse remote già registrate vengono rifiutati per evitare duplicazioni automatiche. Consultare `providerProgressPath` prima di reinviare. Il nuovo report collega quello originale e il manifest dei file preparati. `--manifest` riutilizza il manifest; con campo `splitter` non ripete la divisione ed è limitato da `AUTO_MAX_SPLIT_FILES`. Originali e report precedente restano intatti.

## API ed estensione

Oltre alla facciata sono disponibili `discoverWebsite()`, `materializeUrl()`, `chunkDocument()`, `ingestWebsite()`, `ingestUrl()` e `close()`. I servizi avanzati sono importabili da `remote-ingestion-retrieval/advanced`.

L'acquisizione mantiene protezioni di URL, DNS e redirect, limiti bytes/tempo e cancellazione. PDF richiede un `PdfMarkdownProcessor` dell'host. Markdown più metadati rimangono il confine tra acquisizione e processamento successivo.

Le strategie GitHub e di deduplicazione sono in [Strategie di individuazione e deduplicazione](docs/ingestion-strategies.md), con evidenze dei casi `githubqdrant` e `giassi` e proposte future.

## Verifica locale

L'adapter OpenAI associa i file con richieste individuali e concorrenza limitata da `AUTO_UPLOAD_CONCURRENCY` (predefinito 4), inviando `attributes` e `chunking_strategy` nella stessa richiesta. Poi recupera tutti i file e confronta i valori persistiti; `0/0` non viene accettato come successo. `ingest` e `upload:vector-store` inoltrano le stesse opzioni di token e concorrenza.

Gli ID remoti vengono registrati durante l'esecuzione in `<report>.progress.json` e in `providerProgress`, anche se la verifica successiva fallisce. Prima di ripetere un'esecuzione con risorse già create, consultare il checkpoint: un nuovo tentativo OpenAI potrebbe creare un altro store.

```bash
npm run typecheck
npm run build
```

Questi comandi verificano tipi e compilazione. Non eseguono ingestione, generazione di embedding, scritture nei cluster o ricerche reali.


## Riprendere un upload che ha già creato risorse remote

Se un upload si è interrotto dopo la creazione del Vector Store o l'invio dei file, usare `--resume-upload-report` con il report dell'upload. Il flusso riutilizza lo stesso store e tutti i 195 file già inviati nell'esecuzione di esempio, verifica prima i file associati e associa soltanto quelli pendenti. Non ripete upload dei file, crawl, arricchimento dei metadati o splitting.

```bash
AUTO_UPLOAD_MAX_ELAPSED_MS=3600000 AUTO_UPLOAD_CONCURRENCY=4 npm run upload:vector-store -- --resume-upload-report ./data/vector-store-uploads/openai-compatible/6dbbd497-6cf8-426a-90a2-c301305aad6f.json
```

`AUTO_UPLOAD_CONCURRENCY` (predefinito 4) limita sia gli upload alla Files API sia le richieste individuali di associazione; non usa l'endpoint batch. Rimane attiva la verifica rigorosa dei metadati e del chunking statico persistiti per ogni file.

`AUTO_UPLOAD_MAX_ELAPSED_MS` controlla il timeout dell'upload autonomo e della ripresa. La precedenza è: valore specifico dell'upload, poi `AUTO_MAX_ELAPSED_MS` se impostato, infine 3600000 ms quando entrambi sono assenti. Il limite globale predefinito di `npm run ingest` resta 600000 ms. Impostare soltanto `AUTO_MAX_ELAPSED_MS=600000` limita anche l'upload autonomo a dieci minuti; il comando sopra consente esplicitamente un'ora.

La ripresa è una funzionalità implementata; questa documentazione non afferma che sia stata convalidata una nuova esecuzione remota.


### Riparare associazioni OpenAI non valide durante la ripresa

La verifica OpenAI ripete la lettura secondo `AUTO_VECTOR_STORE_VERIFICATION_ATTEMPTS` (predefinito 3) e `AUTO_VECTOR_STORE_VERIFICATION_DELAY_MS` (predefinito 250 ms), mantenendo rigorosi i controlli di metadati e chunking statico. Una risposta `0/0` rimane un errore. La ripresa controlla le associazioni esistenti; senza l'opzione seguente segnala quelle non valide e si interrompe senza modificarle.

```bash
AUTO_UPLOAD_MAX_ELAPSED_MS=3600000 AUTO_UPLOAD_CONCURRENCY=8 npm run upload:vector-store -- --resume-upload-report ./data/vector-store-uploads/openai-compatible/187756d1-f130-476e-9987-ddbf0b026359.json --repair-invalid-associations
```

`--repair-invalid-associations` è consentito soltanto con `--resume-upload-report` e autorizza a rimuovere e ricreare esclusivamente le associazioni non valide nello stesso Vector Store, con lo stesso File ID, gli stessi attributi e la strategia richiesta. Non elimina la risorsa della Files API, non crea un nuovo store e non ripete l'upload. Le associazioni valide restano intatte. Il file interessato può essere temporaneamente assente dai risultati di ricerca durante la rielaborazione dell'associazione.

Il comando ripara prima una sola associazione e ne verifica interamente il risultato. Soltanto dopo il successo di questa prima riparazione procede sulle altre con concorrenza limitata; se fallisce, le restanti non vengono modificate. Errori di elaborazione e problemi imprevisti non vengono riparati indiscriminatamente. L'opzione non riduce i controlli e non accetta il chunking nativo `0/0` come successo.
