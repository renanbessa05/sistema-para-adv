# ADR 0016: atendimento ao cliente pelo WhatsApp com envio desligado e aprovação obrigatória

Data: 29/10/2026. Status: aceita.

## Contexto

O escritório quer que clientes consultem o andamento e façam pedidos pelo WhatsApp. Hoje o WhatsApp atende só a equipe. Falta a conta da Cloud API com templates aprovados pela Meta, e nenhum texto jurídico ou horário pode ser inventado.

## Decisão

1. Envio ao cliente vem desligado. O escritório liga em Configurações, com horário e dias informados por ele. O banco não aceita ligar sem horário.
2. Toda mensagem a cliente nasce em rascunho ou em resposta fixa, e sai pela fila `mensagens_cliente`. Resposta livre da IA só segue depois de aprovação em `aprovacoes` (objeto `mensagem_cliente`).
3. A decisão de envio é uma função pura (`decidirEnvio`) conferida na entrada, na aprovação e no job.
4. Leitura de andamento sai só por template fixo com a data da última movimentação. A IA não recebe dados de processo.
5. Templates e textos ficam marcados `(a confirmar: aprovação do template na Meta)` até a aprovação.
6. Reuso do que já existe: fila Postgres (`fila_mensagens`, migration 0012), efeito de aprovação (migration 0024), rotinas pg_cron (migration 0023), notificações (`cliente_pediu_contato`).

## Consequências

- Nada sai para cliente até a conta da Meta e os templates existirem e o escritório ligar o envio. Isso é deliberado.
- Mensagens bloqueadas ficam registradas com o motivo, então a equipe vê o que foi retido.
- Testes de banco (`supabase/tests/atendimento.test.ts`) estão escritos e precisam ser rodados para confirmar a RLS e o efeito da aprovação.
- A verificação do número depende de a equipe entregar o código ao cliente.
