-- 0017: segredos de integração (WhatsApp, DataJud) gravados no Supabase Vault pela tela de Integrações
-- Regra (docs/escopo-revisado.md 1.3.2 e 2.1 "Segredos"): o valor nunca fica em coluna texto. A tabela
-- public.integracoes guarda só config não sensível e a referência vault_secret_id; o sócio grava e remove
-- pelas RPCs abaixo; só a service role lê o valor (app.segredo, exposto à API por segredo_integracao).
-- Em Postgres sem Vault (CI local sem o shim) a gravação falha com erro claro; a leitura devolve null.

-- Nome do segredo no Vault: 'integracao:<escritorio_id>:<tipo>' (único por escritório e tipo)
create or replace function app.nome_segredo_integracao(p_escritorio uuid, p_tipo public.tipo_integracao)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'integracao:' || p_escritorio::text || ':' || p_tipo::text
$$;
revoke execute on function app.nome_segredo_integracao(uuid, public.tipo_integracao) from public, anon;

-- Sócio grava (ou troca) o segredo da integração do próprio escritório e a config não sensível (ex.: phone_number_id).
-- Cria o segredo no Vault na primeira vez; nas seguintes atualiza o mesmo id (rotação sem trocar a referência).
create or replace function public.integracao_definir_segredo(p_tipo public.tipo_integracao, p_segredo text, p_config jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escritorio uuid := app.escritorio_atual();
  v_nome text;
  v_secret_id uuid;
  v_existe boolean := false;
begin
  if not app.eh_socio() then
    raise exception 'Apenas sócio pode gravar segredos de integração' using errcode = '42501';
  end if;
  if v_escritorio is null then
    raise exception 'Sessão sem escritório' using errcode = '42501';
  end if;
  if p_segredo is null or btrim(p_segredo) = '' then
    raise exception 'Informe o segredo da integração' using errcode = '22023';
  end if;
  if p_config is not null and jsonb_typeof(p_config) <> 'object' then
    raise exception 'A configuração da integração precisa ser um objeto JSON' using errcode = '22023';
  end if;
  if to_regprocedure('vault.create_secret(text,text,text,uuid)') is null then
    raise exception 'Vault indisponível neste banco: habilite a extensão supabase_vault antes de gravar segredos' using errcode = '0A000';
  end if;

  v_nome := app.nome_segredo_integracao(v_escritorio, p_tipo);

  select i.vault_secret_id into v_secret_id
    from public.integracoes i
   where i.escritorio_id = v_escritorio and i.tipo = p_tipo;

  if v_secret_id is not null then
    execute 'select exists (select 1 from vault.secrets where id = $1)' into v_existe using v_secret_id;
    if v_existe then
      execute 'select vault.update_secret($1, $2)' using v_secret_id, btrim(p_segredo);
    else
      v_secret_id := null; -- referência órfã: recria abaixo
    end if;
  end if;

  if v_secret_id is null then
    -- O nome é único no Vault: remove um registro órfão com o mesmo nome antes de criar
    execute 'delete from vault.secrets where name = $1' using v_nome;
    execute 'select vault.create_secret($1, $2, $3)'
       into v_secret_id
      using btrim(p_segredo), v_nome, 'Segredo da integração ' || p_tipo::text || ' do escritório ' || v_escritorio::text;
  end if;

  insert into public.integracoes (escritorio_id, tipo, config, vault_secret_id, status, ultimo_erro)
  values (v_escritorio, p_tipo, coalesce(p_config, '{}'::jsonb), v_secret_id, 'ativa', null)
  on conflict (escritorio_id, tipo) do update
     set config = public.integracoes.config || coalesce(excluded.config, '{}'::jsonb),
         vault_secret_id = excluded.vault_secret_id,
         status = 'ativa',
         ultimo_erro = null;
end
$$;
revoke execute on function public.integracao_definir_segredo(public.tipo_integracao, text, jsonb) from public, anon;
grant execute on function public.integracao_definir_segredo(public.tipo_integracao, text, jsonb) to authenticated, service_role;

-- Sócio remove o segredo: apaga do Vault e deixa a integração inativa (a config não sensível fica).
create or replace function public.integracao_remover_segredo(p_tipo public.tipo_integracao)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escritorio uuid := app.escritorio_atual();
  v_secret_id uuid;
begin
  if not app.eh_socio() then
    raise exception 'Apenas sócio pode remover segredos de integração' using errcode = '42501';
  end if;
  if v_escritorio is null then
    raise exception 'Sessão sem escritório' using errcode = '42501';
  end if;

  select i.vault_secret_id into v_secret_id
    from public.integracoes i
   where i.escritorio_id = v_escritorio and i.tipo = p_tipo;
  if not found then
    raise exception 'Integração não configurada' using errcode = 'P0002';
  end if;

  if v_secret_id is not null and to_regclass('vault.secrets') is not null then
    execute 'delete from vault.secrets where id = $1' using v_secret_id;
  end if;

  update public.integracoes
     set vault_secret_id = null,
         status = 'inativa',
         ultimo_erro = null
   where escritorio_id = v_escritorio and tipo = p_tipo;
end
$$;
revoke execute on function public.integracao_remover_segredo(public.tipo_integracao) from public, anon;
grant execute on function public.integracao_remover_segredo(public.tipo_integracao) to authenticated, service_role;

-- Leitura do valor pela API (o schema app não é exposto pelo PostgREST): só a service role.
create or replace function public.segredo_integracao(p_escritorio uuid, p_tipo public.tipo_integracao)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select app.segredo(p_escritorio, p_tipo)
$$;
revoke execute on function public.segredo_integracao(uuid, public.tipo_integracao) from public, anon, authenticated;
grant execute on function public.segredo_integracao(uuid, public.tipo_integracao) to service_role;

-- Jobs registram falha da integração (ex.: chave do DataJud recusada) para a tela mostrar; só a service role.
-- Sem linha ainda (segredo vindo da variável de ambiente), cria uma só com o erro, sem segredo.
create or replace function public.integracao_registrar_erro(p_escritorio uuid, p_tipo public.tipo_integracao, p_erro text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.integracoes (escritorio_id, tipo, status, ultimo_erro)
  values (p_escritorio, p_tipo, 'erro', left(coalesce(p_erro, 'erro desconhecido'), 2000))
  on conflict (escritorio_id, tipo) do update
     set status = 'erro',
         ultimo_erro = left(coalesce(p_erro, 'erro desconhecido'), 2000)
$$;
revoke execute on function public.integracao_registrar_erro(uuid, public.tipo_integracao, text) from public, anon, authenticated;
grant execute on function public.integracao_registrar_erro(uuid, public.tipo_integracao, text) to service_role;

-- Tabela: leitura pelo sócio do escritório (a linha não tem o segredo, só config e referência);
-- escrita só pelas RPCs acima e pela service role. (a confirmar) abrir a leitura aos demais papéis.
revoke insert, update, delete on public.integracoes from anon, authenticated;
drop policy if exists integracoes_select_socio on public.integracoes;
create policy integracoes_select_socio on public.integracoes for select to authenticated using (escritorio_id = app.escritorio_atual() and app.eh_socio());
