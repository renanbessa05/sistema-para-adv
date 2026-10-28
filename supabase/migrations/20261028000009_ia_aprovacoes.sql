-- 0009: execuções de IA (custo e auditoria) e aprovações humanas
-- Tudo que a IA propõe passa por aprovação humana: a decisão fica registrada aqui com quem, quando e quanto tempo levou.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ia_status') then
    create type public.ia_status as enum ('ok', 'erro', 'recusado', 'invalido_schema', 'cancelado_teto');
  end if;
  if not exists (select 1 from pg_type where typname = 'aprovacao_objeto') then
    create type public.aprovacao_objeto as enum ('prazo', 'tarefa_reatribuicao', 'tarefa_conclusao', 'contrato', 'minuta', 'mensagem_cliente');
  end if;
  if not exists (select 1 from pg_type where typname = 'aprovacao_status') then
    create type public.aprovacao_status as enum ('pendente', 'aprovada', 'rejeitada', 'ajustada', 'expirada');
  end if;
  if not exists (select 1 from pg_type where typname = 'solicitante_tipo') then
    create type public.solicitante_tipo as enum ('ia', 'usuario');
  end if;
end
$$;

-- Preço vigente de um modelo numa data (ref.ia_precos é versionado por vigência)
create or replace function app.ia_preco_vigente(p_modelo text, p_data date default current_date)
returns uuid
language sql
stable
set search_path = ''
as $$
  select p.id
    from ref.ia_precos p
   where p.modelo = p_modelo
     and p.vigencia_inicio <= p_data
     and (p.vigencia_fim is null or p.vigencia_fim >= p_data)
   order by p.vigencia_inicio desc
   limit 1
$$;

-- Custo estimado em US$ a partir dos tokens e do preço vigente (US$ por milhão de tokens).
-- Devolve null quando não há preço cadastrado para o modelo na data.
create or replace function app.custo_ia(p_modelo text, p_input int, p_output int, p_cache_write int, p_cache_read int, p_data date default current_date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round((
      coalesce(p_input, 0) * p.input_por_mtok
    + coalesce(p_output, 0) * p.output_por_mtok
    + coalesce(p_cache_write, 0) * coalesce(p.cache_write_por_mtok, 0)
    + coalesce(p_cache_read, 0) * coalesce(p.cache_read_por_mtok, 0)
  ) / 1000000.0, 6)
    from ref.ia_precos p
   where p.id = app.ia_preco_vigente(p_modelo, p_data)
$$;

create table if not exists public.ia_execucoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  agente text not null,
  agente_versao text,
  modelo text not null,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  cache_creation_input_tokens int not null default 0 check (cache_creation_input_tokens >= 0),
  cache_read_input_tokens int not null default 0 check (cache_read_input_tokens >= 0),
  custo_estimado numeric(12,6),
  ia_preco_id uuid references ref.ia_precos(id),
  latencia_ms int,
  status public.ia_status not null default 'ok',
  erro text,
  request_id text,
  objeto_tipo text,
  objeto_id uuid,
  criado_em timestamptz not null default now()
);
create index if not exists ia_execucoes_escritorio_data_idx on public.ia_execucoes (escritorio_id, criado_em desc);
create index if not exists ia_execucoes_agente_idx on public.ia_execucoes (escritorio_id, agente, criado_em desc);
create index if not exists ia_execucoes_objeto_idx on public.ia_execucoes (objeto_tipo, objeto_id);

-- Preenche preço vigente e custo quando o chamador não informa
create or replace function app.ia_execucoes_preencher_custo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ia_preco_id is null then
    new.ia_preco_id := app.ia_preco_vigente(new.modelo, (new.criado_em at time zone 'UTC')::date);
  end if;
  if new.custo_estimado is null then
    new.custo_estimado := app.custo_ia(new.modelo, new.input_tokens, new.output_tokens, new.cache_creation_input_tokens, new.cache_read_input_tokens, (new.criado_em at time zone 'UTC')::date);
  end if;
  return new;
end
$$;
drop trigger if exists ia_execucoes_preencher_custo on public.ia_execucoes;
create trigger ia_execucoes_preencher_custo before insert on public.ia_execucoes for each row execute function app.ia_execucoes_preencher_custo();

