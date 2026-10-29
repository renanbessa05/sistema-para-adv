# Runbook: incidente

Usado quando o sistema falha, um job para ou há suspeita de vazamento. Vale para o operador (suporte) e para o sócio responsável.

## 1. Confirmar

- Abrir `/status` (público, só saúde agregada) e `/api/health`.
- No painel, sócio ou suporte abre `/admin/status`: alertas de rotina atrasada e último backup.
- Se a falha é de um escritório só, use a rota de suporte (`/admin/suporte`), não a de todos.

## 2. Registrar

- Inserir uma linha em `incidentes` (escrita pela service role, via SQL do Supabase): `titulo`, `severidade` (baixa, media, alta, critica), `status = 'aberto'`.
- Na descrição, **não** colar número de processo, nome de cliente, trecho de documento ou mensagem. Use o nome da rotina, o horário e o código de erro.

## 3. Conter

- Rotina com erro: corrigir a causa e disparar de novo pelo painel do Supabase/Vercel (a confirmar o procedimento de reexecução manual).
- Vazamento suspeito: tirar o acesso do usuário (desativar o membro) e trocar segredos conforme `docs/runbooks/rotacao-de-segredos.md`.

## 4. Comunicar

- Quem comunica: sócio responsável. Canal e prazo para avisar os titulares de dados: (a confirmar com o jurídico; LGPD exige comunicação à ANPD e aos titulares em prazo razoável, cujo valor não está definido neste repositório).

## 5. Encerrar

- Atualizar a linha: `status = 'resolvido'` e `resolvido_em` preenchido (a constraint do banco exige os dois juntos).
- Anotar a causa em `docs/proximos-passos.md` se virar pendência.
