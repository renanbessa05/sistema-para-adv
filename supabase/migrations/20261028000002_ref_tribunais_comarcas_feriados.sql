-- 0002: dados de referência globais (sem escritorio_id)

create table if not exists ref.tribunais (
  id uuid primary key default gen_random_uuid(),
  sigla text not null unique,                 -- 'TJMT'
  codigo_cnj text not null unique,            -- '8.11'
  segmento smallint not null,                 -- 8
  codigo_tr text not null,                    -- '11'
  nome text not null,
  uf char(2),
  timezone text not null default 'America/Cuiaba',
  sistema_eletronico text not null default 'pje',
  url_consulta text,
  criado_em timestamptz not null default now()
);

create table if not exists ref.comarcas (
  id uuid primary key default gen_random_uuid(),
  tribunal_id uuid not null references ref.tribunais(id),
  nome text not null,
  codigo_ibge text,                           -- município-sede
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (tribunal_id, nome)
);
create index if not exists comarcas_ibge_idx on ref.comarcas (codigo_ibge);

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'abrangencia_feriado' and n.nspname = 'ref') then
    create type ref.abrangencia_feriado as enum ('nacional', 'estadual', 'municipal', 'forense', 'recesso', 'suspensao_ad_hoc');
  end if;
end
$$;

create table if not exists ref.feriados (
  id uuid primary key default gen_random_uuid(),
  tribunal_id uuid references ref.tribunais(id),   -- nulo = nacional (vale para todos)
  comarca_id uuid references ref.comarcas(id),     -- nulo = todo o tribunal
  data date not null,
  descricao text not null,
  abrangencia ref.abrangencia_feriado not null,
  suspende_prazo boolean not null default true,
  ato_normativo text,
  url_fonte text,
  conferido boolean not null default false,        -- conferido contra a Portaria do ano
  criado_por uuid,
  criado_em timestamptz not null default now(),
  constraint feriado_municipal_tem_comarca check (abrangencia <> 'municipal' or comarca_id is not null),
  unique (tribunal_id, comarca_id, data, descricao)
);
create index if not exists feriados_data_idx on ref.feriados (data);
create index if not exists feriados_tribunal_data_idx on ref.feriados (tribunal_id, data);

-- Controle de quais anos do calendário forense foram carregados e conferidos, por tribunal
create table if not exists ref.calendario_anos (
  tribunal_id uuid not null references ref.tribunais(id),
  ano smallint not null,
  conferido boolean not null default false,
  ato_normativo text,
  url_fonte text,
  observacoes text,
  atualizado_em timestamptz not null default now(),
  primary key (tribunal_id, ano)
);

-- Tabelas Processuais Unificadas (movimentos), para mapear fase do kanban
create table if not exists ref.tpu_movimentos (
  codigo int primary key,
  nome text not null,
  pai_codigo int,
  natureza text
);

-- Preços de IA por modelo, versionados (US$ por milhão de tokens)
create table if not exists ref.ia_precos (
  id uuid primary key default gen_random_uuid(),
  modelo text not null,
  vigencia_inicio date not null,
  vigencia_fim date,
  input_por_mtok numeric(10,4) not null,
  output_por_mtok numeric(10,4) not null,
  cache_write_por_mtok numeric(10,4),
  cache_read_por_mtok numeric(10,4),
  observacao text,
  fonte_url text,
  unique (modelo, vigencia_inicio)
);

-- RLS: leitura para usuários autenticados; escrita só pela service role (rotinas e ações administrativas)
alter table ref.tribunais enable row level security;
alter table ref.comarcas enable row level security;
alter table ref.feriados enable row level security;
alter table ref.calendario_anos enable row level security;
alter table ref.tpu_movimentos enable row level security;
alter table ref.ia_precos enable row level security;

drop policy if exists ref_leitura on ref.tribunais;
create policy ref_leitura on ref.tribunais for select to authenticated using (true);
drop policy if exists ref_leitura on ref.comarcas;
create policy ref_leitura on ref.comarcas for select to authenticated using (true);
drop policy if exists ref_leitura on ref.feriados;
create policy ref_leitura on ref.feriados for select to authenticated using (true);
drop policy if exists ref_leitura on ref.calendario_anos;
create policy ref_leitura on ref.calendario_anos for select to authenticated using (true);
drop policy if exists ref_leitura on ref.tpu_movimentos;
create policy ref_leitura on ref.tpu_movimentos for select to authenticated using (true);
drop policy if exists ref_leitura on ref.ia_precos;
create policy ref_leitura on ref.ia_precos for select to authenticated using (true);

grant select on all tables in schema ref to anon, authenticated;
grant all on all tables in schema ref to service_role;
alter default privileges in schema ref grant select on tables to anon, authenticated;
alter default privileges in schema ref grant all on tables to service_role;
