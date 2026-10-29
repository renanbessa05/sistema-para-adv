# Atendimento ao cliente por WhatsApp (regra)

Lote 14. Código: `src/lib/whatsapp/atendimento.ts` (regras puras), `src/lib/whatsapp/templates-cliente.ts` (textos), `src/lib/ia/atendimento-cliente.ts` (roteador e rascunho), `src/server/atendimento-cliente.ts` (casos de uso e job). Banco: migrations `20261029000051` e `20261029000052`.

## Estado de envio

- **Desligado por padrão.** Sem linha em `regras_atendimento` ou com `envio_ativo = false`, nada sai para cliente. Mensagens bloqueadas ficam em `mensagens` com `status_entrega = 'falhou'` e o motivo em `erro`.
- Ligar exige horário de início e fim e pelo menos um dia (constraint no banco). O sistema não sugere horário: o escritório informa em Configurações → Atendimento.
- Enquanto o template da Meta não estiver aprovado, o envio fora da janela de 24 h não sai. Textos de template trazem a marca `(a confirmar: aprovação do template na Meta)`.

## Quem pode receber

Uma mensagem a cliente só sai se, no momento do envio, valerem todas as condições (`decidirEnvio`, na ordem):

1. processo do caso não está em segredo de justiça;
2. o escritório ligou o envio;
3. o contato está confirmado (código digitado pelo próprio cliente);
4. o cliente não pediu para sair (`opt_out_em` nulo);
5. o advogado registrou a autorização (`opt_in_em`).

O consentimento é conferido de novo na aprovação (migration 0052, efeito) e no job, não só na entrada.

## Respostas

- **Automáticas** (identificação, horário, andamento, pedido de contato): texto fixo, sempre começando por "Sou a assistente virtual (IA) do escritório ...".
- **Andamento de processo**: só a data da última movimentação, por template fixo. Sem número, sem conteúdo, sem movimento. Processo sigiloso recebe aviso genérico.
- **Resposta livre da IA**: o modelo recebe só o nome do escritório e a mensagem do cliente, nunca dados de processo. O texto nasce em rascunho (`mensagens` sem `status_entrega`, com `aprovacao_id`) e segue o fluxo de `aprovacoes` (objeto `mensagem_cliente`). Só a aprovação ou o ajuste aprovado põe o texto na fila `mensagens_cliente`.
- **Pedido de falar com advogado**: cria tarefa (`contato_cliente`, origem WhatsApp) e notificação `cliente_pediu_contato` para responsável e sócios. Nenhuma resposta livre é enviada.
- **Descadastro** ("sair", "parar", "cancelar"): registra `opt_out_em` e não responde.
- **Horário**: fora da faixa configurada, só o aviso de recebimento. Sem horário configurado, o texto não promete hora.

## Dados fora de escopo

- Número de cliente em mais de um cliente ou escritório é ambíguo: o sistema não responde.
- Mais de 10 mensagens de um cliente por hora: silêncio (proteção de ritmo).

## Acesso

- Contatos (`clientes_contatos`): só advogado e sócio, com MFA. Verificação e consentimento passam por RPC.
- Regras (`regras_atendimento`): leitura para advogado e sócio, alteração só sócio.
- Conversas e mensagens de cliente: advogado e sócio leem; só o sistema (service role) escreve.

## Job

`enviar-mensagens-cliente`, a cada 5 minutos (pg_cron, `app.chamar_rotina`). Consome `fila_mensagens` com `fila = 'mensagens_cliente'`, revalida envio e consentimento e manda texto (dentro da janela de 24 h) ou template (fora dela). Falha reagenda com 15 min de atraso; na última tentativa, a mensagem fica `falhou`.

## Pendências

- Conta e aprovação dos templates na Meta (`resposta_escritorio` e demais textos): sem elas, o envio fora da janela de 24 h não funciona.
- Código de verificação é entregue ao cliente pela equipe (fora do sistema); o cliente digita no WhatsApp do escritório.
- Testes de banco em `supabase/tests/atendimento.test.ts` estão escritos e não foram executados nesta entrega.
