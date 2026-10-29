# Runbook: rotação de segredos

Quando: suspeita de vazamento, saída de quem tinha acesso, ou a cada 6 meses.

| Segredo | Onde gerar o novo | Onde trocar | Efeito colateral |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` / anon key | Supabase → Settings → API → rotate | Vercel (prod e preview), GitHub Actions se usado | Deploy novo na Vercel |
| `CRON_SECRET` | gerar string aleatória (`openssl rand -hex 32`) | Vercel | Deploy novo; crons passam a usar automaticamente |
| `ANTHROPIC_API_KEY` | platform.claude.com → API keys (criar nova, apagar antiga depois) | Vercel | Nenhum |
| Chave do DataJud (`DATAJUD_API_KEY`) | é pública; muda quando o CNJ decide (wiki) | **Painel → Configurações → Integrações** (Vault). A variável da Vercel é só fallback | O job de enriquecimento registra "chave inválida" na integração e na tela quando mudar |
| `RESEND_API_KEY` | Resend → API keys | Vercel e SMTP do Supabase Auth | Nenhum |
| Token do WhatsApp (`WHATSAPP_ACCESS_TOKEN`) | Meta Business → System Users → gerar token | **Painel → Configurações → Integrações** (Vault). A variável da Vercel é só fallback | Nenhum, se o token antigo for revogado depois |
| `WHATSAPP_APP_SECRET` | Meta App → Settings → Basic → reset | Vercel | Webhooks assinados com o segredo antigo são rejeitados a partir da troca |
| `WHATSAPP_VERIFY_TOKEN` | inventar outra string | Vercel e no cadastro do webhook na Meta | Reverificar o webhook |

Depois de trocar: abrir `/admin/status` e esperar a próxima execução de cada rotina ficar verde; mandar "bom dia" ao WhatsApp e ver a resposta.

## Segredos de integração pela tela (Vault)

Token do WhatsApp e chave do DataJud ficam no Supabase Vault, por escritório, e não na Vercel. Quem faz é um **sócio**, em **Configurações → Integrações** (`/configuracoes/integracoes`):

1. Gerar o valor novo na origem (Meta ou wiki do CNJ).
2. No cartão da integração, colar o valor no campo de segredo (tipo senha; o valor gravado nunca é exibido de volta). No WhatsApp, conferir também o *phone number ID*.
3. **Salvar no Vault.** A RPC `integracao_definir_segredo` grava no Vault com o nome `integracao:<escritorio_id>:<tipo>`; na rotação o mesmo registro é atualizado (a referência `vault_secret_id` não muda), o status volta a `ativa` e `ultimo_erro` é limpo.
4. Esperar a próxima execução do job (`enriquecer-datajud`, `drenar-notificacoes`) ficar verde em `/admin/status`. O cartão mostra `atualizado_em`, a origem em uso (Vault / variável de ambiente / nenhum) e o último erro registrado pelo job.
5. Revogar o valor antigo na origem.

**Remover do Vault** apaga o segredo e deixa a integração `inativa`; se ainda existir a variável de ambiente na Vercel, ela volta a valer (a tela mostra "segredo: variável de ambiente").

Como os jobs leem: `src/server/integracoes.ts` chama a RPC `segredo_integracao` (só service role) e, se vier `null`, usa a variável de ambiente correspondente (`DATAJUD_API_KEY`, `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`). A regra de escolha é pura e testada em `src/lib/integracoes/segredos.ts`. Quando o DataJud devolve 401/403, o job chama `integracao_registrar_erro` e a tela passa a mostrar status `erro`.

Checagem de que nenhum segredo está em coluna texto (banco de dev, como service role):

```sql
select count(*) from public.integracoes i where i::text ilike '%EAAB%' or i::text ilike '%APIKey%'; -- deve ser 0
select name, created_at, updated_at from vault.secrets where name like 'integracao:%'; -- só nomes, nunca o valor
```

Sem o Vault habilitado no projeto Supabase (extensão `supabase_vault`), a tela recusa gravar com "Vault indisponível neste banco" e as variáveis de ambiente continuam valendo.
