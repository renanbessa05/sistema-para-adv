-- 0034: cálculos de atualização monetária e juros (Fase 2, lote 6; E6 do escopo)
--
-- ref.indices_economicos guarda a variação mensal (%) de cada índice, vinda da API SGS do BCB (códigos a confirmar).
-- ref.regras_juros guarda os presets de correção e juros; os de juros pós-Lei 14.905/2024 são "a confirmar" e
-- precisam de revisão da advogada antes de valerem. calculos e calculo_itens são o resultado persistido; a aprovação
-- passa por aprovacoes (objeto 'calculo', efeito em app.efeito_aprovacao_calculo).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'indice_economico') then
    create type public.indice_economico as enum ('inpc', 'ipca', 'ipca_e', 'selic', 'tr', 'igpm');
  end if;
  if not exists (select 1 from pg_type where typname = 'calculo_tipo') then
    create type public.calculo_tipo as enum ('atualizacao_divida', 'liquidacao_sentenca', 'honorarios_sucumbencia', 'custas');
  end if;
  if not exists (select 1 from pg_type where typname = 'calculo_status') then
    create type public.calculo_status as enum ('rascunho', 'aguardando_aprovacao', 'aprovado', 'rejeitado');
  end if;
end
$$;

create table if not exists ref.indices_economicos (
  indice public.indice_economico not null,
  competencia date not null,
  valor numeric(14,8) not null,
  fonte_url text,
  importado_em timestamptz not null default now(),
  primary key (indice, competencia)
);
grant select on ref.indices_economicos to anon, authenticated, service_role;
grant insert, update on ref.indices_economicos to service_role;

create table if not exists ref.regras_juros (
  codigo text primary key,
  nome text not null,
  descricao text not null,
  parametros jsonb not null,
  fonte text,
  a_confirmar boolean not null default true
);
grant select on ref.regras_juros to anon, authenticated, service_role;

insert into ref.regras_juros (codigo, nome, descricao, parametros, fonte, a_confirmar) values
  ('civel_pre_14905', 'Cível (regra até a Lei 14.905/2024)', 'Correção pelo INPC; juros simples de 1% ao mês desde a citação.', '{"correcao":"inpc","juros_taxa_mensal":1,"juros_base":"citacao"}', 'Prática do escritório (skill tjmt-peticoes, cível)', true),
  ('servidor_mt', 'Servidor público de MT', 'Correção pelo INPC; juros de 0,5% ao mês (art. 1º-F da Lei 9.494/1997, redação da Lei 11.960/2009).', '{"correcao":"inpc","juros_taxa_mensal":0.5,"juros_base":"citacao"}', 'Skill tjmt-peticoes, administrativo-servidores (a confirmar frente ao tema vigente)', true),
  ('fazenda_ec113', 'Fazenda Pública (EC 113/2021)', 'Desde 09/12/2021, uma única taxa: SELIC acumulada, sem correção em separado.', '{"correcao":null,"juros_selic":true,"juros_base":"citacao"}', 'EC 113/2021; Temas 810/STF e 905/STJ (a confirmar aplicação ao caso)', true),
  ('lei_14905_2024', 'Lei 14.905/2024 (IPCA + juros legais)', 'Correção pelo IPCA; juros de SELIC menos IPCA, com piso zero.', '{"correcao":"ipca","juros_selic_menos_ipca":true,"juros_base":"citacao"}', 'Lei 14.905/2024 (a confirmar incidência e período de transição)', true),
  ('contratual_personalizada', 'Contratual (parâmetros do contrato)', 'Correção e juros informados pela advogada, conforme o título.', '{"correcao":"informada","juros_taxa_mensal":"informada","juros_base":"informada"}', 'Título executivo do caso', false)
on conflict (codigo) do update set nome = excluded.nome, descricao = excluded.descricao, parametros = excluded.parametros, fonte = excluded.fonte, a_confirmar = excluded.a_confirmar;

create table if not exists public.calculos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  processo_id uuid references public.processos(id) on delete set null,
  tipo public.calculo_tipo not null default 'atualizacao_divida',
  regra_codigo text not null references ref.regras_juros(codigo),
  titulo text not null,
  parametros jsonb not null default '{}'::jsonb,
  resultado jsonb,
  memoria jsonb,
  documento_pdf_id uuid references public.documentos(id) on delete set null,
  aprovacao_id uuid references public.aprovacoes(id) on delete set null,
  status public.calculo_status not null default 'rascunho',
  criado_por uuid,
  atualizado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists calculos_escritorio_idx on public.calculos (escritorio_id, status, atualizado_em desc);
