# Regra de contagem de prazos (TJ-MT, processo civil)

Esta é a regra que o motor `src/lib/prazos` implementa. Toda mudança aqui exige mudança no código e nos testes, e vice-versa. A advogada aprova os exemplos antes de o sistema sugerir qualquer prazo.

## 1. Datas que o sistema guarda para cada prazo

| Data | Como é obtida | Fundamento |
|---|---|---|
| Disponibilização | Vem da API do DJEN (`data_disponibilizacao`) | Lei 11.419/2006, art. 4º, §3º |
| Publicação | 1º dia útil seguinte à disponibilização | Lei 11.419/2006, art. 4º, §3º; CPC art. 224, §2º |
| Início da contagem (dia 1) | 1º dia útil seguinte à publicação | Lei 11.419/2006, art. 4º, §4º; CPC art. 224, §3º; art. 231, VII |
| Data final | Último dia contado, protraído para o 1º dia útil seguinte se cair em dia sem expediente | CPC art. 224, caput e §1º |
| Data interna | Data final menos N dias úteis de segurança (padrão 2, configurável por ato) | Regra do escritório |

Desde 16/05/2025 a publicação no DJEN é o que vale para a contagem quando a lei não exige intimação pessoal; comunicação concomitante por outro meio tem valor só informativo (Res. CNJ 455/2022, art. 11, §3º, com a redação da Res. 569/2024). Se o sistema souber de intimação anterior pelo portal, sugere a data mais conservadora e avisa (STJ, Tema 1.180, pendente).

## 2. O que conta e o que não conta

- **Dias úteis** (CPC art. 219): só para prazos processuais. Não contam: sábado, domingo, feriado nacional, estadual, municipal da comarca do processo, ponto facultativo e suspensão declarada pelo tribunal (no TJ-MT, a Portaria anual do calendário forense suspende expediente e prazos nesses dias), e o recesso de 20/12 a 20/01 (CPC art. 220).
- **Dias corridos processuais**: todo dia conta, inclusive fim de semana e feriado; o recesso e as suspensões declaradas pausam a contagem. Vencimento em dia sem expediente é protraído.
- **Dias corridos materiais** (prescrição, decadência, obrigações contratuais): contagem civil pura, sem pausa e sem protração. O sistema só lembra; não é prazo processual.
- **Horas**: convertidas em dias civis (24 h = 1 dia) com aviso para conferir a hora-limite no ato.
- **Dia com expediente reduzido que não suspende prazo**: conta normalmente; se o vencimento cair nele, é protraído (CPC art. 224, §1º).
- **Feriado municipal**: só suspende na comarca do processo. Sem comarca cadastrada, o motor avisa "feriados municipais não aplicados" e o prazo nasce marcado "calendário incompleto".
- **Ano sem calendário forense carregado**: o motor avisa e marca "calendário incompleto". Prazo com essa marca não pode ser confirmado sem a advogada reconhecer o aviso.

## 3. Prazo em dobro

- Ministério Público, Fazenda Pública e Defensoria: dobro a partir da intimação pessoal (CPC arts. 180, 183 e 186), salvo prazo próprio fixado em lei (art. 183, §2º).
- Litisconsortes com advogados de escritórios distintos: o dobro **não se aplica a autos eletrônicos** (CPC art. 229, §2º). Como o TJ-MT está no PJe, o sistema nunca sugere esse dobro.
- O multiplicador é sugerido pelo classificador e sempre editável antes da confirmação.

## 4. Prazos padrão por ato (editáveis em Configurações → Atos)

| Ato | Prazo | Contagem | Fundamento |
|---|---|---|---|
| Contestação | 15 | dias úteis | CPC art. 335 |
| Réplica (impugnação à contestação) | 15 | dias úteis | CPC arts. 350 e 351 |
| Manifestação genérica sem prazo no despacho | 5 | dias úteis | CPC art. 218, §3º |
| Embargos de declaração | 5 | dias úteis | CPC art. 1.023 |
| Apelação, agravo de instrumento, agravo interno, recurso especial e extraordinário, contrarrazões | 15 | dias úteis | CPC art. 1.003, §5º |
| Impugnação ao cumprimento de sentença | 15 | dias úteis | CPC art. 525 |
| Embargos à execução | 15 | dias úteis | CPC art. 915 |
| Cumprimento voluntário da sentença (pagar) | 15 | dias úteis | CPC art. 523 |
| Especificação de provas, rol de testemunhas, documentos | conforme o despacho | dias úteis | CPC art. 357, §4º |
| Juizados Especiais (TJ-MT) | não sugerido no MVP; contagem manual | | Lei 9.099/95, art. 12-A (a confirmar) |

## 5. Exemplos resolvidos (calendário de teste 2026/2027, comarca de Cuiabá)

Os casos abaixo estão em `tests/fixtures/prazos-casos.json` e rodam no CI. A advogada confere cada um.

1. **Contestação, 15 dias úteis, disponibilizada sexta 06/03/2026.** Publicação segunda 09/03; dia 1 terça 10/03; final segunda **30/03/2026**; data interna 26/03. Nenhum feriado no período.
2. **Fazenda Pública em dobro (30 dias úteis), mesma disponibilização.** Pula Sexta-feira Santa (03/04), aniversário de Cuiabá (08/04, só na comarca) e Tiradentes (21/04). Final quinta **23/04/2026**. Sem comarca cadastrada o 08/04 contaria e o final seria 22/04, com aviso de calendário incompleto.
3. **Réplica, 15 dias úteis, disponibilizada terça 15/12/2026.** Publicação 16/12; dia 1 17/12; dia 2 18/12; recesso de 20/12 a 20/01 pausa; retoma 21/01/2027; pula Carnaval (08 e 09/02/2027) e Cinzas (10/02); final quinta **11/02/2027**. Se o calendário de 2027 não estiver carregado, o motor calcula 08/02 e marca calendário incompleto.
4. **5 dias corridos processuais, publicação 16/12/2026.** Dia 1 17/12, dia 2 18/12, dia 3 sábado 19/12 (conta), recesso pausa, dia 4 21/01/2027, dia 5 sexta **22/01/2027**.
5. **Prazo material de 30 dias corridos, ciência 16/12/2026.** Corre no recesso: final sexta **15/01/2027**. Material de 3 dias com ciência quinta 05/03/2026 vence domingo **08/03/2026** sem protração; o mesmo prazo, se processual, vai para segunda **09/03/2026**.
6. **48 horas, publicação segunda 09/03/2026.** Dia 1 10/03, dia 2 11/03; final **11/03/2026**, com aviso para conferir a hora-limite.
7. **Disponibilização quinta 02/04/2026 (véspera da Sexta-feira Santa).** Publicação só na segunda 06/04; dia 1 terça 07/04.

## 6. Fontes

CPC (Lei 13.105/2015): https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm. Lei 11.419/2006: https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2006/lei/l11419.htm. Res. CNJ 455/2022 e 569/2024: https://atos.cnj.jus.br/atos/detalhar/4509. Calendário forense 2026 do TJ-MT: Portaria TJMT/PRES 1915/2025 (ver `docs/runbooks/calendario-forense-anual.md`).
