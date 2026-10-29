# ADR 0014: multi-escritório, planos com limites e suporte somente leitura

Status: aceito (lote 13), com pendências abertas abaixo.

## Contexto

Um usuário pode ser sócio de mais de um escritório, e a plataforma precisa de onboarding próprio e de uma equipe de suporte que veja um escritório sem poder alterá-lo. Até o lote 12 o claim do JWT era um único escritório por usuário (a primeira linha de `escritorio_membros`). Qualquer mudança no hook e nas policies afeta todos os usuários já logados em produção.

## Decisão

- **Escritório ativo**: `auth.users.raw_app_meta_data.escritorio_ativo`, gravado por `trocar_escritorio` (só para vínculo ativo ou acesso de suporte vigente). O hook (migration 0047) usa esse campo quando é válido; senão cai na mesma query da 0004. Erros no bloco novo caem no caminho antigo.
- **Papel `suporte`** (migration 0046, enum à parte). Ele só aparece no claim quando há `acessos_suporte` vigente (`expira_em` no futuro, sem `revogado_em`) para o escritório escolhido. A checagem é repetida ao vivo nas policies.
- **Suporte só lê**: policies RESTRITIVAS `suporte_somente_leitura` (select, exige acesso vigente) e `suporte_sem_escrita_*` (insert, update, delete) em todas as tabelas de `public` com RLS (migration 0049). Policies restritivas só estreitam: para os demais papéis a expressão é verdadeira e nada muda.
- **Segundo fator**: suporte exige aal2 sem carência (0047). Os demais papéis mantêm a regra da 0016.
- **Acesso concedido pelo sócio**: `conceder_acesso_suporte` e `revogar_acesso_suporte` (0050), com MFA, motivo de pelo menos 10 caracteres e validade de até 30 dias. O teto de 30 dias é proposta técnica, a confirmar.
- **Planos e limites**: `ref.planos`, `assinaturas` e `escritorio_limites` (0048). Nenhum plano é semeado. Sem assinatura nem override, `app.limite` devolve null e os gatilhos não bloqueiam nada. Gatilhos em `escritorio_membros` (usuários) e `processos` (código 53400).
- **Teto de IA**: `verificarTeto` lê `escritorio_limites.teto_ia_usd` depois da configuração `ia.teto_mensal_usd` e antes do padrão do ambiente. As RPCs de wrapper em `public` do lote 10 foram preservadas.
- **Onboarding**: `criar_escritorio` (0050) só cria o primeiro escritório de quem não tem vínculo ativo e só roda se a configuração de banco `app.cadastro_aberto` for `on`. A migration não liga essa configuração. A tela `/onboarding` só aparece com `ONBOARDING_ATIVO=true`.

## Consequências

- Usuários sem `escritorio_ativo` recebem exatamente os mesmos claims de antes.
- Nada muda para quem não é suporte, exceto o limite de usuários e processos quando um plano for cadastrado.
- Tabelas de `public` criadas depois precisam repetir o bloco de policies da 0049 (ver `docs/regras/permissoes.md`).
- Pendências: o teste de banco `supabase/tests/isolamento-n-tenants.test.ts` foi escrito e não foi executado. O hook lê `auth.users` com o papel `supabase_auth_admin`; isso precisa ser confirmado no painel do Supabase, e a exceção do hook protege o login se faltar permissão, mas o seletor não funcionará. `escritorio_membros` continua sem campo de plano. Valores de planos, limites e a validade máxima de 30 dias estão a confirmar.
- Cadastro público continua desligado no banco até decisão do dono.
