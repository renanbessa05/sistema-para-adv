# ADR 0013: audiências no banco e Google desligado até a conta existir

Data: 29/10/2026. Situação: aceita.

## Contexto
O escritório precisa ver as audiências na tela e ser avisado na véspera. O plano previa também sincronizar com Google Agenda e Drive, mas a conta Google do escritório ainda não existe e não há credencial OAuth. Forçar a integração agora travaria o que já funciona.

## Decisão
- `public.audiencias` é a fonte da verdade. Escrita pelo usuário (advogado ou sócio, com MFA), leitura por RLS com sigilo pelo processo, igual aos cálculos.
- O alerta de véspera é o evento `audiencia_d1` (enum em migration própria, 0037), enfileirado pelo job `alertas-audiencia` às 11h UTC em dias úteis (08h em Cuiabá). Destinatário: responsável e sócios, por painel e WhatsApp.
- O cliente da Google Agenda e o fluxo OAuth ficam em `src/lib/google` com `fetch` injetado e testados com resposta falsa. Nenhuma rota de OAuth nem job de sincronização foi ligado: isso depende da conta, das credenciais no Vault e das URLs de retorno cadastradas no Google.
- Drive (upload de minuta e contrato aprovados) segue fora deste lote.

## Consequências
Sem conta Google, a agenda continua só no sistema e os alertas funcionam normalmente. Quando a conta existir, falta: rotas `api/google/oauth/{iniciar,callback}`, armazenamento do refresh token no Vault, coluna `google_event_id` já existe em `audiencias` para a sincronização, e o job que cria o evento. O passo a passo está em `docs/runbooks/google-workspace.md`.
