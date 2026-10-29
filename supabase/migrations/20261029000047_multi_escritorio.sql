-- 0047: multi-escritório (docs/adr/0014-multi-escritorio-planos-suporte.md)
--
-- 1. acessos_suporte: acesso temporário de um usuário de suporte a UM escritório, concedido por sócio e revogável.
-- 2. app.acesso_suporte_vigente(escritorio) e app.eh_suporte(): checagem AO VIVO na tabela (não depende do JWT).
-- 3. Custom Access Token Hook: lê auth.users.raw_app_meta_data.escritorio_ativo (gravado por trocar_escritorio).
--    Sem o campo, ou sem vínculo/acesso válido para ele, o caminho é EXATAMENTE o da 0004 (mesma query).
--    O bloco novo roda dentro de begin/exception: qualquer erro nele cai no caminho antigo, nunca derruba o login.
-- 4. trocar_escritorio(p_escritorio) e listar_vinculos(): RPCs do seletor de escritório.
-- 5. app.mfa_satisfeita: para papel 'suporte' exige aal2 (sem carência). Para os demais papéis, o resultado é o da 0016.

create table if not exists public.acessos_suporte (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  concedido_por uuid references auth.users(id) on delete set null,
  motivo text not null check (char_length(btrim(motivo)) >= 10),
  expira_em timestamptz not null,
  revogado_em timestamptz,
  revogado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (expira_em > criado_em)
);
create index if not exists acessos_suporte_vigencia_idx on public.acessos_suporte (usuario_id, escritorio_id) where revogado_em is null;
drop trigger if exists acessos_suporte_atualizado_em on public.acessos_suporte;
create trigger acessos_suporte_atualizado_em before update on public.acessos_suporte for each row execute function app.set_atualizado_em();

create or replace function app.acesso_suporte_vigente(p_escritorio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_escritorio is not null and exists (
    select 1
      from public.acessos_suporte s
     where s.escritorio_id = p_escritorio
       and s.usuario_id = auth.uid()
       and s.revogado_em is null
       and s.expira_em > now()
  )
$$;
revoke execute on function app.acesso_suporte_vigente(uuid) from public, anon;
grant execute on function app.acesso_suporte_vigente(uuid) to authenticated, service_role;

create or replace function app.eh_suporte()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.papel_atual(), '') = 'suporte' and app.acesso_suporte_vigente(app.escritorio_atual())
$$;
revoke execute on function app.eh_suporte() from public, anon;
grant execute on function app.eh_suporte() to authenticated, service_role;

-- Segundo fator: mesma regra da 0016 para todos os papéis que não são suporte; suporte exige aal2 sem carência.
create or replace function app.mfa_satisfeita()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.eh_service_role()
      or (
        coalesce(app.papel_atual(), '') <> 'suporte'
        and (
          coalesce(app.papel_atual(), '') not in ('socio', 'advogado')
          or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
          or not exists (
            select 1
              from auth.mfa_factors f
             where f.user_id = auth.uid()
               and f.status = 'verified'
          )
        )
      )
      or (coalesce(app.papel_atual(), '') = 'suporte' and coalesce(auth.jwt() ->> 'aal', '') = 'aal2')
$$;
grant execute on function app.mfa_satisfeita() to authenticated, service_role;

