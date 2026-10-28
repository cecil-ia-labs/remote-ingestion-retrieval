# Remote Ingestion Retrieval

Biblioteca TypeScript para transformar URLs e websites em Markdown, dividir o conteúdo e inseri-lo em uma base de conhecimento. Inclui aquisição HTTP e por navegador, descoberta de páginas, metadados, limites de execução e sincronização incremental de vetores.

O pacote oferece duas formas de armazenamento:

- **Vetores pré-calculados:** `RemoteSourceIngestion` recebe um `EmbeddingProvider` e um `VectorStore`. Os adapters `WeaviateVectorStore` e `QdrantVectorStore` gravam e excluem vetores, incluindo instalações próprias.
- **Arquivos Markdown:** `KnowledgeBaseVectorStoreAdapter` recebe arquivos e metadados. Os adapters Weaviate/Qdrant dividem o texto e usam a vetorização nativa do cluster; o Qdrant também aceita embeddings fornecidos pelo host.

Esses contratos têm responsabilidades diferentes. Uma API de upload de arquivos não precisa implementar o contrato de vetores pré-calculados.

## Configuração comum dos providers

`AUTO_VECTOR_STORE_BASE_URL` é a URL principal do armazenamento selecionado. A configuração compartilhada é resolvida por `resolveVectorStoreProviderConfiguration()` e consumida por `createKnowledgeBaseVectorStoreAdapter()` e `createPrecomputedVectorStore()`.

| Variável | Responsabilidade |
| --- | --- |
| `AUTO_VECTOR_STORE_PROVIDER` | `weaviate`, `qdrant`, `openai-compatible` ou `custom`. |
| `AUTO_VECTOR_STORE_BASE_URL` | Endpoint HTTP(S) da API do armazenamento. |
| `AUTO_VECTOR_STORE_API_KEY` | Chave do armazenamento selecionado. |
| `AUTO_VECTOR_STORE_COLLECTION` | Collection dos providers Weaviate/Qdrant. |
| `AUTO_VECTOR_STORE_TIMEOUT_MS` | Timeout de requisição; padrão 30000. |
| `AUTO_VECTOR_STORE_BATCH_SIZE` | Lote; padrão 100, entre 1 e 200 na configuração comum. |
| `AUTO_VECTOR_STORE_MAX_CHUNKS` | Limite antes das chamadas de embeddings; padrão 10000. |
| `AUTO_VECTOR_STORE_MAX_CHUNK_CHARACTERS` | Divisão local; padrão 6400 caracteres. |
| `AUTO_VECTOR_STORE_VERIFICATION_ATTEMPTS` | Tentativas de confirmação; padrão 3. |
| `AUTO_VECTOR_STORE_VERIFICATION_DELAY_MS` | Intervalo entre tentativas; padrão 250, aceita zero. |
| `AUTO_EMBEDDING_MODE` | `native` ou `provided`; seleciona `provided` por padrão quando há módulo de embeddings. |
| `AUTO_EMBEDDING_MODEL` / `AUTO_EMBEDDING_DIMENSIONS` | Modelo e dimensões dos embeddings. |
| `AUTO_EMBEDDING_BASE_URL` / `AUTO_EMBEDDING_API_KEY` | Conexão de um serviço externo de embeddings, fornecida ao módulo do host. |
| `AUTO_EMBEDDING_PROVIDER_MODULE` | Módulo que exporta `embeddingProvider` ou `createEmbeddingProvider(configuration)`. |

Valores genéricos **não vazios** têm precedência sobre os aliases do provider selecionado. `WEAVIATE_URL`, `WEAVIATE_API_KEY`, `WEAVIATE_COLLECTION` e as opções `WEAVIATE_*` anteriores continuam como fallback para Weaviate. Os aliases equivalentes `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION`, `QDRANT_EMBEDDING_MODEL`, `QDRANT_EMBEDDING_DIMENSIONS` e demais opções `QDRANT_*` também são aceitos. Nenhuma chave específica de outro provider é reutilizada. `QDRANT_DISTANCE` permanece específico, pois configura uma capacidade do Qdrant.

