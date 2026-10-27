# Estratégias de descoberta e deduplicação

Este documento propõe as próximas mudanças. O perfil de repositório GitHub e a deduplicação entre URLs descritos aqui **ainda não estão implementados**. Os exemplos de configuração abaixo usam filtros já existentes na biblioteca.

## Evidências dos casos locais

| Caso | Evidência | Consequência |
| --- | --- | --- |
| `githubqdrant` | O relatório `data/ingestion-results/githubqdrant/48751cae-aa62-4328-8e2c-8b08f1e2595e.json` registra 100 URLs, limite de 100, um sitemap processado e **zero páginas tentadas pelo link crawler**. Há materializações da raiz do repositório, `github.com/`, `/about`, `/about/diversity` e `/customer-stories/...`. | Neste registro, o sitemap global consumiu o orçamento antes do rastreamento do repositório. Restringir somente a origem não restringe `github.com/qdrant/qdrant`. |
| `githubqdrant` | Há 100 arquivos Markdown locais, totalizando 1.020.619 bytes. `qdrant--0fd5c6f21c9f.md` tem 22.142 bytes e começa com navegação do repositório, notificações, forks e estrelas. | A página HTML do GitHub mistura conteúdo útil e interface; também é necessário obter o conteúdo dos arquivos diretamente. |
| `giassi` | Há 100 arquivos, totalizando 54.909 bytes; 65 têm menos de 500 bytes. As amostras `activia--e043c3d216b7.md`, `alicanto--c3499339b693.md` e `always--bd254ee2b500.md` contêm imagem, nome de um produto e o rótulo `Quantidade`. Seus hashes são diferentes. | O formato repetido não prova conteúdo duplicado. Uma deduplicação agressiva poderia apagar produtos distintos; deve separar identidade de produto, conteúdo e interface repetida. |

As contagens de arquivos e bytes vieram do diretório de documentos de cada caso; o exame do Markdown foi amostral. Não se afirma uma taxa global de duplicação do Giassi a partir dessas três amostras.

O relatório do GitHub também terminou com falha na conferência do chunking da Vector Store: foi solicitado `1600/200` e retornado `0/0` para um arquivo. Essa falha de upload é independente do problema de cobertura da descoberta e deve permanecer registrada ao recuperar a execução.

## GitHub: limitar imediatamente e adquirir arquivos como repositório

### Contenção com a API atual

Para um repositório, escolher `crawl` evita começar pelo sitemap global. A lista de inclusão restringe URLs indexáveis ao caminho do repositório; exclusões impedem também a travessia dessas rotas:

```ts
options: {
  crawl: {
    discoveryStrategy: "crawl",
    sameOriginOnly: true,
    include: ["/qdrant/qdrant", "/qdrant/qdrant/**"],
    exclude: [
      "/qdrant/qdrant/issues", "/qdrant/qdrant/issues/**",
      "/qdrant/qdrant/pulls", "/qdrant/qdrant/pulls/**",
      "/qdrant/qdrant/actions", "/qdrant/qdrant/actions/**",
      "/qdrant/qdrant/discussions", "/qdrant/qdrant/discussions/**",
      "/qdrant/qdrant/stargazers", "/qdrant/qdrant/forks",
    ],
    maxPages: 100,
    maxDepth: 4,
    concurrency: 3,
  },
}
```

Os filtros já são aplicados tanto a candidatos do sitemap quanto a links. Porém a inclusão pode permitir a travessia de ancestrais; a URL raiz é emitida separadamente pela descoberta. Este exemplo contém a expansão, mas não garante leitura integral dos arquivos nem a remoção da interface HTML. Aumentar `maxPages` sozinho apenas amplia o desperdício observado.

### Solução proposta: perfil explícito `github-repository`

