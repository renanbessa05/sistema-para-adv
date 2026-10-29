# ADR 0010: documentos no Storage por prefixo, extração com unpdf e PDF enviado à API

Data: 29/10/2026. Situação: aceita.

## Contexto
Peças, contratos, autos e anexos precisam de um lugar privado por escritório, com texto pesquisável e legível pela IA. O escopo (2.3, migration 13 prevista) define `documentos` com hash, origem e bucket privado por escritório. O Postgres do CI não tem o schema `storage`, e a Vercel Hobby limita a função a 300 s.

## Decisão
- Bucket privado `documentos` (e o `exportacoes` já existente) criados por migration quando `storage.buckets` existe; caminho `<escritorio_id>/<processo|cliente|geral>/<uuid>.<ext>`; policy em `storage.objects` permite SELECT só no prefixo do escritório da sessão. Escrita e remoção só pela service role, depois de o servidor validar sessão, tipo e tamanho.
- Metadados em `public.documentos` (RLS por escritório + sigilo do processo) e texto por página em `documento_paginas` com `tsvector('portuguese')`. Download por URL assinada de 60 s, registrado em `auditoria_acessos` pela RPC `documento_registrar_acesso`.
- Extração de texto com `unpdf` (pdf.js empacotado, sem worker nativo) na rotina `extrair-texto` a cada 5 min, drenando a fila `extracao_documentos` em lotes pequenos. PDF escaneado fica marcado `sem_texto`.
- Para a API: PDF dentro de `IA_PDF_MAX_MB`/`IA_PDF_MAX_PAGINAS` vai inteiro (Files API com `file_id` guardado por 24 h, ou base64); acima, texto das páginas com inventário heurístico.
- Bibliotecas fixadas para os lotes seguintes: `docx` (gerar .docx), `mammoth` (ler .docx), `pdf-lib` (PDF da memória de cálculo e fixtures; o `@react-pdf/renderer` foi testado e falha ao resolver módulos ESM no Node 22 fora do bundler), `react-markdown` + `remark-gfm` (Markdown no painel), `unified` + `remark-parse` (Markdown → docx), `recharts` (gráficos), `jszip` (exportações LGPD).

## Consequências
OCR fica fora do plano (a IA ainda lê o PDF como imagem). Arquivos acima de 50 MB não entram (limite do Storage). A extração é assíncrona: a tela mostra "extraindo…" até a rotina passar.
