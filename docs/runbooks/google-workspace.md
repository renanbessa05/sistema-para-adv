# Runbook: ligar o Google Workspace (Agenda e Drive)

Estado atual: código do cliente Google (`src/lib/google`) pronto e testado com resposta falsa. Nada está ligado em produção. Este passo a passo serve para quando a conta do escritório existir.

## 1. Conta e projeto
1. Criar o projeto no Google Cloud com a conta do escritório.
2. Ativar as APIs Google Calendar e Google Drive.
3. Tela de consentimento OAuth: tipo externo, escopos `calendar.events` e `drive.file`. Enquanto estiver em teste, só as contas cadastradas entram.
4. Criar credencial OAuth (aplicativo web). URL de retorno: `https://sistema-para-adv.vercel.app/api/google/oauth/callback`.

## 2. Segredos
- `client_id` e `client_secret` entram em Configurações → Integrações (card Google), que grava o secret no Vault do escritório. Variáveis de fallback: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`.
- Nunca colar o secret no repositório nem no chat.

## 3. Ligar o código (ainda a fazer)
- Rotas `src/app/api/google/oauth/iniciar` e `callback`, usando `urlAutorizacao` e `trocarCodigo` de `src/lib/google/oauth.ts`.
- Refresh token por usuário no Vault (RPC própria, só service role lê).
- Job que cria o evento de cada audiência com `montarEventoAgenda` e `criarEventoAgenda`, gravando `google_event_id`.

## 4. Verificação
- Conectar a conta de um advogado de teste, criar audiência de teste, conferir o evento no calendário.
- Conferir que audiência sigilosa **não** é enviada ao calendário, ou que o evento sai sem o nome da parte (a decidir com a advogada).

## Pendências
- Verificação do app Google (OAuth em produção) pode levar semanas; sem ela, o consentimento fica restrito a usuários de teste.
- Drive: upload de minuta e contrato aprovados, não iniciado.
