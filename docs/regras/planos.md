# Planos, limites e onboarding

Regra de produto e de implementação do lote 13 (ADR 0014). Valores comerciais estão **a confirmar**.

## Planos

- Catálogo global em `ref.planos` (código, nome, limite de usuários, limite de processos). Nenhum plano vem semeado: nomes e valores são comerciais e **(a confirmar)**.
- Assinatura do escritório em `assinaturas`: uma ativa por escritório (índice único parcial). Status `ativa`, `suspensa` ou `encerrada`; fim opcional.
- Override por escritório em `escritorio_limites`. Valor null significa herdar do plano.
- Escrita em planos, assinaturas e limites é só da service role (operação da plataforma). Leitura: só sócio.

## Limites

- `app.limite(escritorio, 'usuarios' | 'processos')` devolve o override, senão o limite da assinatura ativa vigente, senão **null (sem limite)**.
- Gatilho em `escritorio_membros` (ao inserir ou reativar membro ativo) e em `processos` (ao inserir). Quando o limite existe e foi atingido, o banco recusa com código 53400.
- Lógica pura em `src/lib/planos/limites.ts`: `avaliarLimite`, `escolherTeto`, vigência e validação do acesso de suporte. Testada em `limites.test.ts`.
- Teto de IA: `escolherTeto` usa a configuração `ia.teto_mensal_usd`, depois `escritorio_limites.teto_ia_usd`, depois `IA_TETO_MENSAL_USD`.

## Onboarding

- Ligado por `ONBOARDING_ATIVO=true` (aplicação) e pela configuração de banco `app.cadastro_aberto = on`. Sem as duas, `/sem-escritorio` continua sendo a tela.
- Três passos (`/onboarding`): escritório, sócio responsável, revisão. Regras de formulário em `src/lib/planos/onboarding.ts`.
- `criar_escritorio` só cria o primeiro escritório de quem não tem vínculo ativo. Outros vínculos entram por convite.
- Nenhum plano é cobrado nessa etapa: **(a confirmar)**.

## Acesso de suporte

- O sócio concede em `/configuracoes/plano`: e-mail da conta de suporte, validade de 1 a 30 dias, motivo de pelo menos 10 caracteres. Revoga na mesma tela.
- O suporte vê os acessos em `/admin/suporte` e troca de escritório pelo seletor do header.
- Acesso vencido ou revogado deixa de valer nas policies na hora, mesmo com o JWT antigo.

## Pendências

- Catálogo de planos, preços, limites e validade máxima do acesso de suporte: a confirmar.
- Ligar `app.cadastro_aberto`: decisão do dono, fora das migrations.
- Confirmar no painel do Supabase que o hook consegue ler `auth.users` (`supabase_auth_admin`).
- Teste de banco `supabase/tests/isolamento-n-tenants.test.ts`: não executado.
