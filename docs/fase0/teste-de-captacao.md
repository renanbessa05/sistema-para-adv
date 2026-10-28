# Protocolo do teste de captação (Fase 0, 10 dias úteis)

Objetivo: provar que tudo que o escritório recebe de intimação a advogado aparece no sistema até as 9h do dia útil seguinte à disponibilização no DJEN, e classificar o que não aparece.

## Antes de começar

- Todos os advogados com OAB/UF cadastrados em Configurações → Equipe (nome completo e nomes alternativos como aparecem nas publicações).
- Carteira importada (`/processos/importar`), com comarca e responsável.
- Captação rodando (ver `/admin/status`: `captar-djen` verde às 6h, 7h e 8h).

## Todo dia útil, até as 18h (administrativo)

Registrar na planilha compartilhada `teste-captacao-AAAA-MM.csv` (separador `;`), uma linha por intimação vista no **PJe** (painel do advogado → expedientes) e no **e-mail**:

| coluna | conteúdo |
|---|---|
| data_vista | dia em que foi vista (AAAA-MM-DD) |
| numero_cnj | número do processo (20 dígitos ou com máscara) |
| meio | `pje_expediente`, `email` ou `djen_manual` |
| tipo | intimação, citação, despacho, sentença, outro |
| data_disponibilizacao | data que aparece no PJe/e-mail (AAAA-MM-DD) |
| observacao | livre |

## Toda manhã (sistema)

`pnpm tsx scripts/teste-captacao-cruzar.ts --planilha teste-captacao-2026-11.csv --de 2026-11-03 --ate 2026-11-14` cruza a planilha com `publicacoes` (via `DATABASE_URL`) e imprime três grupos:

- **ambos**: vista no PJe/e-mail e captada no DJEN (com a latência em horas entre disponibilização e captação);
- **só DJEN**: captada, mas ninguém viu no PJe/e-mail (normal: o DJEN é a fonte oficial);
- **só PJe/e-mail**: vista, mas não captada. Cada uma precisa de uma causa: publicação sem o nome/OAB do advogado (corrigir o cadastro do advogado no processo, no PJe); intimação pessoal (não é do advogado); erro de captação (abrir issue).

## Critério de passagem

- 100% das intimações a advogado que saíram no DJEN foram captadas até as 9h do dia útil seguinte.
- 100% das "só PJe/e-mail" explicadas e com ação registrada.
- Nenhuma duplicata sem marcação.
- Classificador com tipo de ato correto em ao menos 85% (a advogada rotula a planilha de classificação que o script `scripts/exportar-classificacoes.ts` gera; esse rótulo vira `tests/fixtures/publicacoes-rotuladas.json`).
