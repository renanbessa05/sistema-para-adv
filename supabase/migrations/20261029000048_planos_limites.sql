-- 0048: planos, assinaturas e limites por escritório (docs/regras/planos.md)
--
-- Nenhum plano é semeado aqui: nomes e valores são comerciais e ficam (a confirmar). Sem assinatura ativa e sem
-- override em escritorio_limites, app.limite devolve null, que significa SEM LIMITE: os gatilhos não bloqueiam nada.
-- Limite null em escritorio_limites significa "herdar do plano".

create table if not exists ref.planos (
  codigo text primary key check (codigo ~ '^[a-z][a-z0-9_]*$'),
  nome text not null,
  limite_usuarios int check (limite_usuarios is null or limite_usuarios >= 0),
  limite_processos int check (limite_processos is null or limite_processos >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table ref.planos enable row level security;
drop policy if exists ref_leitura on ref.planos;
create policy ref_leitura on ref.planos for select to authenticated using (true);
grant select on ref.planos to authenticated;
grant all on ref.planos to service_role;

create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  plano_codigo text not null references ref.planos(codigo),
  status text not null default 'ativa' check (status in ('ativa', 'suspensa', 'encerrada')),
  inicio date not null default current_date,
  fim date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);
create unique index if not exists assinaturas_uma_ativa on public.assinaturas (escritorio_id) where status = 'ativa';
drop trigger if exists assinaturas_atualizado_em on public.assinaturas;
create trigger assinaturas_atualizado_em before update on public.assinaturas for each row execute function app.set_atualizado_em();

create table if not exists public.escritorio_limites (
  escritorio_id uuid primary key references public.escritorios(id) on delete cascade,
  limite_usuarios int check (limite_usuarios is null or limite_usuarios >= 0),
  limite_processos int check (limite_processos is null or limite_processos >= 0),
  teto_ia_usd numeric(12, 2) check (teto_ia_usd is null or teto_ia_usd >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
drop trigger if exists escritorio_limites_atualizado_em on public.escritorio_limites;
create trigger escritorio_limites_atualizado_em before update on public.escritorio_limites for each row execute function app.set_atualizado_em();

alter table public.assinaturas enable row level security;
alter table public.escritorio_limites enable row level security;

-- Leitura só pelo sócio do escritório; escrita só pela service role (operação da plataforma).
drop policy if exists assinaturas_select_socio on public.assinaturas;
create policy assinaturas_select_socio on public.assinaturas for select to authenticated
  using (escritorio_id = app.escritorio_atual() and app.eh_socio());
drop policy if exists escritorio_limites_select_socio on public.escritorio_limites;
create policy escritorio_limites_select_socio on public.escritorio_limites for select to authenticated
  using (escritorio_id = app.escritorio_atual() and app.eh_socio());

grant select on public.assinaturas, public.escritorio_limites to authenticated;
grant all on public.assinaturas, public.escritorio_limites to service_role;

-- Limite efetivo: override do escritório, senão o plano da assinatura ativa vigente. null = sem limite.
create or replace function app.limite(p_escritorio uuid, p_chave text)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_valor int;
begin
  if p_chave not in ('usuarios', 'processos') then
    raise exception 'Chave de limite desconhecida: %', p_chave using errcode = '22023';
  end if;

  select case when p_chave = 'usuarios' then el.limite_usuarios else el.limite_processos end
    into v_valor
    from public.escritorio_limites el
   where el.escritorio_id = p_escritorio;
  if v_valor is not null then
    return v_valor;
  end if;

  select case when p_chave = 'usuarios' then p.limite_usuarios else p.limite_processos end
    into v_valor
    from public.assinaturas a
    join ref.planos p on p.codigo = a.plano_codigo
   where a.escritorio_id = p_escritorio
     and a.status = 'ativa'
     and (a.fim is null or a.fim >= current_date)
   limit 1;
  return v_valor;
end
$$;
revoke execute on function app.limite(uuid, text) from public, anon;
grant execute on function app.limite(uuid, text) to authenticated, service_role;

-- Gatilhos: bloqueiam só quando há limite configurado. Contagem feita como definer (ignora RLS, mesmo escritório).
create or replace function app.verificar_limite_membros()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite int;
  v_atual int;
begin
  if not new.ativo then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.ativo = new.ativo then
    return new;
  end if;
  v_limite := app.limite(new.escritorio_id, 'usuarios');
  if v_limite is null then
    return new;
  end if;
  select count(*) into v_atual
    from public.escritorio_membros m
   where m.escritorio_id = new.escritorio_id
     and m.ativo
     and m.id <> new.id;
  if v_atual >= v_limite then
    raise exception 'Limite de usuários do plano atingido (%)', v_limite using errcode = '53400';
  end if;
  return new;
end
$$;
drop trigger if exists escritorio_membros_limite on public.escritorio_membros;
create trigger escritorio_membros_limite before insert or update of ativo on public.escritorio_membros
  for each row execute function app.verificar_limite_membros();

create or replace function app.verificar_limite_processos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite int;
  v_atual int;
begin
  v_limite := app.limite(new.escritorio_id, 'processos');
  if v_limite is null then
    return new;
  end if;
  select count(*) into v_atual from public.processos p where p.escritorio_id = new.escritorio_id;
  if v_atual >= v_limite then
    raise exception 'Limite de processos do plano atingido (%)', v_limite using errcode = '53400';
  end if;
  return new;
end
$$;
drop trigger if exists processos_limite on public.processos;
create trigger processos_limite before insert on public.processos
  for each row execute function app.verificar_limite_processos();

-- Segundo fator (laço da 0016) nas tabelas novas sensíveis
do $$
declare
  t text;
begin
  foreach t in array array['assinaturas', 'escritorio_limites'] loop
    execute format('drop policy if exists mfa_obrigatorio on public.%I', t);
    execute format(
      'create policy mfa_obrigatorio on public.%I as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita())',
      t
    );
  end loop;
end
$$;