Ao migrar um `.env` antigo, remova valores genéricos antigos que apontem para outro serviço: eles agora têm precedência também no Weaviate. A implementação não altera seu arquivo `.env` nem migra credenciais automaticamente.

O endpoint de embeddings externo é independente do armazenamento: `AUTO_EMBEDDING_BASE_URL` não substitui `AUTO_VECTOR_STORE_BASE_URL`. Embeddings nativos do Weaviate/Qdrant usam a chave do cluster. O Weaviate também permite configurar a URL de seu vectorizer nativo por `AUTO_EMBEDDING_BASE_URL`; o Qdrant nativo usa Cloud Inference do próprio cluster e rejeita um endpoint externo nesse modo.

```ts
import {
  resolveVectorStoreProviderConfiguration,
  createKnowledgeBaseVectorStoreAdapter,
} from "remote-ingestion-retrieval";

const configuration = resolveVectorStoreProviderConfiguration(process.env);
const adapter = await createKnowledgeBaseVectorStoreAdapter(configuration);
// Mesmo contrato de arquivos para o provider selecionado.
const result = await adapter.ingest({ name: "Support", namespace: "support", files });
```

Módulos customizados de Vector Store recebem essa configuração em `createVectorStoreAdapter(configuration)`; módulos legados sem argumentos continuam compatíveis. Sem provider explícito, um módulo selecionado usa `custom`; sem módulo, o fallback permanece `openai-compatible`.

## Instalação

Requer Node.js 22 ou superior.

```bash
npm ci
npm run build
```

Para páginas que dependem de JavaScript, instale o Chrome correspondente ao Puppeteer:

```bash
npx puppeteer browsers install chrome
```

Em outro projeto local, instale este diretório como dependência. O nome do pacote é `remote-ingestion-retrieval`:

```bash
npm install /caminho/para/remote-ingestion-retrieval
```

O entry point compilado é `dist/index.js`. Importar a biblioteca não inicia um crawl, abre o navegador nem chama providers. Para executar uma ingestão, use os exemplos abaixo ou o runner manual. Não execute `node src/index.ts`.

## Ingestão manual com Weaviate Cloud

Crie `.env` a partir de `.env.example` e configure uma fonte e uma collection:

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

Execute:

```bash
npm run ingest
```

O runner descobre páginas, materializa Markdown, enriquece os metadados, aplica o splitter e envia o resultado ao adapter. A seleção `weaviate` usa os módulos incluídos neste repositório; não depende do checkout de benchmarks.

A collection é criada se não existir. Uma collection existente precisa ter o mesmo vectorizer, modelo, configuração de embeddings e propriedades esperadas. O adapter rejeita incompatibilidades em vez de alterar o schema existente. Use uma collection dedicada, com um vetor sem nome. Nomes devem começar com letra maiúscula e conter somente letras, números e `_`.

