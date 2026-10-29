# ADR 0011: documentos .docx gerados no servidor a partir de Markdown, com timbre genérico

Data: 29/10/2026. Situação: aceita.

## Contexto
A skill de contratação manda "gerar .docx separado" por documento e os modelos do escritório estão em Markdown com marcadores `[[CAMPO]]`. Não há modelos `.docx` timbrados do escritório. A Vercel Hobby não comporta Chromium para converter HTML em PDF.

## Decisão
- Os modelos viram funções TypeScript que produzem **Markdown** (`src/lib/docx/modelos/*`): fácil de testar, de mostrar como prévia no painel e de converter. Dado faltante vira `[[VERIFICAR: campo]]`; `verificarMarcadores` bloqueia o envio para aprovação enquanto houver marcador.
- `markdownParaDocx` (pacote `docx`) converte o subconjunto usado (títulos, parágrafos justificados, negrito/itálico, listas, citações, separador, quebra de página) e aplica o timbre genérico (cabeçalho com razão social e CNPJ; rodapé com endereço, contatos e numeração) a partir de `escritorios` + `escritorio_configuracoes['documentos.timbre']`.
- O `.docx` é gravado no Storage pela mesma trilha dos uploads (`gravarDocumento`, bucket `documentos`, prefixo do escritório, auditoria de download).
- Leitura de `.docx` enviado pela pessoa (revisor, lote 5): `mammoth`. PDF gerado pelo servidor (memória de cálculo, lote 6): `pdf-lib`.
- Modelo `.docx` próprio do escritório (upload em Configurações → Modelos) substitui o timbre genérico no lote 4; a conversão Markdown → docx continua a mesma, só muda a seção de cabeçalho/rodapé.

## Consequências
Os testes conferem o texto final com `mammoth` (zero marcadores, qualificação idêntica, cláusulas obrigatórias presentes) sem abrir o Word. Formatação fina (tabelas complexas, fontes do escritório) fica para o modelo próprio.
