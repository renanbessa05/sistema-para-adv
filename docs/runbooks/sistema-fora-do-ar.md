# Runbook: o sistema está fora do ar (ou com dúvida sobre um prazo)

Regra de ouro durante a operação paralela: **o PJe e o e-mail de intimação continuam sendo o controle oficial**. O sistema é apoio.

## Se o painel não abre ou está errado

1. Abra o CSV mais recente dos prazos. Ele chega todo dia útil às 18h no e-mail dos sócios (`Prazos exportados · AAAA-MM-DD`) e fica no bucket `exportacoes` do Supabase (Storage → exportacoes → pasta do escritório). Contém os prazos dos próximos 60 dias com data final, data interna e responsável.
2. Confira no PJe (painel do advogado → expedientes) tudo que venceria hoje e amanhã.
3. Avise a equipe pelo WhatsApp pessoal (não pelo número do sistema) que o painel está fora.
4. Verifique a causa, nesta ordem: `https://<app>.vercel.app/api/health` (se responde `db: erro`, o problema é no Supabase; se nem responde, Vercel); status.vercel.com; status.supabase.com; Rotinas no painel (`/admin/status`) quando voltar.
5. Quando voltar: rode a captação manualmente (`/api/jobs/captar-djen?janela=5` com o `CRON_SECRET`) para cobrir os dias perdidos e confira a caixa de publicações.

## Se a captação não rodou (alerta das 9h)

1. `/admin/status` mostra a última execução e o erro.
2. Erro 429 ou rede: espere 10 minutos e chame a rota de novo. Erro de chave do DataJud: pegue a chave nova na wiki do CNJ e atualize `DATAJUD_API_KEY` na Vercel.
3. Enquanto isso, confira o PJe e o e-mail manualmente e lance pelo painel (`/publicacoes/nova`) o que tiver prazo.

## Se um prazo parecer errado

1. Abra o prazo: a memória de contagem mostra cada dia e por que foi pulado.
2. Confira o calendário forense (Configurações → Calendário) para o período: faltou feriado ou suspensão? Cadastre e **recalcule confirmando com a data correta**; o sistema guarda a data sugerida e a confirmada.
3. Registre a divergência na reunião semanal (`docs/runbooks/operacao-paralela.md`).
