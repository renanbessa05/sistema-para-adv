-- 0031: minutas em 6 etapas, varreduras dos autos e modelos de peça (Fase 2, lote 4; E3 do escopo)
--
-- Modo C da skill tjmt-peticoes como máquina de estados com dono: cada etapa (1 fatos, 2 teses, 3 provas,
-- 4 defesa contrária, 5 estratégia, 6 redação) é gerada pela IA, aprovada ou devolvida por advogado/sócio, e só
-- a 6ª produz a peça (versões em Markdown + .docx). A varredura (skill varredura-de-oportunidades) gera um
-- relatório de pontos em `analises`; os pontos aprovados alimentam uma minuta. Nada vai a protocolo sem passar
-- por `aprovacoes` (objeto 'minuta'), cujo efeito está em app.efeito_aprovacao_minuta.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'minuta_status') then
    create type public.minuta_status as enum ('rascunho', 'em_etapas', 'redigida', 'em_revisao_ia', 'aguardando_aprovacao', 'devolvida', 'aprovada', 'protocolada', 'arquivada', 'cancelada');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_peca') then
    create type public.tipo_peca as enum ('inicial', 'contestacao', 'replica', 'agravo_instrumento', 'apelacao', 'contrarrazoes', 'embargos_declaracao', 'cumprimento_sentenca', 'impugnacao', 'peticao_intermediaria', 'mandado_seguranca', 'outro');
  end if;
  if not exists (select 1 from pg_type where typname = 'area_direito') then
    create type public.area_direito as enum ('civel', 'empresarial', 'consumidor', 'administrativo_servidores', 'agrario_ambiental', 'familia_sucessoes', 'outra');
  end if;
  if not exists (select 1 from pg_type where typname = 'minuta_modo') then
    create type public.minuta_modo as enum ('A', 'B', 'C');
  end if;
  if not exists (select 1 from pg_type where typname = 'etapa_status') then
    create type public.etapa_status as enum ('gerada', 'aprovada', 'devolvida', 'pulada');
  end if;
  if not exists (select 1 from pg_type where typname = 'analise_tipo') then
    create type public.analise_tipo as enum ('varredura', 'mapa_julgador', 'camada_local');
  end if;
  if not exists (select 1 from pg_type where typname = 'analise_status') then
    create type public.analise_status as enum ('gerada', 'aprovada');
  end if;
end
$$;

