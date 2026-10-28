-- 0005: clientes, processos, partes, colaboradores, fases do kanban e movimentações

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_pessoa') then
    create type public.tipo_pessoa as enum ('fisica', 'juridica');
  end if;
  if not exists (select 1 from pg_type where typname = 'polo') then
    create type public.polo as enum ('ativo', 'passivo', 'terceiro', 'outro');
  end if;
  if not exists (select 1 from pg_type where typname = 'processo_status') then
    create type public.processo_status as enum ('ativo', 'suspenso', 'arquivado', 'baixado');
  end if;
  if not exists (select 1 from pg_type where typname = 'sistema_processual') then
    create type public.sistema_processual as enum ('pje', 'projudi', 'eproc', 'esaj', 'outro');
  end if;
  if not exists (select 1 from pg_type where typname = 'origem_movimentacao') then
    create type public.origem_movimentacao as enum ('datajud', 'pje', 'manual');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_relacao_processo') then
    create type public.tipo_relacao_processo as enum ('agravo', 'cumprimento', 'incidente', 'recurso', 'apenso', 'outro');
  end if;
  if not exists (select 1 from pg_type where typname = 'competencia') then
    create type public.competencia as enum ('vara_comum', 'juizado_especial', 'segundo_grau', 'outra');
  end if;
end
$$;

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  tipo_pessoa public.tipo_pessoa not null default 'fisica',
  nome text not null,
  cpf_cnpj text,
  email text,
  telefone_e164 text,
  endereco jsonb,
  observacoes text,
  ativo boolean not null default true,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists clientes_documento_unq on public.clientes (escritorio_id, cpf_cnpj) where cpf_cnpj is not null;
create index if not exists clientes_nome_trgm on public.clientes using gin (nome gin_trgm_ops);
create index if not exists clientes_escritorio_idx on public.clientes (escritorio_id, ativo);
drop trigger if exists clientes_atualizado_em on public.clientes;
create trigger clientes_atualizado_em before update on public.clientes for each row execute function app.set_atualizado_em();

create table if not exists public.fases_kanban (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null,
  ordem int not null,
  cor text,
  codigos_tpu int[] not null default '{}',
  ativa boolean not null default true,
  unique (escritorio_id, nome)
);

create table if not exists public.processos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  numero_cnj char(20) not null check (app.cnj_valido(numero_cnj)),
  numero_cnj_mascara text generated always as (app.cnj_mascara(numero_cnj)) stored,
  tribunal_id uuid references ref.tribunais(id),
  comarca_id uuid references ref.comarcas(id),
  competencia public.competencia not null default 'vara_comum',
  orgao_julgador_codigo text,
  orgao_julgador_nome text,
  grau text,
  classe_codigo int,
  classe_nome text,
  sistema public.sistema_processual not null default 'pje',
  data_ajuizamento date,
  valor_causa numeric(16,2),
  segredo_justica boolean not null default false,
  nivel_sigilo smallint,
  status public.processo_status not null default 'ativo',
  fase_id uuid references public.fases_kanban(id),
  fase_sugerida_id uuid references public.fases_kanban(id),
  fase_confirmada_por uuid,
  fase_confirmada_em timestamptz,
  responsavel_id uuid,
  processo_relacionado_id uuid references public.processos(id),
  tipo_relacao public.tipo_relacao_processo,
  datajud_ultima_sincronizacao timestamptz,
  datajud_ultima_atualizacao timestamptz,
  datajud_indisponivel boolean not null default false,
  observacoes text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (escritorio_id, numero_cnj)
);
create index if not exists processos_escritorio_status_idx on public.processos (escritorio_id, status);
create index if not exists processos_responsavel_idx on public.processos (escritorio_id, responsavel_id);
create index if not exists processos_numero_idx on public.processos (numero_cnj);
drop trigger if exists processos_atualizado_em on public.processos;
create trigger processos_atualizado_em before update on public.processos for each row execute function app.set_atualizado_em();

create table if not exists public.processo_assuntos (
  processo_id uuid not null references public.processos(id) on delete cascade,
  codigo_tpu int not null,
  nome text,
  primary key (processo_id, codigo_tpu)
);

create table if not exists public.processo_partes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  nome text not null,
  polo public.polo not null default 'outro',
  cliente_id uuid references public.clientes(id) on delete set null,
  eh_cliente boolean not null default false,
  documento text,
  origem text not null default 'manual',
  criado_em timestamptz not null default now()
);
create index if not exists processo_partes_processo_idx on public.processo_partes (processo_id);
create index if not exists processo_partes_nome_trgm on public.processo_partes using gin (nome gin_trgm_ops);
create index if not exists processo_partes_cliente_idx on public.processo_partes (escritorio_id, cliente_id);

create table if not exists public.processo_colaboradores (
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  usuario_id uuid not null,
  primary key (processo_id, usuario_id)
);
create index if not exists processo_colaboradores_usuario_idx on public.processo_colaboradores (escritorio_id, usuario_id);