O vectorizer `text2vec-weaviate` gera os embeddings na importação dos objetos e está disponível no Weaviate Cloud. Não há uma chamada separada a `/embeddings` nesta integração. Consulte a [documentação oficial dos embeddings Weaviate](https://docs.weaviate.io/weaviate/model-providers/weaviate/embeddings) para modelos, dimensões e disponibilidade.

Os arquivos originais ficam em `kb/<SOURCE_ID>/`. Os arquivos efetivamente enviados após o splitter e seu `manifest.json` ficam em `kb/<SOURCE_ID>/split/<id>/`. Os relatórios de execução ficam em `data/ingestion-results/<SOURCE_ID>/` e incluem o resultado do adapter. O resultado Weaviate identifica a collection e os objetos `{filename, id, chunkId}`; não representa uploads pela API Files da OpenAI.

O runner faz importação/upsert, sem remover objetos antigos de arquivos alterados. Para snapshots isolados, escolha outra collection; para atualizações com remoção de conteúdo anterior, use o pipeline incremental com vetores pré-calculados. Falhas de um lote podem ocorrer depois de outros objetos terem sido persistidos: o adapter verifica o status de cada objeto e só retorna sucesso após todos os lotes terminarem. IDs são determinísticos por collection, namespace e identidade do chunk.

### Configuração do Weaviate

| Variável | Uso / padrão |
| --- | --- |
| `AUTO_VECTOR_STORE_BASE_URL` | Endpoint do cluster; pode terminar em `/v1`. Obrigatório. |
| `AUTO_VECTOR_STORE_COLLECTION` | Collection dedicada. Obrigatório. |
| `AUTO_VECTOR_STORE_API_KEY` | Chave do cluster; mantida somente no ambiente local. |
| `AUTO_EMBEDDING_MODEL` | `Snowflake/snowflake-arctic-embed-l-v2.0`. |
| `AUTO_EMBEDDING_DIMENSIONS` | Dimensões opcionais, suportadas pelo modelo escolhido. |
| `AUTO_EMBEDDING_BASE_URL` | Endpoint opcional do serviço de embeddings configurado no vectorizer. |
| `AUTO_VECTOR_STORE_TIMEOUT_MS` | Timeout por requisição; `30000`. |
| `AUTO_VECTOR_STORE_BATCH_SIZE` | Objetos por lote; `100`, entre 1 e 200. |
| `AUTO_VECTOR_STORE_MAX_CHUNK_CHARACTERS` | Tamanho do splitter local do adapter; `6400` caracteres. |

O tamanho em caracteres não garante uma contagem exata de tokens nem overlap. O adapter Weaviate rejeita `request.chunking` com parâmetros de tokens; o runner omite esse campo para `AUTO_VECTOR_STORE_PROVIDER=weaviate`.

### Limites e metadados do runner

| Variável | Padrão / finalidade |
| --- | --- |
| `AUTO_MAX_PAGES` | 100 páginas descobertas. |
| `AUTO_MAX_DEPTH` | Profundidade 4. |
| `AUTO_CRAWL_CONCURRENCY` | 4 operações de descoberta. |
| `AUTO_MATERIALIZATION_CONCURRENCY` | 4 materializações. |
| `AUTO_MAX_KB_FILES` | 100 documentos de origem, antes do splitter. |
| `AUTO_MAX_SPLIT_FILES` | 10000 arquivos gerados pelo splitter, independentemente da quantidade de documentos. |
| `AUTO_MAX_KB_BYTES` | 50 MiB de Markdown; aplicado também ao resultado do splitter. |
| `AUTO_SPLITTER_MAX_CHARS` | Splitter estrutural do runner: 6400 caracteres por segmento. |
| `AUTO_SPLITTER_MAX_INPUT_CHARACTERS` | 3.000.000 caracteres antes de executar o splitter sobre a coleção. |
| `AUTO_METADATA_MODE` | `local`, sem chamadas a modelos; `model` usa um enricher fornecido. |
| `AUTO_MARKDOWN_SPLITTER_MODULE` | Módulo opcional que exporta `markdownSplitter` ou `createMarkdownSplitter()`. |
| `AUTO_VECTOR_STORE_ADAPTER_MODULE` | Módulo opcional que exporta `vectorStoreAdapter` ou `createVectorStoreAdapter()`. |
| `AUTO_METADATA_ENRICHER_MODULE` | Módulo opcional que exporta `metadataEnricher` ou `createMetadataEnricher()`. |

Os limites de tempo e aquisição também podem ser ajustados com `AUTO_MAX_ELAPSED_MS`, `AUTO_PAGE_TIMEOUT_MS`, `AUTO_MAX_BYTES_PER_DOCUMENT` e `AUTO_MAX_FAILURES`. A saída local e os relatórios devem ser consultados para distinguir execução parcial de uma base completa.

O modo local deriva `domain`, `tags` e `keywords` do conteúdo e da hierarquia das páginas. O modo de modelo mantém cache por provider, domínio, URL e hash; seus limites são `AUTO_METADATA_MAX_REQUESTS` (100), `AUTO_METADATA_MAX_INPUT_CHARS` (3.000.000), `AUTO_METADATA_MAX_CHARS`, `AUTO_METADATA_MODEL` e `AUTO_METADATA_CONCURRENCY`. Os limites de requisições e caracteres não são um teto monetário.

Os providers integrados `weaviate` e `qdrant` têm precedência sobre `AUTO_VECTOR_STORE_ADAPTER_MODULE`. O modo `openai-compatible` usa o adapter OpenAI incluído neste projeto quando não há módulo explícito; `custom` usa um módulo fornecido pelo host. Apenas o enricher de modelo legado ainda tem fallback no projeto irmão `../3_benchmarks/realtime-compare-mcp-x-function/MarkdownSplitter/`; configure `AUTO_METADATA_ENRICHER_MODULE` em outros checkouts. Os fluxos com metadados locais e splitter estrutural funcionam sem esse módulo externo.

## MarkdownSplitter

### Divisão local

`StructuralMarkdownSplitter` é o padrão da fachada e do runner. Preserva o texto e offsets UTF-16, prefere limites de parágrafos e não chama modelos. Um limite pode dividir blocos longos de código ou tabelas; injete outro splitter quando precisar preservar esses blocos integralmente.

```ts
import { StructuralMarkdownSplitter } from "remote-ingestion-retrieval";

const splitter = new StructuralMarkdownSplitter({ maxCharacters: 6400 });
const segments = await splitter.split(markdown, {
  sourceId: "docs",
  documentId: "installation",
  canonicalUrl: "https://docs.example.com/install",
  documentContentHash: "hash-do-documento",
});
```

Para reutilizar um splitter que já existe na aplicação, use `ExistingMarkdownSplitterAdapter`, com `split`, `toMarkdown` e, se houver, `toMetadata`.

### Divisão semântica compatível com inx-nlp

`SemanticMarkdownSplitter` incorpora o contrato `files + metadata` e as regras do projeto MarkdownSplitter e da task `markdown-splitter` do inx-nlp. O executor de modelo/task é injetado pela aplicação; não há SDK ou modelo obrigatório.

O splitter fornece instruções, JSON Schema e contexto de origem ao executor. Ele exige nomes `NN_semantic_domain.md` em sequência, Markdown sem front matter ou fences externos, metadados completos e correspondência exata entre arquivos e manifest. A saída é validada antes de virar chunks ou arquivos de conhecimento.

```ts
import {
  SemanticMarkdownSplitter,
  type SemanticMarkdownExecutionRequest,
} from "remote-ingestion-retrieval";

// runStructuredTask é o executor autenticado da aplicação hospedeira.
// Ele deve respeitar request.signal e retornar o objeto files+metadata ou seu JSON.
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

Para o runner, salve esse módulo e configure `AUTO_MARKDOWN_SPLITTER_MODULE=./caminho/splitter.ts`. Um arquivo `.ts` é carregado pelo `tsx` já usado em `npm run ingest`. O `runStructuredTask` é uma dependência da aplicação e precisa estar implementado/importado nesse módulo; não é um export desta biblioteca.

A chamada `split(markdown, context)` retorna segmentos para `WebDocumentChunker`. A chamada `files(markdown, context)` retorna `KnowledgeBaseFile[]` para adapters de arquivos. `normalize(markdown, context)` retorna o contrato original:

```ts
const knowledgeBase = await splitter.normalize(markdown, context);
// { files: [{ filename, markdown }], metadata: [{ filename, attributes }] }
```

Os atributos compatíveis são `organization`, `language`, `document_type`, `domain`, `audience`, `kb_namespace`, `source_file`, `source_pages`, `temporal_sensitivity`, `review_required`, `source_effective_date`, `normalized_from`, `normalized_on` e `tags`. Os valores de origem, namespace e data fornecidos ao executor devem voltar intactos. Para fontes web, `normalized_from` aceita `markdown` e `html`, além dos valores PDF usados pelo contrato original.

A execução preserva o idioma, números, condições, exceções e ambiguidades da fonte. A validação estrutural não prova fidelidade factual de um modelo; `review_required` continua relevante. Alterações semânticas não recebem offsets inventados: o chunker só marca uma posição como resolvida quando há correspondência no texto ou offsets explícitos.

Os metadados semânticos são mantidos em `chunk.metadata.splitter.attributes` e projetados para os metadados vetoriais. Os identificadores e hashes gerados pelo pipeline têm precedência sobre atributos do splitter.

## Pipeline incremental com vetores pré-calculados

Use esse caminho quando o host já fornece embeddings ou precisa de reconciliação incremental, inclusive exclusão de chunks antigos. O Weaviate fica configurado com `vectorizer: none`.

```ts
import {
  RemoteSourceIngestion,
  StructuralMarkdownSplitter,
  WeaviateVectorStore,
} from "remote-ingestion-retrieval";

// embeddingProvider implementa EmbeddingProvider e pertence à aplicação.
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

Para uma única URL, use `source.type: "url"`; os demais campos básicos da fonte são os mesmos. `pipelineRevision` deve mudar quando houver alteração do splitter, modelo, dimensões, pré-processamento ou projeção dos metadados. Preserve o diretório de estado para que a próxima execução possa reconhecer conteúdo inalterado.

`insertSource(request)` propaga exceções. `runSourceInsertion(request)` retorna `completed`, `partial`, `failed` ou `aborted`, com `runId`, resumo e erro estruturado quando houver falha. Um snapshot incompleto não autoriza remover documentos que não foram observados.

O `namespace` participa dos IDs dos objetos e é persistido como propriedade para filtros. Ele é uma separação lógica; a autorização de acesso ao cluster deve ser configurada pelo host.

## Uso direto do adapter de arquivos

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

`domain` é uma propriedade de tokenização `field`, adequada a igualdade exata. `tags` e `keywords` aceitam arrays ou strings separadas por vírgula; o adapter os persiste como arrays. A proveniência completa é conservada em `metadataJson`.

O `inx-voice-assistant-inxide` consultado usa `/vector_stores/{id}/search` da API OpenAI e filtros exatos por domínio. Uma collection Weaviate não substitui diretamente esse ID. O `WeaviateSearchAdapter` incluído mantém os filtros de namespace/domínio e converte os objetos em resultados com texto e proveniência; o host precisa selecionar esse adapter no caminho de busca. Os serviços inx não são alterados por esta biblioteca.

## Upload de arquivos existentes ao Weaviate

Para enviar Markdown/texto já salvo, sem repetir o crawl, configure `AUTO_VECTOR_STORE_BASE_URL`, `AUTO_VECTOR_STORE_COLLECTION` e a chave do cluster em `.env`:

```bash
npm run upload:weaviate -- --namespace support --domain billing ./kb/01_billing.md
```

Também é possível reutilizar os arquivos e metadados de um manifest gerado pelo runner:

```bash
npm run upload:weaviate -- --namespace support --manifest ./kb/source/split/run/manifest.json
```

O manifest deve conter `files: [{ filename, metadata }]`; cada arquivo fica ao lado dele. A seleção por caminhos aceita `.md`, `.markdown` e `.txt` UTF-8. Os limites padrão são 100 arquivos, 5 MiB por arquivo e 50 MiB no total, ajustáveis por `AUTO_MAX_KB_FILES`, `AUTO_MAX_BYTES_PER_DOCUMENT` e `AUTO_MAX_KB_BYTES`. O adapter também limita a 10.000 chunks antes de chamar embeddings, configuráveis por `AUTO_VECTOR_STORE_MAX_CHUNKS` ou `maxChunks` no construtor. `--report` escolhe o caminho do relatório; o padrão é `data/weaviate-uploads/<id>.json`.

Na API, use `adapter.ingestFiles({ name, namespace, files: [{ path, filename?, metadata? }], signal? })`, ou `loadKnowledgeBaseFiles()` para carregar os arquivos antes de chamar outro adapter. PDFs e outros formatos binários precisam passar pela aquisição/conversão antes desse upload.

No Weaviate, o conteúdo dos arquivos é importado como objetos com texto e metadados; o vectorizer gera os embeddings durante a gravação. Depois dos lotes, o adapter lê cada objeto com seu vetor, confere texto/proveniência e exige vetores não vazios, finitos e com dimensões consistentes. O resultado contém IDs reais dos chunks por arquivo, hashes, bytes e o resumo `verification`. Somente após essa conferência o upload é considerado concluído. `AUTO_VECTOR_STORE_VERIFICATION_ATTEMPTS` (3, entre 1 e 10) e `AUTO_VECTOR_STORE_VERIFICATION_DELAY_MS` (250) controlam as tentativas.

O relatório do runner conserva `files` para os documentos originais e `splitFiles`, `objects` e `splitManifestPath` para os arquivos efetivamente enviados e os objetos persistidos. Assim, a mudança de nomes causada pelo splitter não é tratada como falha de upload.

## Busca Weaviate para consumidores inx

`WeaviateSearchAdapter` consulta pelo SDK oficial/gRPC e devolve `{ data, has_more: false }`. Cada resultado contém `file_id`, `filename`, `score`, `distance`, `attributes` e `content: [{ type: "text", text }]`.

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
  const results = await search.search({
    query: "Como pagar a fatura?",
    namespace: "support",
    domain: "billing",
    limit: 5,
  });
  console.log(results.data);
} finally {
  await search.close();
}
```

O namespace é obrigatório; domínio é um filtro opcional de igualdade exata. A busca usa `nearText` para vetorização nativa. Para collections de vetores pré-calculados, injete o mesmo `EmbeddingProvider` da ingestão para usar `nearVector`. Conexões próprias e portas HTTP/gRPC são configuráveis por `connection: { mode: "custom", options }`; um client já existente pode ser injetado diretamente no construtor.

`score` é a distância vetorial negativa: maior é melhor, e não representa uma probabilidade nem a escala de scores da OpenAI. Ajuste eventuais thresholds no consumidor. A integração fornece o adapter e o formato de resultados; o roteamento do serviço inx para esse adapter continua sendo configuração/integração do host. O SDK/gRPC evita depender de [GraphQL descontinuado ou da REST Search em preview](https://docs.weaviate.io/weaviate/api/graphql/migration).

## Aquisição de repositórios GitHub

O runner reconhece URLs de repositório, `/tree/` e `/blob/` do GitHub e escolhe a aquisição de arquivos automaticamente. Para selecionar explicitamente, use `SOURCE_PROFILE=github-repository`; `SOURCE_PROFILE=website` força o crawler convencional.

```dotenv
SOURCE_URL=https://github.com/qdrant/qdrant
SOURCE_ID=githubqdrant
SOURCE_PROFILE=github-repository
GITHUB_TOKEN=
GITHUB_INCLUDE_CODE=false
GITHUB_MAX_FILES=100
GITHUB_MAX_API_REQUESTS=200
```

Execute `npm run ingest` com o adapter de destino configurado. A entrada não consulta sitemap nem páginas sociais do GitHub. A referência é resolvida para um commit no início; a árvore desse commit produz os candidatos. Os downloads usam blobs brutos pelo SHA, com conferência do hash Git e do tamanho. A ordem favorece README da raiz, documentação, referências de API e exemplos. Não executa código nem segue links da interface ou links externos.

No uso como biblioteca, a seleção é explícita na fonte:

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
// Passe githubToken nas opções de RemoteSourceIngestion, fora dos metadados da fonte.
```

