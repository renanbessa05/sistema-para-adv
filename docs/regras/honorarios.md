# Honorários e contratos: regras que o código implementa

Fonte: skill `contratacao-e-honorarios` do escritório (SKILL.md, `regras-honorarios.md`, `decisao-modalidade.md`, `tabela-oab-mt.md`). Código: `src/lib/honorarios/**` (puro, cálculo com cobertura 100%), `src/lib/docx/**` (documentos), `src/server/contratos.ts`, migrations 0028 a 0030.

## Fluxo (estados de `contratos`)

1. **rascunho** → a pessoa abre o caso com as duas perguntas da Etapa 0 (demanda em curso? qual polo?) e o relato. Estagiário pode abrir.
2. **aguardando_confirmacao** → a IA diagnosticou (`DiagnosticoHonorariosSchema`: objeto, natureza, fase, complexidade com justificativa, rubricas da tabela, proveito, tese, trabalho, pedidos, poderes, alertas, lacunas) e o código calculou. A IA **não** calcula, **não** escolhe modalidade e **não** redige.
3. **confirmado** → advogado ou sócio confirmou valor **e** modalidade (`contrato_confirmar_valor`). Parada obrigatória da skill. O código valida antes: nunca abaixo do piso (aviltamento), percentual acima de 30% sinaliza revisional, perto do teto do art. 50 sinaliza; "confirmar mesmo assim" fica registrado.
4. Documentos gerados (`.docx` com timbre): contrato, procuração e, se houver gratuidade e pessoa física, declaração de hipossuficiência. Qualquer `[[VERIFICAR: …]]` sobrevivente bloqueia o envio.
5. **aguardando_aprovacao** → `contrato_enviar_aprovacao` cria a linha em `aprovacoes` (objeto `contrato`). `decidir_aprovacao` aplica o efeito: aprovada → **aprovado**; rejeitada/ajustada → **rascunho** (ajustes gravados no diagnóstico).
6. **assinado** → `contrato_registrar_assinatura` (advogado/sócio) gera as parcelas (fixo parcelado: n parcelas no dia escolhido a partir da primeira; fixo e misto: parcela única na assinatura; êxito: nenhuma). A rotina `cobranca-parcelas` (11h UTC, dias úteis) marca `atrasada` e emite `parcela_vencida` para sócios e administrativo.

## Cálculo (três camadas, `calcularHonorarios`)

- **Piso OAB/MT**: soma dos mínimos das rubricas em URH × valor da URH vigente. Cautelar satisfativa: +50% na rubrica VIII.
- **Percentual**: maior percentual entre as rubricas × proveito econômico real (não o valor da causa por conveniência). Sem proveito apurável, as modalidades de êxito ficam indisponíveis.
- **Sugerido**: maior entre piso e percentual × fator de complexidade (`honorarios.fatores` em `escritorio_configuracoes`; padrão 1,0 / 1,3 / 1,6, **a calibrar com a advogada**).
- Modalidades calculadas: fixo (sugerido), êxito (percentual da rubrica ou 20%), misto (entrada = maior entre piso e 40% do sugerido; êxito = 75% do percentual, mínimo 10%), fixo parcelado (até 12 parcelas de ~1,5 URH, a partir de 3 URH).
- A matriz de `decisao-modalidade.md` virou `sugerirModalidade`: título formado + sem liquidez → êxito; proveito inestimável ou trabalho pontual → fixo (parcelado se fluxo sem caixa); tese incerta + trabalho longo → misto; proveito alto → misto; etc. A escolha final é sempre da advogada.
- Tabela com mais de 12 meses da vigência **bloqueia** o cálculo. A tabela do ano entra por Configurações → Honorários (sócio), copiando as rubricas; a fonte única dos múltiplos é `src/lib/honorarios/tabela-oab-mt.ts` (a migration 0028 é gerada dela).

## Documentos

- Qualificação do cliente idêntica nos três documentos (`qualificacaoCliente`).
- **Política antifraude** (item 11 das regras): no contrato, os contatos da CONTRATANTE são os do escritório; na declaração, nenhum contato; na procuração, a advogada escolhe (escritório, nenhum ou cliente).
- Declaração **não menciona honorários** e não é gerada para pessoa jurídica (Súmula 481/STJ).
- Cláusulas que não saem do contrato: cumulação com sucumbência (art. 23 do EOAB), destaque (art. 22, §4º), repasse em 5 dias úteis com multa de 10%, revogação/renúncia/desistência proporcionais, vedação de transigir sem anuência, despesas por conta do cliente, LGPD, exigibilidade condicionada ao ingresso patrimonial (êxito), teto do art. 50 (êxito).
- Timbre genérico a partir de `escritorios` + `escritorio_configuracoes['documentos.timbre']` (Configurações → Documentos). Modelos `.docx` próprios: lote 4.

## O que só a advogada decide

Fatores de complexidade, percentual-padrão de êxito (a skill cita 30% para título formado), abatimento ou não da entrada no misto, poderes específicos, contatos na procuração, gratuidade. O sistema calcula, sugere e registra; não decide.