create table if not exists public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  origem public.origem_movimentacao not null,
  codigo_tpu int,
  nome text not null,
  complemento text,
  data timestamptz not null,
  id_externo text,
  payload jsonb,
  criado_em timestamptz not null default now(),
  unique (processo_id, origem, id_externo)
);
create index if not exists movimentacoes_processo_data_idx on public.movimentacoes (processo_id, data desc);

-- Quem pode agir num processo: responsável, colaborador ou sócio
create or replace function app.pode_agir_no_processo(p_processo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.processos p
     where p.id = p_processo_id
       and p.escritorio_id = app.escritorio_atual()
       and (
         app.eh_socio()
         or (app.papel_atual() = 'advogado' and (
           p.responsavel_id = app.usuario_atual()
           or exists (select 1 from public.processo_colaboradores c where c.processo_id = p.id and c.usuario_id = app.usuario_atual())
         ))
       )
  )
$$;

-- Quem pode ver o texto de um processo sigiloso
create or replace function app.pode_ver_sigiloso(p_processo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.processos p
     where p.id = p_processo_id
       and p.escritorio_id = app.escritorio_atual()
       and (
         not p.segredo_justica
         or app.eh_socio()
         or (app.papel_atual() = 'advogado' and (
           p.responsavel_id = app.usuario_atual()
           or exists (select 1 from public.processo_colaboradores c where c.processo_id = p.id and c.usuario_id = app.usuario_atual())
         ))
       )
  )
$$;

-- RLS padrão de tenant
alter table public.clientes enable row level security;
alter table public.fases_kanban enable row level security;
alter table public.processos enable row level security;
alter table public.processo_assuntos enable row level security;
alter table public.processo_partes enable row level security;
alter table public.processo_colaboradores enable row level security;
alter table public.movimentacoes enable row level security;

drop policy if exists tenant_isolamento on public.clientes;
create policy tenant_isolamento on public.clientes for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists tenant_isolamento on public.fases_kanban;
create policy tenant_isolamento on public.fases_kanban for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists tenant_isolamento on public.processos;
create policy tenant_isolamento on public.processos for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists tenant_isolamento on public.processo_assuntos;
create policy tenant_isolamento on public.processo_assuntos for all to authenticated
  using (exists (select 1 from public.processos p where p.id = processo_id and p.escritorio_id = app.escritorio_atual()))
  with check (exists (select 1 from public.processos p where p.id = processo_id and p.escritorio_id = app.escritorio_atual()));
drop policy if exists tenant_isolamento on public.processo_partes;
create policy tenant_isolamento on public.processo_partes for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists tenant_isolamento on public.processo_colaboradores;
create policy tenant_isolamento on public.processo_colaboradores for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists tenant_isolamento on public.movimentacoes;
create policy tenant_isolamento on public.movimentacoes for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());

-- Estagiário não cria nem edita processo e cliente; só advogado, sócio e administrativo
drop policy if exists processos_escrita_papel on public.processos;
create policy processos_escrita_papel on public.processos as restrictive for insert to authenticated with check (app.papel_atual() in ('socio', 'advogado', 'administrativo'));
drop policy if exists processos_update_papel on public.processos;
create policy processos_update_papel on public.processos as restrictive for update to authenticated using (app.papel_atual() in ('socio', 'advogado', 'administrativo'));
drop policy if exists clientes_escrita_papel on public.clientes;
create policy clientes_escrita_papel on public.clientes as restrictive for insert to authenticated with check (app.papel_atual() in ('socio', 'advogado', 'administrativo'));
drop policy if exists clientes_update_papel on public.clientes;
create policy clientes_update_papel on public.clientes as restrictive for update to authenticated using (app.papel_atual() in ('socio', 'advogado', 'administrativo'));

-- Marcar sigilo: só advogado e sócio (via RPC para registrar quem e quando)
create or replace function public.marcar_sigilo(p_processo_id uuid, p_sigiloso boolean, p_nivel int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.eh_advogado_ou_socio() then
    raise exception 'Apenas advogado ou sócio pode alterar o sigilo do processo' using errcode = '42501';
  end if;
  update public.processos
     set segredo_justica = p_sigiloso, nivel_sigilo = p_nivel::smallint
   where id = p_processo_id and escritorio_id = app.escritorio_atual();
  if not found then
    raise exception 'Processo não encontrado' using errcode = 'P0002';
  end if;
end
$$;

grant select, insert, update, delete on public.clientes, public.fases_kanban, public.processos, public.processo_assuntos, public.processo_partes, public.processo_colaboradores, public.movimentacoes to authenticated;
grant all on public.clientes, public.fases_kanban, public.processos, public.processo_assuntos, public.processo_partes, public.processo_colaboradores, public.movimentacoes to service_role;
grant execute on function public.marcar_sigilo(uuid, boolean, int) to authenticated;