Use uma referência e um caminho que existam no repositório selecionado. `GITHUB_REF` e `GITHUB_PATH` permitem definir esse escopo no runner. Sem referência, usa a branch padrão. Referências com barras em URLs tree/blob são resolvidas pela API, sem assumir que apenas o primeiro segmento seja a branch.

`GITHUB_INCLUDE` e `GITHUB_EXCLUDE` aceitam listas de globs de caminhos relativos ao repositório, separadas por vírgula, como `docs/**,README.md`. Código-fonte exige `GITHUB_INCLUDE_CODE=true`. Arquivos binários, lockfiles, gerados, dependências, submódulos e symlinks ficam excluídos. Ponteiros Git LFS e conteúdos binários inesperados geram falha de materialização, sem indexar o ponteiro como documento.

Os limites são `GITHUB_MAX_FILES` (100), `GITHUB_MAX_FILE_BYTES` (5 MiB), `GITHUB_MAX_API_REQUESTS` (200, contando enumeração e reservando os downloads), `GITHUB_MAX_API_RESPONSE_BYTES` (16 MiB por resposta) e `GITHUB_MAX_TREE_ENTRIES` (100.000). O limite de páginas da fonte também restringe os arquivos. Para repositórios privados, use um token com permissão de leitura de Contents; ele só vai para `api.github.com`, sem redirects, e não é persistido nos metadados. Sem token, aplicam-se os limites públicos da API GitHub.

