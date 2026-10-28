# Runbook: rotação de segredos

Quando: suspeita de vazamento, saída de quem tinha acesso, ou a cada 6 meses.

| Segredo | Onde gerar o novo | Onde trocar | Efeito colateral |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` / anon key | Supabase → Settings → API → rotate | Vercel (prod e preview), GitHub Actions se usado | Deploy novo na Vercel |
| `CRON_SECRET` | gerar string aleatória (`openssl rand -hex 32`) | Vercel | Deploy novo; crons passam a usar automaticamente |
| `ANTHROPIC_API_KEY` | platform.claude.com → API keys (criar nova, apagar antiga depois) | Vercel | Nenhum |
| `DATAJUD_API_KEY` | é pública; muda quando o CNJ decide (wiki) | Vercel | O job de enriquecimento avisa "chave inválida" quando mudar |
| `RESEND_API_KEY` | Resend → API keys | Vercel e SMTP do Supabase Auth | Nenhum |
| `WHATSAPP_ACCESS_TOKEN` | Meta Business → System Users → gerar token | Vercel | Nenhum, se o token antigo for revogado depois |
| `WHATSAPP_APP_SECRET` | Meta App → Settings → Basic → reset | Vercel | Webhooks assinados com o segredo antigo são rejeitados a partir da troca |
| `WHATSAPP_VERIFY_TOKEN` | inventar outra string | Vercel e no cadastro do webhook na Meta | Reverificar o webhook |

Depois de trocar: abrir `/admin/status` e esperar a próxima execução de cada rotina ficar verde; mandar "bom dia" ao WhatsApp e ver a resposta.
