# ADR 0007: jurisprudência com busca por texto e híbrida opcional (pgvector + Voyage)

Data: 29/10/2026. Situação: aceita.

## Contexto
A peça só pode citar precedente que tenha registro na base do escritório (regra do lote 7 e da validação de peças). Os dados abertos do STJ têm formato a confirmar, e a chave da Voyage (embeddings jurídicos) ainda não existe. O banco de teste (CI) pode não ter a extensão `vector`.

## Decisão
- Base em `ref.jurisprudencia` (registros) e `ref.jurisprudencia_chunks` (trechos com `tsvector` em português). Global, como as séries do BCB: leitura para autenticados, escrita só pela service role.
- Busca por texto (`buscar_jurisprudencia_texto`) sempre disponível.
- Busca híbrida (`buscar_jurisprudencia`, fusão RRF de FTS e similaridade) só é criada quando a extensão `vector` está instalada. A coluna `embedding vector(1024)` idem. O código tenta a híbrida e cai para texto em qualquer falha.
- Embeddings da Voyage (`voyage-law-2`, 1024 dimensões) via integração `embeddings`: a chave vem do Vault do escritório ou de `VOYAGE_API_KEY`. Sem chave, o job não chama a API e a busca segue por texto.
- Chunk sem embedding é a fila: o job `gerar-embeddings` (a cada 10 min) processa lotes de 64.
- A citação na peça é validada por `conferirCitacoes`: só vale o que casa com um id devolvido pela busca. Id é a referência completa (ex.: `Súmula 7/STJ`); a citação numerada no texto (ex.: `Súmula 7`) casa por prefixo de sufixo, sem confundir `Súmula 7` com `Súmula 70`.
- Importação manual por CSV ou JSON (`src/lib/jurisprudencia/importar.ts`). A importação automática dos dados abertos do STJ fica para quando o formato for confirmado.

## Consequências
Sem pgvector ou sem chave, a qualidade da busca cai (sem sinônimos semânticos), mas nada quebra e a validação continua valendo. Reimportar um registro troca os trechos e zera os embeddings dele. Antes de ligar a Voyage: confirmar termos e retenção do provedor em `docs/lgpd/fornecedores.md` e avaliar a qualidade com as consultas de referência do escritório.