Árvores recursivas truncadas acionam enumeração de subárvores. Se ainda houver truncamento ou esgotamento de orçamento, o snapshot fica parcial. O relatório registra commit, escopo, candidatos elegíveis, selecionados, pendentes, chamadas e amostras dos caminhos ignorados com os motivos. Os documentos carregam `{ owner, repo, ref, commitSha, path, blobSha }`; a identidade usa referência/caminho estáveis entre commits, enquanto a aquisição usa o blob fixado. As proteções existentes de DNS, bytes, tempo e cancelamento também se aplicam à API GitHub.

Snapshots parciais não autorizam apagar documentos não observados na sincronização incremental. A mesma proteção agora trata o limite de páginas de websites convencionais de forma conservadora.

## Qdrant

`npm run ingest` realiza o upload automaticamente após descoberta, materialização, metadados e divisão, tanto para Weaviate quanto para Qdrant. Não é necessário executar um segundo comando de upload após uma ingestão concluída. Limites ou falhas anteriores podem impedir essa etapa; confira o status e o resultado de Vector Store no relatório.

O suporte inclui `QdrantVectorStore`, `QdrantKnowledgeBaseAdapter` e `QdrantSearchAdapter`. Usa REST com autenticação `api-key`, timeout/cancelamento, UUIDs determinísticos por namespace e operações de gravação com `wait=true`. Não há upload fictício para uma API Files: os arquivos são divididos localmente e importados como pontos com texto, payload e vetor.

