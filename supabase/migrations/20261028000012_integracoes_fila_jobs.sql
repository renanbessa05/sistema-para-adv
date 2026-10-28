-- 0012: integrações por escritório (segredos no Vault), fila própria de mensagens e registro de execuções de jobs
-- A fila própria substitui o pgmq quando a extensão não está disponível (CI local) e serve de fallback em produção.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_integracao') then
    create type public.tipo_integracao as enum ('whatsapp', 'datajud', 'djen', 'google_workspace', 'embeddings');
  end if;
end
$$;

-- config guarda só parâmetros não sensíveis (ids, números, URLs); o segredo fica no Vault, referenciado por vault_secret_id
create table if not exists public.integracoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  tipo public.tipo_integracao not null,
  config jsonb not null default '{}'::jsonb,
  vault_secret_id uuid,
  status text not null default 'inativa',
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (escritorio_id, tipo)
);
drop trigger if exists integracoes_atualizado_em on public.integracoes;
create trigger integracoes_atualizado_em before update on public.integracoes for each row execute function app.set_atualizado_em();

-- Lê o segredo da integração no Vault. Só a service role executa (grant abaixo).
-- Em Postgres sem Vault (CI local) devolve null em vez de falhar.
create or replace function app.segredo(p_escritorio uuid, p_tipo public.tipo_integracao)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_segredo text;
begin
  select i.vault_secret_id into v_secret_id
    from public.integracoes i
   where i.escritorio_id = p_escritorio and i.tipo = p_tipo;
  if v_secret_id is null or to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where id = $1' into v_segredo using v_secret_id;
  return v_segredo;
end
$$;
revoke execute on function app.segredo(uuid, public.tipo_integracao) from public, anon, authenticated;
grant execute on function app.segredo(uuid, public.tipo_integracao) to service_role;

-- Fila própria: uma linha por mensagem; leitura com FOR UPDATE SKIP LOCKED e janela de visibilidade
create table if not exists public.fila_mensagens (
  id bigserial primary key,
  fila text not null,
  escritorio_id uuid references public.escritorios(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  disponivel_em timestamptz not null default now(),
  tentativas int not null default 0 check (tentativas >= 0),
  max_tentativas int not null default 5 check (max_tentativas >= 1),
  bloqueada_ate timestamptz,
  concluida_em timestamptz,
  erro text,
  criado_em timestamptz not null default now()
);
create index if not exists fila_mensagens_pendentes_idx on public.fila_mensagens (fila, disponivel_em) where concluida_em is null;
create index if not exists fila_mensagens_escritorio_idx on public.fila_mensagens (escritorio_id, fila) where concluida_em is null;

create or replace function public.fila_enfileirar(p_fila text, p_escritorio uuid, p_payload jsonb, p_atraso_segundos int default 0)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.fila_mensagens (fila, escritorio_id, payload, disponivel_em)
  values (p_fila, p_escritorio, coalesce(p_payload, '{}'::jsonb), now() + make_interval(secs => greatest(coalesce(p_atraso_segundos, 0), 0)))
  returning id
$$;

-- Lê até p_quantidade mensagens disponíveis, bloqueia por p_visibilidade_segundos e conta a tentativa
create or replace function public.fila_ler(p_fila text, p_quantidade int, p_visibilidade_segundos int default 300)
returns setof public.fila_mensagens
language sql
security definer
set search_path = ''
as $$
  with candidatas as (
    select m.id
      from public.fila_mensagens m
     where m.fila = p_fila
       and m.concluida_em is null
       and m.disponivel_em <= now()
       and (m.bloqueada_ate is null or m.bloqueada_ate <= now())
     order by m.disponivel_em, m.id
     limit greatest(coalesce(p_quantidade, 1), 0)
     for update skip locked
  )
  update public.fila_mensagens f
     set bloqueada_ate = now() + make_interval(secs => greatest(coalesce(p_visibilidade_segundos, 300), 1)),
         tentativas = f.tentativas + 1
    from candidatas c
   where f.id = c.id
  returning f.*
$$;

create or replace function public.fila_concluir(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.fila_mensagens
     set concluida_em = now(), bloqueada_ate = null, erro = null
   where id = p_id and concluida_em is null
$$;

-- Falha: reagenda com atraso; esgotadas as tentativas, encerra com o erro registrado
create or replace function public.fila_falhar(p_id bigint, p_erro text, p_atraso_segundos int default 60)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.fila_mensagens
     set erro = p_erro,
         bloqueada_ate = null,
         concluida_em = case when tentativas >= max_tentativas then now() else null end,
         disponivel_em = case when tentativas >= max_tentativas then disponivel_em else now() + make_interval(secs => greatest(coalesce(p_atraso_segundos, 60), 0)) end
   where id = p_id and concluida_em is null
$$;

-- Registro de cada execução de job (cron da Vercel), para /admin/status e alertas de falha
create table if not exists public.jobs_execucoes (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  escritorio_id uuid references public.escritorios(id) on delete cascade,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  status text not null default 'executando',
  itens int not null default 0,
  erro text,
  detalhes jsonb
);
create index if not exists jobs_execucoes_job_data_idx on public.jobs_execucoes (job, iniciado_em desc);
create index if not exists jobs_execucoes_escritorio_idx on public.jobs_execucoes (escritorio_id, iniciado_em desc);

-- RLS
alter table public.integracoes enable row level security;
alter table public.fila_mensagens enable row level security;
alter table public.jobs_execucoes enable row level security;

-- Integrações: sócio lê a configuração (sem segredo); escrita só pela service role
drop policy if exists integracoes_select_socio on public.integracoes;
create policy integracoes_select_socio on public.integracoes for select to authenticated using (escritorio_id = app.escritorio_atual() and app.eh_socio());
-- fila_mensagens e jobs_execucoes: sem policy para authenticated (só service role)

revoke all on public.integracoes, public.fila_mensagens, public.jobs_execucoes from anon, authenticated;
grant select on public.integracoes to authenticated;
grant all on public.integracoes, public.fila_mensagens, public.jobs_execucoes to service_role;
grant usage, select on sequence public.fila_mensagens_id_seq to service_role;

revoke execute on function public.fila_enfileirar(text, uuid, jsonb, int) from public, anon, authenticated;
revoke execute on function public.fila_ler(text, int, int) from public, anon, authenticated;
revoke execute on function public.fila_concluir(bigint) from public, anon, authenticated;
revoke execute on function public.fila_falhar(bigint, text, int) from public, anon, authenticated;
grant execute on function public.fila_enfileirar(text, uuid, jsonb, int) to service_role;
grant execute on function public.fila_ler(text, int, int) to service_role;
grant execute on function public.fila_concluir(bigint) to service_role;
grant execute on function public.fila_falhar(bigint, text, int) to service_role;