-- Custom Access Token Hook (substitui a 0004 mantendo o caminho antigo intacto)
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  v_usuario uuid;
  v_ativo uuid;
  v_escritorio uuid;
  v_papel text;
  app_meta jsonb;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_usuario := (event ->> 'user_id')::uuid;

  -- Escritório escolhido pelo seletor. Qualquer falha neste bloco cai no caminho antigo abaixo.
  begin
    select case
             when u.raw_app_meta_data ->> 'escritorio_ativo' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               then (u.raw_app_meta_data ->> 'escritorio_ativo')::uuid
           end
      into v_ativo
      from auth.users u
     where u.id = v_usuario;

    if v_ativo is not null then
      select m.escritorio_id, m.papel::text
        into v_escritorio, v_papel
        from public.escritorio_membros m
       where m.usuario_id = v_usuario
         and m.escritorio_id = v_ativo
         and m.ativo
       limit 1;

      if v_escritorio is null and exists (
        select 1
          from public.acessos_suporte s
         where s.usuario_id = v_usuario
           and s.escritorio_id = v_ativo
           and s.revogado_em is null
           and s.expira_em > now()
      ) then
        v_escritorio := v_ativo;
        v_papel := 'suporte';
      end if;
    end if;
  exception when others then
    v_escritorio := null;
    v_papel := null;
  end;

  -- Caminho da 0004, idêntico: usado quando não há escritorio_ativo válido.
  if v_escritorio is null then
    select m.escritorio_id, m.papel::text
      into v_escritorio, v_papel
      from public.escritorio_membros m
     where m.usuario_id = v_usuario
       and m.ativo
     order by m.aceito_em desc nulls last, m.criado_em
     limit 1;
  end if;

  if v_escritorio is not null then
    claims := jsonb_set(claims, '{escritorio_id}', to_jsonb(v_escritorio::text), true);
    claims := jsonb_set(claims, '{papel}', to_jsonb(v_papel), true);
    app_meta := coalesce(claims -> 'app_metadata', '{}'::jsonb)
      || jsonb_build_object('escritorio_id', v_escritorio::text, 'papel', v_papel);
    claims := jsonb_set(claims, '{app_metadata}', app_meta, true);
  end if;

  return jsonb_set(event, '{claims}', claims, true);
end
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on table public.escritorio_membros to supabase_auth_admin;
grant select on table public.acessos_suporte to supabase_auth_admin;

-- Seletor: escolhe o escritório ativo. Só vínculo ativo (membro) ou acesso de suporte vigente.
create or replace function public.trocar_escritorio(p_escritorio uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_ok boolean;
begin
  if v_usuario is null then
    raise exception 'Sessão inválida' using errcode = '42501';
  end if;
  select exists (
           select 1
             from public.escritorio_membros m
             join public.escritorios e on e.id = m.escritorio_id
            where m.usuario_id = v_usuario
              and m.escritorio_id = p_escritorio
              and m.ativo
              and e.ativo
         )
      or exists (
           select 1
             from public.acessos_suporte s
            where s.usuario_id = v_usuario
              and s.escritorio_id = p_escritorio
              and s.revogado_em is null
              and s.expira_em > now()
         )
    into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'Sem vínculo ativo com este escritório' using errcode = '42501';
  end if;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
           || jsonb_build_object('escritorio_ativo', p_escritorio::text)
   where id = v_usuario;
end
$$;
revoke execute on function public.trocar_escritorio(uuid) from public, anon;
grant execute on function public.trocar_escritorio(uuid) to authenticated;

create or replace function public.listar_vinculos()
returns table (escritorio_id uuid, nome text, papel text, origem text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.escritorio_id, e.nome, m.papel::text, 'membro'::text
    from public.escritorio_membros m
    join public.escritorios e on e.id = m.escritorio_id
   where m.usuario_id = auth.uid()
     and m.ativo
     and e.ativo
  union all
  select s.escritorio_id, e.nome, 'suporte'::text, 'acesso_suporte'::text
    from public.acessos_suporte s
    join public.escritorios e on e.id = s.escritorio_id
   where s.usuario_id = auth.uid()
     and s.revogado_em is null
     and s.expira_em > now()
     and e.ativo
     and not exists (
       select 1
         from public.escritorio_membros m2
        where m2.usuario_id = s.usuario_id
          and m2.escritorio_id = s.escritorio_id
          and m2.ativo
     )
$$;
revoke execute on function public.listar_vinculos() from public, anon;
grant execute on function public.listar_vinculos() to authenticated;

-- RLS e MFA da tabela nova: leitura pelo próprio suporte e pelo sócio do escritório; escrita só por RPC/service role.
alter table public.acessos_suporte enable row level security;

drop policy if exists acessos_suporte_select on public.acessos_suporte;
create policy acessos_suporte_select on public.acessos_suporte for select to authenticated
  using (usuario_id = auth.uid() or (escritorio_id = app.escritorio_atual() and app.eh_socio()));

grant select on public.acessos_suporte to authenticated;
grant all on public.acessos_suporte to service_role;

drop policy if exists mfa_obrigatorio on public.acessos_suporte;
create policy mfa_obrigatorio on public.acessos_suporte as restrictive for all to authenticated
  using (app.mfa_satisfeita()) with check (app.mfa_satisfeita());