-- Aprovações: objeto_id aponta para prazos, tarefas, documentos etc. (sem FK: tabelas de migrations distintas)
create table if not exists public.aprovacoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  objeto_tipo public.aprovacao_objeto not null,
  objeto_id uuid not null,
  solicitada_por_tipo public.solicitante_tipo not null default 'ia',
  solicitada_por_id uuid,
  ia_execucao_id uuid references public.ia_execucoes(id) on delete set null,
  conteudo_snapshot jsonb not null default '{}'::jsonb,
  status public.aprovacao_status not null default 'pendente',
  aprovador_id uuid,
  decidida_em timestamptz,
  comentario text,
  ajustes jsonb,
  prazo_resposta_em timestamptz,
  tempo_revisao_humana_s int check (tempo_revisao_humana_s >= 0),
  tempo_economizado_auto_relatado_min int check (tempo_economizado_auto_relatado_min >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists aprovacoes_escritorio_status_idx on public.aprovacoes (escritorio_id, status, criado_em desc);
create index if not exists aprovacoes_objeto_idx on public.aprovacoes (objeto_tipo, objeto_id);
create index if not exists aprovacoes_pendentes_prazo_idx on public.aprovacoes (escritorio_id, prazo_resposta_em) where status = 'pendente';
drop trigger if exists aprovacoes_atualizado_em on public.aprovacoes;
create trigger aprovacoes_atualizado_em before update on public.aprovacoes for each row execute function app.set_atualizado_em();

-- Decisão humana: só advogado ou sócio; para prazo, só quem pode agir no processo do prazo.
-- A tabela prazos vem de outra migration: a checagem é dinâmica para esta migration aplicar em qualquer ordem.
create or replace function public.decidir_aprovacao(
  p_id uuid,
  p_decisao public.aprovacao_status,
  p_comentario text default null,
  p_ajustes jsonb default null,
  p_tempo_economizado_min int default null
)
returns public.aprovacoes
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.aprovacoes;
  pode_agir boolean;
begin
  if not app.eh_advogado_ou_socio() then
    raise exception 'Apenas advogado ou sócio pode decidir aprovações' using errcode = '42501';
  end if;
  if p_decisao not in ('aprovada', 'rejeitada', 'ajustada') then
    raise exception 'Decisão inválida: %', p_decisao using errcode = '22023';
  end if;
  if p_decisao = 'ajustada' and p_ajustes is null then
    raise exception 'Decisão "ajustada" exige os ajustes' using errcode = '22023';
  end if;

  select * into a from public.aprovacoes where id = p_id and escritorio_id = app.escritorio_atual() for update;
  if not found then
    raise exception 'Aprovação não encontrada' using errcode = 'P0002';
  end if;
  if a.status <> 'pendente' then
    raise exception 'Aprovação já decidida (%)', a.status using errcode = '55000';
  end if;

  if a.objeto_tipo = 'prazo' and to_regclass('public.prazos') is not null then
    execute 'select app.pode_agir_no_processo(p.processo_id) from public.prazos p where p.id = $1' into pode_agir using a.objeto_id;
    if coalesce(pode_agir, false) is not true then
      raise exception 'Apenas o responsável, colaborador advogado ou sócio pode decidir sobre este prazo' using errcode = '42501';
    end if;
  end if;

  update public.aprovacoes
     set status = p_decisao,
         aprovador_id = app.usuario_atual(),
         decidida_em = now(),
         comentario = p_comentario,
         ajustes = p_ajustes,
         tempo_economizado_auto_relatado_min = p_tempo_economizado_min,
         tempo_revisao_humana_s = greatest(0, floor(extract(epoch from now() - criado_em)))::int
   where id = a.id
  returning * into a;
  return a;
end
$$;

-- RLS
alter table public.ia_execucoes enable row level security;
alter table public.aprovacoes enable row level security;

-- Custos de IA: só sócio lê; escrita só pela service role (jobs e server actions)
drop policy if exists ia_execucoes_select_socio on public.ia_execucoes;
create policy ia_execucoes_select_socio on public.ia_execucoes for select to authenticated using (escritorio_id = app.escritorio_atual() and app.eh_socio());

drop policy if exists tenant_isolamento on public.aprovacoes;
create policy tenant_isolamento on public.aprovacoes for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
-- Decisão só via RPC: UPDATE direto negado
drop policy if exists aprovacoes_update_so_rpc on public.aprovacoes;
create policy aprovacoes_update_so_rpc on public.aprovacoes as restrictive for update to authenticated using (false);

revoke all on public.ia_execucoes from anon, authenticated;
grant select on public.ia_execucoes to authenticated;
grant all on public.ia_execucoes to service_role;
grant select, insert, update, delete on public.aprovacoes to authenticated;
grant all on public.aprovacoes to service_role;
grant execute on function public.decidir_aprovacao(uuid, public.aprovacao_status, text, jsonb, int) to authenticated, service_role;
revoke execute on function public.decidir_aprovacao(uuid, public.aprovacao_status, text, jsonb, int) from anon, public;
