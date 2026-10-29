# ADR 0012: chat da assistente com streaming por Route Handler (SSE)

Data: 29/10/2026. Situação: aceita.

## Contexto
O chat `/assistente` precisa mostrar o texto conforme o modelo escreve e avisar quais ferramentas estão sendo consultadas. Server Actions devolvem um valor único ao fim; não transmitem. A conversa é longa (ferramentas em sequência) e a Vercel Hobby limita a função a 300 s.

## Decisão
`POST /api/assistente/[conversaId]` é um Route Handler que valida a sessão por cookies (`obterSessao`), chama `enviarMensagem` e devolve `text/event-stream` com eventos `texto` (delta), `ferramenta` (nome e fase), `confirmacao` (eco de ação de escrita), `fim` e `erro`. O componente cliente (`chat.tsx`) lê o corpo com `ReadableStream` e renderiza Markdown com `react-markdown` (sem HTML cru). O servidor grava a resposta final e os blocos do assistente antes de emitir `fim`, então recarregar a página mostra o histórico completo.

Escrita (reatribuir, concluir, confirmar) segue o padrão do WhatsApp: eco guardado em `conversas.estado_assistente`, confirmação com "sim", execução pelas RPCs com o cliente do usuário. Pedidos de produção (peça, contrato, cálculo, jurisprudência) devolvem o link da tela do agente.

## Consequências
Uma rota por conversa, sem WebSocket. O `maxDuration` de 300 s cobre até 8 idas e voltas de ferramenta; acima disso a conversa é cortada com `max_iterations`. Conversas com mais de 30 turnos pedem continuação em nova conversa com resumo, para conter o histórico append-only.