create table if not exists public.modelos_peca (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  tipo_peca public.tipo_peca,
  area public.area_direito,
  nome text not null,
  documento_id uuid references public.documentos(id) on delete set null,
  estrutura_md text,
  ativo boolean not null default true,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists modelos_peca_escritorio_idx on public.modelos_peca (escritorio_id, ativo);
drop trigger if exists modelos_peca_atualizado_em on public.modelos_peca;
create trigger modelos_peca_atualizado_em before update on public.modelos_peca for each row execute function app.set_atualizado_em();

create table if not exists public.analises (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  processo_id uuid references public.processos(id) on delete set null,
  tipo public.analise_tipo not null,
  parametros jsonb not null default '{}'::jsonb,
  conteudo_md text,
  estruturado jsonb,
  ia_execucao_id uuid references public.ia_execucoes(id) on delete set null,
  status public.analise_status not null default 'gerada',
  pontos_aprovados int[] not null default '{}',
  minuta_id uuid,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists analises_escritorio_idx on public.analises (escritorio_id, tipo, criado_em desc);
create index if not exists analises_processo_idx on public.analises (escritorio_id, processo_id) where processo_id is not null;
drop trigger if exists analises_atualizado_em on public.analises;
create trigger analises_atualizado_em before update on public.analises for each row execute function app.set_atualizado_em();

create table if not exists public.minutas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  processo_id uuid references public.processos(id) on delete set null,
  prazo_id uuid references public.prazos(id) on delete set null,
  tarefa_id uuid references public.tarefas(id) on delete set null,
  analise_id uuid references public.analises(id) on delete set null,
  tipo_peca public.tipo_peca not null,
  area public.area_direito not null default 'civel',
  tribunal_id uuid references ref.tribunais(id),
  modelo_peca_id uuid references public.modelos_peca(id) on delete set null,
  titulo text not null,
  modo public.minuta_modo not null default 'C',
  intake jsonb not null default '{}'::jsonb,
  status public.minuta_status not null default 'rascunho',
  etapa_atual smallint not null default 1 check (etapa_atual between 1 and 6),
  versao_atual_id uuid,
  responsavel_id uuid,
  protocolo_numero text,
  protocolada_em timestamptz,
  aprovacao_id uuid references public.aprovacoes(id) on delete set null,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists minutas_escritorio_status_idx on public.minutas (escritorio_id, status, atualizado_em desc);
create index if not exists minutas_processo_idx on public.minutas (escritorio_id, processo_id) where processo_id is not null;
drop trigger if exists minutas_atualizado_em on public.minutas;
create trigger minutas_atualizado_em before update on public.minutas for each row execute function app.set_atualizado_em();

create table if not exists public.minuta_etapas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  minuta_id uuid not null references public.minutas(id) on delete cascade,
  numero smallint not null check (numero between 1 and 6),
  conteudo_md text not null default '',
  estruturado jsonb,
  ia_execucao_id uuid references public.ia_execucoes(id) on delete set null,
  status public.etapa_status not null default 'gerada',
  aprovada_por uuid,
  aprovada_em timestamptz,
  comentarios text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (minuta_id, numero)
);
drop trigger if exists minuta_etapas_atualizado_em on public.minuta_etapas;
create trigger minuta_etapas_atualizado_em before update on public.minuta_etapas for each row execute function app.set_atualizado_em();

create table if not exists public.minuta_versoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  minuta_id uuid not null references public.minutas(id) on delete cascade,
  numero int not null check (numero >= 1),
  autor_tipo public.solicitante_tipo not null default 'ia',
  autor_id uuid,
  ia_execucao_id uuid references public.ia_execucoes(id) on delete set null,
  conteudo_md text not null,
  documento_id uuid references public.documentos(id) on delete set null,
  citacoes jsonb not null default '[]'::jsonb,
  validacao jsonb not null default '{}'::jsonb,
  resumo_alteracoes text,
  criado_em timestamptz not null default now(),
  unique (minuta_id, numero)
);
alter table public.minutas drop constraint if exists minutas_versao_atual_fk;
alter table public.minutas add constraint minutas_versao_atual_fk foreign key (versao_atual_id) references public.minuta_versoes(id) on delete set null;
alter table public.analises drop constraint if exists analises_minuta_fk;
alter table public.analises add constraint analises_minuta_fk foreign key (minuta_id) references public.minutas(id) on delete set null;
alter table public.tarefas add column if not exists minuta_id uuid references public.minutas(id) on delete set null;

