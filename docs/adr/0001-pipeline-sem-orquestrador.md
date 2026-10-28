# ADR 0001: MVP como pipeline, sem orquestrador de agentes

Data: 28/10/2026. Situação: aceita.

## Contexto
O documento de concepção desenha uma assistente central que aciona oito agentes especialistas por tool use já no MVP. O valor do MVP é não perder prazo: captar publicações, sugerir o prazo certo, criar a tarefa e avisar a pessoa certa.

## Decisão
O MVP é um pipeline determinístico: captar (DJEN) → classificar (uma chamada ao modelo barato com saída estruturada) → calcular (motor de prazos em código puro) → confirmar (humano) → criar tarefa → notificar. O WhatsApp usa um roteador com lista fechada de intents; toda escrita exige eco e confirmação. O modelo nunca executa ações: propõe, e o código grava após confirmação.

O orquestrador com tool use e os agentes de peças, revisão, jurisprudência e cálculos entram na Fase 2.

## Consequências
Menos custo, menos latência e menos superfície de erro no caminho crítico. O classificador e o roteador têm conjunto de regressão rotulado pela advogada. A Fase 2 reaproveita o pipeline como ferramentas de leitura do orquestrador.
