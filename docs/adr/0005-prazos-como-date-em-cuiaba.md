# ADR 0005: prazos como `date`, fuso America/Cuiaba, motor em código puro

Data: 28/10/2026. Situação: aceita.

## Contexto
Vercel, Supabase e cron rodam em UTC. Mato Grosso usa UTC-4 sem horário de verão. Um prazo tratado como timestamp em UTC "vence" às 20h do dia anterior em Cuiabá. O ato eletrônico vale até 23h59min59s do último dia no horário local do juízo.

## Decisão
- Prazos são `date` no banco e strings `YYYY-MM-DD` no código. Eventos (criado em, confirmado em) são `timestamptz`.
- Cada escritório tem `timezone` (padrão America/Cuiaba). "Hoje", "amanhã" e "semana" são calculados no fuso do escritório por uma única função `hojeNoFuso`.
- O motor de prazos (`src/lib/prazos`) é TypeScript puro, sem Next e sem banco: recebe data de disponibilização, calendário (lista de dias sem expediente por tribunal e comarca), ato (quantidade, contagem, multiplicador) e devolve data de publicação, início, data final, dias pulados com motivo e avisos. Cobertura de 100% exigida no CI. Casos reais contados pela advogada são a fixture de referência.
- Crons são escritos em UTC com deslocamento fixo de 4 h.

## Consequências
O cálculo é auditável linha a linha na tela de confirmação. A regra legal fica num só lugar, testável sem banco. Quando faltar calendário do ano ou da comarca, o motor devolve aviso e o prazo nasce marcado "calendário incompleto".