-- RLS
alter table public.modelos_peca enable row level security;
alter table public.analises enable row level security;
alter table public.minutas enable row level security;
alter table public.minuta_etapas enable row level security;
alter table public.minuta_versoes enable row level security;
do $$
declare t text;
begin
  foreach t in array array['modelos_peca', 'analises', 'minutas', 'minuta_etapas', 'minuta_versoes'] loop
    execute format('drop policy if exists tenant_isolamento on public.%I', t);
    execute format('create policy tenant_isolamento on public.%I for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual())', t);
    execute format('drop policy if exists mfa_obrigatorio on public.%I', t);
    execute format('create policy mfa_obrigatorio on public.%I as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end
$$;
-- Sigilo: minutas e análises de processo sigiloso só para quem pode ver o processo
drop policy if exists minutas_sigilo on public.minutas;
create policy minutas_sigilo on public.minutas as restrictive for all to authenticated using (processo_id is null or app.pode_ver_sigiloso(processo_id));
drop policy if exists analises_sigilo on public.analises;
create policy analises_sigilo on public.analises as restrictive for all to authenticated using (processo_id is null or app.pode_ver_sigiloso(processo_id));
-- Estados que só as RPCs (ou o efeito de aprovação) alcançam
drop policy if exists minutas_status_so_rpc on public.minutas;
create policy minutas_status_so_rpc on public.minutas as restrictive for update to authenticated
  using (true)
  with check (status in ('rascunho', 'em_etapas', 'redigida', 'em_revisao_ia', 'devolvida', 'arquivada', 'cancelada') or app.eh_service_role());
-- Modelos: só sócio e advogado criam/alteram
drop policy if exists modelos_peca_escrita on public.modelos_peca;
create policy modelos_peca_escrita on public.modelos_peca as restrictive for insert to authenticated with check (app.eh_advogado_ou_socio());

-- Etapas: aprovar, devolver, pular (advogado ou sócio)
create or replace function app.minuta_para_etapa(p_minuta uuid)
returns public.minutas
language plpgsql
stable
security definer
set search_path = ''
as $$
declare m public.minutas;
begin
  if not app.mfa_satisfeita() then raise exception 'Segundo fator obrigatório' using errcode = '42501'; end if;
  if not app.eh_advogado_ou_socio() then raise exception 'Apenas advogado ou sócio aprova etapas' using errcode = '42501'; end if;
  select * into m from public.minutas where id = p_minuta and escritorio_id = app.escritorio_atual();
  if not found then raise exception 'Minuta não encontrada' using errcode = 'P0002'; end if;
  if m.processo_id is not null and not app.pode_ver_sigiloso(m.processo_id) then raise exception 'Sem acesso ao processo sigiloso' using errcode = '42501'; end if;
  return m;
end
$$;

create or replace function public.minuta_aprovar_etapa(p_minuta uuid, p_numero int, p_comentario text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare m public.minutas; e public.minuta_etapas;
begin
  m := app.minuta_para_etapa(p_minuta);
  select * into e from public.minuta_etapas where minuta_id = m.id and numero = p_numero;
  if not found then raise exception 'Etapa % ainda não foi gerada', p_numero using errcode = 'P0002'; end if;
  if p_numero <> m.etapa_atual then raise exception 'A etapa atual é a %; aprove na ordem', m.etapa_atual using errcode = '55000'; end if;
  update public.minuta_etapas set status = 'aprovada', aprovada_por = app.usuario_atual(), aprovada_em = now(), comentarios = p_comentario where id = e.id;
  update public.minutas set etapa_atual = least(6, p_numero + 1), status = case when p_numero >= 6 then 'redigida' else 'em_etapas' end where id = m.id;
end
$$;
revoke execute on function public.minuta_aprovar_etapa(uuid, int, text) from public, anon;
grant execute on function public.minuta_aprovar_etapa(uuid, int, text) to authenticated, service_role;

create or replace function public.minuta_devolver_etapa(p_minuta uuid, p_numero int, p_comentario text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare m public.minutas;
begin
  m := app.minuta_para_etapa(p_minuta);
  if nullif(btrim(p_comentario), '') is null then raise exception 'Devolver exige comentário' using errcode = '22023'; end if;
  update public.minuta_etapas set status = 'devolvida', comentarios = p_comentario, aprovada_por = null, aprovada_em = null where minuta_id = m.id and numero = p_numero;
  if not found then raise exception 'Etapa % ainda não foi gerada', p_numero using errcode = 'P0002'; end if;
  update public.minutas set etapa_atual = p_numero, status = 'em_etapas' where id = m.id;
end
$$;
revoke execute on function public.minuta_devolver_etapa(uuid, int, text) from public, anon;
grant execute on function public.minuta_devolver_etapa(uuid, int, text) to authenticated, service_role;

-- Pular até a etapa N (registra as puladas; a skill manda registrar o que ficou sem checar)
create or replace function public.minuta_pular_etapas(p_minuta uuid, p_ate int, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare m public.minutas; i int;
begin
  m := app.minuta_para_etapa(p_minuta);
  if p_ate < m.etapa_atual or p_ate > 6 then raise exception 'Destino inválido' using errcode = '22023'; end if;
  for i in m.etapa_atual..(p_ate - 1) loop
    insert into public.minuta_etapas (escritorio_id, minuta_id, numero, conteudo_md, status, comentarios, aprovada_por, aprovada_em)
    values (m.escritorio_id, m.id, i, '', 'pulada', coalesce(p_motivo, 'pulada pela advogada'), app.usuario_atual(), now())
    on conflict (minuta_id, numero) do update set status = 'pulada', comentarios = excluded.comentarios, aprovada_por = excluded.aprovada_por, aprovada_em = excluded.aprovada_em;
  end loop;
  update public.minutas set etapa_atual = p_ate, status = 'em_etapas' where id = m.id;
end
$$;
revoke execute on function public.minuta_pular_etapas(uuid, int, text) from public, anon;
grant execute on function public.minuta_pular_etapas(uuid, int, text) to authenticated, service_role;

-- Envia a versão atual para aprovação; lacunas abertas exigem comentário justificando
create or replace function public.minuta_enviar_aprovacao(p_minuta uuid, p_comentario text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare m public.minutas; v public.minuta_versoes; lacunas int; aprovacao uuid;
begin
  m := app.minuta_para_etapa(p_minuta);
  if m.versao_atual_id is null then raise exception 'Redija a peça (etapa 6) antes de enviar' using errcode = '55000'; end if;
  if m.status not in ('redigida', 'devolvida', 'em_revisao_ia') then raise exception 'Minuta em % não pode ser enviada', m.status using errcode = '55000'; end if;
  select * into v from public.minuta_versoes where id = m.versao_atual_id;
  lacunas := coalesce((v.validacao ->> 'lacunas')::int, 0);
  if lacunas > 0 and nullif(btrim(p_comentario), '') is null then
    raise exception 'A peça tem % lacuna(s) [[VERIFICAR]]; preencha ou justifique no comentário', lacunas using errcode = '55000';
  end if;
  if coalesce(jsonb_array_length(v.validacao -> 'citacoes_sem_id'), 0) > 0 then
    raise exception 'A peça cita jurisprudência sem registro na base; remova ou confirme pela pesquisa' using errcode = '55000';
  end if;
  aprovacao := public.criar_aprovacao('minuta', m.id, jsonb_build_object('titulo', m.titulo, 'tipo_peca', m.tipo_peca, 'processo_id', m.processo_id, 'versao', v.numero, 'lacunas', lacunas, 'comentario', p_comentario), v.ia_execucao_id, 'usuario');
  update public.minutas set status = 'aguardando_aprovacao', aprovacao_id = aprovacao where id = m.id;
  return aprovacao;
end
$$;
revoke execute on function public.minuta_enviar_aprovacao(uuid, text) from public, anon;
grant execute on function public.minuta_enviar_aprovacao(uuid, text) to authenticated, service_role;

-- Efeito da decisão (decidir_aprovacao → app.aplicar_efeito_aprovacao)
create or replace function app.efeito_aprovacao_minuta(a public.aprovacoes)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare m public.minutas; v public.minuta_versoes; novo_md text; n int;
begin
  select * into m from public.minutas where id = a.objeto_id;
  if not found then return; end if;
  if a.status = 'aprovada' then
    update public.minutas set status = 'aprovada' where id = m.id;
  elsif a.status = 'rejeitada' then
    update public.minutas set status = 'devolvida', aprovacao_id = null where id = m.id;
  elsif a.status = 'ajustada' then
    novo_md := a.ajustes ->> 'conteudo_md';
    if novo_md is not null and m.versao_atual_id is not null then
      select * into v from public.minuta_versoes where id = m.versao_atual_id;
      select coalesce(max(numero), 0) + 1 into n from public.minuta_versoes where minuta_id = m.id;
      insert into public.minuta_versoes (escritorio_id, minuta_id, numero, autor_tipo, autor_id, conteudo_md, citacoes, validacao, resumo_alteracoes)
      values (m.escritorio_id, m.id, n, 'usuario', a.aprovador_id, novo_md, v.citacoes, jsonb_build_object('lacunas', 0, 'origem', 'ajuste_na_aprovacao'), coalesce(a.comentario, 'ajustada na aprovação'))
      returning id into v.id;
      update public.minutas set status = 'aprovada', versao_atual_id = v.id where id = m.id;
    else
      update public.minutas set status = 'aprovada' where id = m.id;
    end if;
  end if;
end
$$;

-- Protocolo registrado pela pessoa (fecha o ciclo; a tarefa 'protocolar' do prazo continua pelo fluxo de prazos)
create or replace function public.minuta_marcar_protocolada(p_minuta uuid, p_numero_protocolo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare m public.minutas;
begin
  m := app.minuta_para_etapa(p_minuta);
  if m.status <> 'aprovada' then raise exception 'Só minuta aprovada pode ser marcada como protocolada' using errcode = '55000'; end if;
  update public.minutas set status = 'protocolada', protocolo_numero = p_numero_protocolo, protocolada_em = now() where id = m.id;
end
$$;
revoke execute on function public.minuta_marcar_protocolada(uuid, text) from public, anon;
grant execute on function public.minuta_marcar_protocolada(uuid, text) to authenticated, service_role;