drop trigger if exists calculos_atualizado_em on public.calculos;
create trigger calculos_atualizado_em before update on public.calculos for each row execute function app.set_atualizado_em();

create table if not exists public.calculo_itens (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  calculo_id uuid not null references public.calculos(id) on delete cascade,
  ordem int not null,
  descricao text not null,
  data_inicial date not null,
  valor_original numeric(14,2) not null,
  valor_corrigido numeric(14,2),
  juros numeric(14,2),
  total numeric(14,2),
  unique (calculo_id, ordem)
);

alter table public.calculos enable row level security;
alter table public.calculo_itens enable row level security;
drop policy if exists tenant_isolamento on public.calculos;
create policy tenant_isolamento on public.calculos for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists tenant_isolamento on public.calculo_itens;
create policy tenant_isolamento on public.calculo_itens for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists calculos_sigilo on public.calculos;
create policy calculos_sigilo on public.calculos as restrictive for all to authenticated using (processo_id is null or app.pode_ver_sigiloso(processo_id));
drop policy if exists calculos_status_so_rpc on public.calculos;
create policy calculos_status_so_rpc on public.calculos as restrictive for update to authenticated
  using (true)
  with check (status in ('rascunho', 'rejeitado') or app.eh_service_role());
grant select, insert, update, delete on public.calculos, public.calculo_itens to authenticated;
grant all on public.calculos, public.calculo_itens to service_role;

do $$
declare t text;
begin
  foreach t in array array['calculos', 'calculo_itens'] loop
    execute format('drop policy if exists mfa_obrigatorio on public.%I', t);
    execute format('create policy mfa_obrigatorio on public.%I as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita())', t);
  end loop;
end
$$;

-- Envio para aprovação (advogado ou sócio), com a aprovação do objeto 'calculo'
create or replace function public.calculo_enviar_aprovacao(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare c public.calculos; v_aprovacao uuid;
begin
  if not app.mfa_satisfeita() then raise exception 'Segundo fator obrigatório' using errcode = '42501'; end if;
  if not app.eh_advogado_ou_socio() then raise exception 'Apenas advogado ou sócio envia cálculo para aprovação' using errcode = '42501'; end if;
  select * into c from public.calculos where id = p_id and escritorio_id = app.escritorio_atual() for update;
  if not found then raise exception 'Cálculo não encontrado' using errcode = 'P0002'; end if;
  if c.resultado is null then raise exception 'Calcule antes de enviar' using errcode = '55000'; end if;
  v_aprovacao := public.criar_aprovacao('calculo', c.id, jsonb_build_object('titulo', c.titulo, 'regra', c.regra_codigo, 'total', c.resultado -> 'totais' -> 'total'), null, 'usuario');
  update public.calculos set status = 'aguardando_aprovacao', aprovacao_id = v_aprovacao where id = c.id;
  return v_aprovacao;
end
$$;
revoke execute on function public.calculo_enviar_aprovacao(uuid) from public, anon;
grant execute on function public.calculo_enviar_aprovacao(uuid) to authenticated, service_role;

-- Efeito da decisão (decidir_aprovacao → app.aplicar_efeito_aprovacao, migration 0024)
create or replace function app.efeito_aprovacao_calculo(a public.aprovacoes)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if a.status = 'aprovada' then
    update public.calculos set status = 'aprovado' where id = a.objeto_id and status = 'aguardando_aprovacao';
  elsif a.status in ('rejeitada', 'ajustada') then
    update public.calculos set status = 'rejeitado', aprovacao_id = null where id = a.objeto_id and status = 'aguardando_aprovacao';
  end if;
end
$$;

-- Séries do BCB: importação idempotente (job importar-indices, service role)
create or replace function public.indices_ultimo_mes(p_indice public.indice_economico)
returns date
language sql
stable
set search_path = ''
as $$
  select max(competencia) from ref.indices_economicos where indice = p_indice
$$;
grant execute on function public.indices_ultimo_mes(public.indice_economico) to authenticated, service_role;
