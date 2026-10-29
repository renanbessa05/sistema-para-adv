# ADR 0006: orquestrador com ferramentas de leitura e Tool Runner do SDK

Data: 29/10/2026. Situação: aceita.

## Contexto
A Fase 1 chama o modelo em turno único com saída estruturada (classificador, roteador de intents). A Fase 2 precisa de conversa com várias idas e voltas em que o modelo consulta o banco (processos, publicações, prazos, documentos) antes de responder, com streaming no painel e PDF anexado. O escopo (1.3.6, 2.1) prevê "orquestrador com tool use; cada agente é uma ferramenta com entrada e saída tipadas". O SDK `@anthropic-ai/sdk` 1.3.0 traz `client.beta.messages.toolRunner` com `betaZodTool` (validação Zod da entrada da ferramenta, laço pronto, streaming).

## Decisão
`ClienteIa` ganha `conversar(pedido)`: recebe o histórico completo, uma lista de `FerramentaIa` (nome, descrição, schema Zod, `executar` que devolve texto) e devolve as novas mensagens, o texto final, o uso de tokens e o registro de cada chamada de ferramenta. Por baixo usa o Tool Runner com `stream: true`; a interface própria isola o beta, de modo que voltar a um laço manual é trocar um arquivo. `gerarEstruturado` passa a usar a API beta para aceitar `effort` e blocos `document`. Ferramentas só leem e usam o cliente do usuário (RLS); escrita continua pelas RPCs com eco e confirmação. `strict` é opt-in por ferramenta. `tool_choice` forçado não é usado (os modelos 5.5 rejeitam).

Toda chamada passa por `executarAgente` (`src/server/ia/executar.ts`), que aplica o teto mensal a qualquer agente (antes só a classificação checava) e grava `ia_execucoes` com contexto (conversa, stop_reason, effort, ferramentas chamadas).

## Consequências
Uma só implementação de laço para chat, minutas, revisor e julgador. O cliente falso ganha roteiros de conversa que executam as ferramentas reais contra o banco de teste, então os testes provam RLS e sigilo nas ferramentas sem chave. Custo: cada chamada de ferramenta é uma ida e volta ao modelo; o histórico é append-only e cresce, por isso o limite de 30 turnos por conversa e o cache do bloco de sistema.