Para Cloud Inference, habilite o recurso no cluster e copie o **modelo e as dimensões exatos** da aba Inference do painel. O adapter não presume esses valores. O fluxo segue a [documentação oficial do Qdrant Cloud Inference](https://qdrant.tech/documentation/inference/cloud-inference/).

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

`384` é apenas um exemplo: substitua-o pelas dimensões do modelo selecionado. Depois, use os mesmos comandos de ingestão e upload:

```bash
npm run ingest
npm run upload:vector-store -- --namespace support --domain billing ./arquivo.md
npm run upload:vector-store -- --namespace support --manifest ./kb/source/split/run/manifest.json
```

O upload genérico grava relatórios em `data/vector-store-uploads/<provider>/`. O comando legado `upload:weaviate` continua disponível e seleciona Weaviate explicitamente, preservando seu diretório de relatórios anterior.

O provisionamento verifica collection com um único vetor denso sem nome e dimensões/distância compatíveis; cria índices `keyword` para namespace e domínio quando ausentes. O readback confere payload, texto, IDs e vetores antes de retornar sucesso. A busca exige namespace, aceita domínio, limite e `scoreThreshold` e retorna o score nativo do Qdrant, cuja interpretação depende da distância configurada.

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
const results = await search.search({ query: "Como pagar?", namespace: "support", domain: "billing", limit: 5 });
```

Para Qdrant instalado localmente ou um modelo executado pelo host, use `AUTO_EMBEDDING_MODE=provided` e `AUTO_EMBEDDING_PROVIDER_MODULE=./embedding-provider.ts`. O módulo implementa o contrato `EmbeddingProvider` já usado pela biblioteca e recebe somente a configuração de embeddings, sem a chave do banco. Também pode ser injetado pela aplicação:

```ts
const adapter = await createKnowledgeBaseVectorStoreAdapter(configuration, { embeddingProvider });
```

Nesse caso, `configuration.embedding.mode` deve ser `provided`. As dimensões vêm da configuração ou de `embeddingProvider.dimensions`, e precisam coincidir com a collection. Use o mesmo provider para consultas, passando-o a `QdrantSearchAdapter`. Para Weaviate com embeddings fornecidos pelo host, o caminho continua sendo `WeaviateVectorStore` com a fachada incremental; seu adapter de arquivos usa vetorização nativa.

A factory `createPrecomputedVectorStore(configuration)` cria o armazenamento Weaviate/Qdrant para o pipeline incremental. Chame `ensureCollection()` antes do primeiro uso. O adapter de arquivos faz upsert de snapshots e não remove chunks antigos de arquivos alterados; a reconciliação de remoções usa o pipeline incremental. Mudar modelo/dimensões exige configurar uma collection compatível e atualizar `pipelineRevision`.

O limite do splitter é medido em caracteres, não tokens. Ajuste-o à janela do modelo: o Cloud Inference pode truncar textos maiores. Collections com vetores nomeados, sparse/multivector e busca híbrida não fazem parte deste adapter denso.

## Retomar somente o upload após uma falha

`AUTO_MAX_KB_FILES` limita documentos de origem; `AUTO_MAX_SPLIT_FILES` limita os arquivos produzidos pela divisão. Os padrões são, respectivamente, 100 e 10000. Um crawl de 97 páginas pode gerar mais de 100 segmentos sem exceder o limite de documentos. `AUTO_MAX_KB_BYTES` continua sendo um teto separado de bytes e também é conferido após a divisão.

Quando os documentos e seus metadados já estão salvos, reenvie-os pelo relatório de ingestão:

```bash
npm run upload:vector-store -- --ingestion-report ./data/ingestion-results/weaviateacademy/744e47aa-741b-4a38-bd87-fbfebdea4895.json
```

Esse comando não repete descoberta, materialização nem enriquecimento. Ele verifica os hashes dos arquivos salvos, reaplica o splitter configurado e faz o upload ao provider selecionado no ambiente atual. Os três documentos que falharam na materialização original continuam registrados apenas no relatório original; o reenvio cobre os documentos que foram salvos com sucesso.

Relatórios que já contêm um resultado de Vector Store são recusados para evitar repetir automaticamente um upload concluído. O novo relatório aponta para o original e para o manifest dos arquivos preparados. Para reutilizar um manifest de divisão, use `--manifest`; manifests com `splitter` informado não passam novamente pela divisão e são limitados por `AUTO_MAX_SPLIT_FILES`. Os documentos originais e o relatório anterior permanecem intactos.

## APIs e extensão

Além da fachada, estão disponíveis `discoverWebsite()`, `materializeUrl()`, `chunkDocument()`, `ingestWebsite()`, `ingestUrl()` e `close()`. Os serviços avançados podem ser importados por `remote-ingestion-retrieval/advanced`.

A aquisição mantém as proteções de URL, DNS e redirects, limites de bytes/tempo e cancelamento. PDF depende de um `PdfMarkdownProcessor` fornecido pelo host. Markdown e metadados permanecem a fronteira entre aquisição e processamento downstream.

As estratégias para repositórios GitHub e deduplicação estão em [Estratégias de descoberta e deduplicação](docs/ingestion-strategies.md), com as evidências dos casos `githubqdrant` e `giassi`, contenções disponíveis e propostas de implementação.

## Validação local

O adapter OpenAI associa os arquivos individualmente e em sequência, com `attributes` e `chunking_strategy` no mesmo pedido, seguindo o inx-nlp. Depois lê todos os arquivos e confere os valores persistidos; um retorno `0/0` não é aceito como sucesso. `ingest` e `upload:vector-store` encaminham as mesmas opções de tokens e concorrência. IDs remotos são registrados durante a operação em `<relatório>.progress.json` e em `providerProgress`, mesmo se a verificação posterior falhar. Antes de reenviar uma execução que já criou recursos, consulte esse checkpoint; uma nova tentativa pode criar outro store no OpenAI.

```bash
npm run typecheck
npm run build
```

Esses comandos verificam tipos e compilação. Não executam ingestão, geração de embeddings, gravação em collections ou busca real no provider.
