# Colocar no ar: Supabase, Vercel, Meta e Resend

Passo a passo para a primeira implantação (projeto `prod`) e para o ambiente `dev`. Tudo que exige conta é feito pela dona do projeto; o Claude Code não tem acesso a essas contas.

## 1. Supabase (banco, auth, storage)

1. Criar dois projetos (dev e prod) em https://supabase.com/dashboard, região **South America (São Paulo)**, plano Pro no prod (backup diário; o Free pausa após 7 dias).
2. Aplicar as migrations: `supabase login`, `supabase link --project-ref <ref>`, `supabase db push`. Alternativa sem CLI: `DATABASE_URL=<connection string> pnpm db:migrar`.
3. **Authentication → Hooks → Customize Access Token (JWT) Claims**: ativar e apontar para `public.custom_access_token_hook`. Sem isso o JWT não traz `escritorio_id` e todo mundo cai em "sem escritório".
4. **Authentication → Providers → Email**: deixar "Confirm email" desligado para convites; **Sign-ups desabilitados** (`enable_signup = false`): só entra quem for convidado.
5. **Authentication → SMTP**: configurar a Resend (host `smtp.resend.com`, porta 465, usuário `resend`, senha = API key, remetente = `EMAIL_REMETENTE`). O SMTP padrão do Supabase limita a poucos e-mails por hora.
6. **Authentication → URL Configuration**: Site URL = `https://<app>.vercel.app`; Redirect URLs = `https://<app>.vercel.app/auth/callback` e o preview `https://*.vercel.app/auth/callback`.
7. **Storage**: os buckets `exportacoes` e `documentos` são criados pelo código na primeira vez (privados).
8. Pegar em Settings → API Keys: `NEXT_PUBLIC_SUPABASE_URL`, a chave **publishable** (`sb_publishable_…`, vai em `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) e a chave **secret** (`sb_secret_…`, vai em `SUPABASE_SECRET_KEY`; só no servidor). Os nomes antigos anon/service role também funcionam.

## 2. Primeiro escritório e primeira usuária

Com o SQL Editor do projeto (ou `psql`), uma vez:

```sql
insert into public.escritorios (nome, razao_social, cnpj) values ('Costa Abdo Advocacia', 'Razão social', 'CNPJ') returning id;
insert into public.escritorio_membros (escritorio_id, email_convite, papel, nome_completo, oab_numero, oab_uf)
values ('<id do escritório>', 'bruna@...', 'socio', 'Bruna Costa Abdo', '20817', 'MT');
```

Depois, em Authentication → Users → **Invite user** com o mesmo e-mail. Ao aceitar o convite, a trigger vincula o membro e o hook grava os claims. Os demais membros são convidados pela tela Configurações → Equipe.

## 3. Vercel

1. Importar o repositório; framework Next.js; plano **Pro** (uso comercial e crons por minuto).
2. Variáveis de ambiente (Production = prod; Preview = dev), copiando de `.env.example`: Supabase, `CRON_SECRET` (string aleatória longa), `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_REMETENTE`, `APP_URL`, e as do WhatsApp quando existirem. A chave do DataJud (`DATAJUD_API_KEY`) e o token do WhatsApp (`WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`) **podem ficar fora da Vercel**: o sócio grava pelo painel em Configurações → Integrações, que guarda no Supabase Vault por escritório. Se definidas na Vercel, essas variáveis seguem valendo como fallback enquanto não houver segredo no Vault (ver `docs/runbooks/rotacao-de-segredos.md`).
3. Settings → Functions → região `gru1` (São Paulo) já vem de `vercel.json`.
4. Os crons de `vercel.json` passam a rodar após o primeiro deploy de produção. A Vercel envia `Authorization: Bearer <CRON_SECRET>` em cada chamada.
5. Conferir: `https://<app>.vercel.app/api/health` responde `{"status":"ok","db":"ok"}`.

## 4. Resend (e-mail)

Criar conta, verificar o domínio do escritório (registros DNS), criar API key. `EMAIL_REMETENTE` = `Assistente Jurídica <assistente@seudominio.adv.br>`.

## 5. WhatsApp Cloud API (Meta)

1. https://developers.facebook.com → criar app do tipo Business → adicionar o produto WhatsApp.
2. Business Manager: **verificar a empresa** (CNPJ, documentos). Sem isso o limite é de 250 destinatários por dia (suficiente para a equipe, mas a verificação destrava o resto).
3. Número: um número novo, que nunca esteve no WhatsApp comum. Registrar com PIN de duas etapas.
4. Token permanente: criar um **System User** no Business Manager com as permissões `whatsapp_business_messaging` e `whatsapp_business_management` e gerar o token. O *phone number ID* está na página do número. Os dois vão para o painel: **Configurações → Integrações → WhatsApp** (o token fica no Vault; só sócio acessa). Alternativa de transição: `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` na Vercel, usados só enquanto não houver segredo no Vault. `WHATSAPP_APP_SECRET` (App settings → Basic) e `WHATSAPP_VERIFY_TOKEN` continuam na Vercel: são do app, não do escritório.
5. Webhook: URL `https://<app>.vercel.app/api/whatsapp/webhook`, verify token = `WHATSAPP_VERIFY_TOKEN` (string que você inventa). Assinar o campo `messages`.
6. Templates: criar em WhatsApp Manager → Message templates os cinco de `src/lib/whatsapp/templates.ts` (categoria Utility, idioma pt_BR) com o texto sugerido em `DEFINICOES_TEMPLATES`; depois de aprovados, copiar o texto final de volta para o código se a Meta pedir alterações. Até a aprovação, só respostas dentro da janela de 24 h funcionam.
7. Cada pessoa da equipe cadastra o próprio telefone em Configurações → Equipe, gera o código e o digita no WhatsApp do escritório. Isso é o opt-in.

## 6. Claude API

Criar chave em https://platform.claude.com, definir limite de gasto mensal na conta e `IA_TETO_MENSAL_USD` no app (o job de classificação pausa ao atingir). Antes de ir ao ar com dados de clientes: ler os Termos Comerciais e o DPA, e registrar em `docs/lgpd/fornecedores.md` a base da transferência internacional (ver escopo, 1.3.7).

## 7. Rede do ambiente do Claude Code (para testar daqui)

Liberar nos domínios permitidos do ambiente: `comunicaapi.pje.jus.br`, `api-publica.datajud.cnj.jus.br`, `datajud-wiki.cnj.jus.br`, `graph.facebook.com`, `api.resend.com`, `api.anthropic.com`, `*.supabase.co`, `vercel.com`.