1. Reconhecer apenas uma URL válida de repositório, arquivo ou árvore do GitHub; guardar `owner`, `repo`, referência e prefixo opcional. Não alterar automaticamente a semântica de toda fonte `website`. Uma referência com barras deve ser resolvida contra branches/tags existentes, em vez de dividir cegamente a URL.
2. Resolver a referência para um commit SHA no início da execução. Enumerar a árvore desse commit, preservando o mesmo snapshot para todos os downloads. A [API oficial de árvores Git](https://docs.github.com/en/rest/git/trees) fornece caminhos, tipos, tamanhos e hashes dos blobs. Quando `truncated` for verdadeiro, percorrer subárvores sem recursão ou declarar resultado parcial; não tratar a lista truncada como completa.
3. Construir candidatos a partir de arquivos, sem usar sitemap de `github.com` nem seguir navegação social. Prioridade padrão: README da raiz, `docs/**`, documentação de API, exemplos e configurações explicativas. Código-fonte entra por opção explícita, com extensões permitidas e metadados de linguagem. Excluir binários, dependências, gerados, vendorizados e lockfiles; não executar código. Submódulos, symlinks e Git LFS exigem política própria e ficam excluídos por padrão.
4. Adquirir o blob bruto vinculado ao SHA, mantendo a URL humana em `canonicalUrl` e a URL de transporte na aquisição. Para downloads via [Repository Contents API](https://docs.github.com/en/rest/repos/contents), obter uma URL de download nova quando necessário, pois ela pode expirar. Nunca reconstruir conteúdo a partir da interface `/blob/` se o arquivo bruto estiver disponível.
5. Encaminhar Markdown diretamente à normalização existente; converter texto/código com o tipo adequado. Preservar `{owner, repo, commitSha, path, blobSha}` na proveniência. Links relativos entre arquivos podem orientar prioridade dentro da árvore; links externos só entram como fontes separadas autorizadas.
6. Aplicar os limites existentes de tempo, bytes, documentos e chunks aos downloads; acrescentar orçamento de chamadas da API e bytes da enumeração. Respeitar rate limits e cancelamento. A política de DNS, protocolos e redirects deve continuar valendo também para `api.github.com` e `raw.githubusercontent.com`; credenciais não atravessam redirects para outra origem.
7. Registrar arquivos elegíveis, adquiridos, ignorados, falhos e pendentes, com motivos. A lista completa de elegíveis dentro do escopo configurado é a referência de cobertura. Orçamento esgotado, autenticação negada ou enumeração incompleta gera snapshot parcial e impede exclusão de documentos não vistos.

A integração deve ocorrer por um serviço de aquisição/descoberta específico, produzindo o mesmo Markdown com metadados consumido pelo pipeline atual. O contrato público de fonte e o relatório precisam ser estendidos explicitamente quando esse perfil for implementado.

Critérios de aceite futuros: nenhuma URL institucional/social adquirida na execução do Qdrant; README e documentos elegíveis do commit fixado aparecem antes de código de baixa prioridade; cancelamento e árvore truncada preservam o estado anterior; trocar a branch durante a execução não mistura versões.

## Giassi: deduplicar sem perder produtos ou proveniência

### Três identidades distintas

- **URL/documento:** mantém endereço, título, origem, datas e estado de sincronização. Aliases continuam recuperáveis para citações.
- **Conteúdo:** representa o Markdown útil ou um bloco de conteúdo, identificado por hash e versão da normalização.
- **Embedding:** representa conteúdo mais a configuração exata do modelo, dimensões e versão do pré-processamento. O mesmo texto pode exigir outro vetor quando essa configuração muda.

A biblioteca já calcula SHA-256 de Markdown normalizado e de chunks em `src/hashing/content-hasher.ts`. Há também hashes de snapshots que incluem identidade e metadados: estes são úteis para sincronização, mas inadequados para detectar o mesmo texto em URLs diferentes. A canonicalização e os hashes atuais devem continuar existindo; um índice de aliases e conteúdo compartilhado é uma camada adicional.

### Ordem proposta

1. **Antes da aquisição:** canonicalizar URL, remover apenas parâmetros comprovadamente de tracking e aplicar regras de paginação/facetas por site. Não remover parâmetros de SKU, loja, idioma ou variante indiscriminadamente. Sitemaps de produtos e páginas institucionais devem ter quotas/prioridades distintas conforme o objetivo da KB.
2. **Após a normalização, antes do enriquecimento e embeddings:** gerar uma representação de comparação versionada: Unicode NFC, finais de linha consistentes e espaços finais removidos. Preservar números, negações, unidades, tabelas, links relevantes e código. Gerar `contentKey = hash(normalizationRevision, comparisonMarkdown)` dentro do namespace/tenant autorizado. Duplicatas exatas reutilizam conteúdo e enriquecimento compatíveis; cada URL conserva sua proveniência.
3. **Filtrar interface repetida:** detectar blocos estruturais recorrentes em várias páginas, como navegação e `Quantidade`. Só remover blocos confirmados como interface; frequência isolada não basta, pois avisos legais e termos de produto podem ser informação relevante. Manter o Markdown original para auditoria. Nas amostras do Giassi, nome, volume/peso, marca e identidade do produto precisam permanecer, mesmo quando o template é igual.
4. **Chunks exatos:** usar o hash do conteúdo efetivamente enviado ao modelo, inclusive contexto de headings quando presente. Consultar cache persistente antes de gerar embeddings. A chave inclui provider/modelo/revisão/dimensões. Uma primeira etapa conservadora pode reutilizar embeddings e continuar gravando vetores por documento, preservando o contrato atual de upsert/delete; isso já reduz custo sem introduzir remoções compartilhadas.
5. **Semelhança aproximada:** usar shingles de tokens com MinHash/SimHash para selecionar candidatos, dentro do mesmo idioma, tipo de documento e tenant. Um limiar inicial conservador, por exemplo Jaccard ≥ 0,95, serve para revisão e calibração, não para exclusão automática. Comparar o texto útil e atributos de produto antes de unir. SKU/EAN, tamanho, sabor, preço, disponibilidade, código, negações ou datas diferentes podem representar informação distinta, mesmo com grande sobreposição.
6. **Conteúdo curto ou incompleto:** marcar `lowInformation` ou `needsRendering` e encaminhar para revisão/reextração; não descartá-lo apenas pelo tamanho. Os 65 arquivos Giassi com menos de 500 bytes motivam essa classificação, mas não provam falha de extração nem duplicação.

### Persistência, atualização e exclusão

Se futuramente houver um vetor único para várias URLs, persistir as relações `document → content → chunk → vector`, com conjunto de referências e controle de concorrência. Atualizar conteúdo é trocar referências apenas após gravações bem-sucedidas. Remover um documento retira sua referência; o conteúdo/vetor compartilhado só pode ser apagado quando não houver referências vivas e a reconciliação autorizar a exclusão. A operação deve ser idempotente e recuperável após falha.

Não compartilhar vetores entre tenants sem autorização explícita. Um crawl parcial do Giassi ou do GitHub não autoriza apagar aliases ou vetores de páginas que não foram revisitadas. Alterações de normalização, splitter, modelo ou projeção de metadados devem atualizar a revisão do pipeline; caches incompatíveis não podem ser reutilizados.

### Entrega e métricas propostas

1. Acrescentar um relatório de diagnóstico sem descartar conteúdo: aliases de URL, grupos exatos, candidatos aproximados, páginas de baixa informação e razões.
2. Habilitar cache de embeddings por conteúdo com vetores ainda pertencentes a cada documento.
3. Habilitar aliases de documentos exatos e, somente após validar referências/exclusões, vetores compartilhados.
4. Tratar semelhança aproximada inicialmente como recomendação; promover regras por site após revisão das diferenças.

Medir documentos antes/depois, grupos exatos, conteúdo exclusivo preservado, chamadas de enriquecimento/embedding evitadas, bytes úteis e referências por vetor. Nos casos Giassi, produtos diferentes devem permanecer recuperáveis; duas URLs do mesmo produto devem compartilhar o trabalho de conteúdo mantendo ambas as citações. A análise e as propostas deste documento não alteraram os arquivos em `kb/` nem reenviaram dados aos providers.
