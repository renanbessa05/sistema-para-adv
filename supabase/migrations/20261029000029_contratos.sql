-- 0029: contratos de honorários, parcelas e aditivos (Fase 2, lote 3; T1.37 do escopo)
--
-- Fluxo (skill contratacao-e-honorarios): rascunho (diagnóstico pela IA + cálculo pelo código) →
-- aguardando_confirmacao (a advogada confirma valor E modalidade; parada obrigatória) → documentos gerados →
-- aguardando_aprovacao (entra em aprovacoes como objeto 'contrato') → aprovado → assinado. Rejeitada volta a
-- rascunho; ajustada volta a rascunho com os ajustes gravados. Parcelas e aditivos (P3) ficam aqui também.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'contrato_modalidade') then
    create type public.contrato_modalidade as enum ('fixo', 'exito', 'misto', 'fixo_parcelado');
  end if;
  if not exists (select 1 from pg_type where typname = 'contrato_status') then
    create type public.contrato_status as enum ('rascunho', 'aguardando_confirmacao', 'confirmado', 'aguardando_aprovacao', 'aprovado', 'assinado', 'cancelado');
  end if;
  if not exists (select 1 from pg_type where typname = 'nivel_complexidade') then
    create type public.nivel_complexidade as enum ('baixa', 'media', 'alta');
  end if;
  if not exists (select 1 from pg_type where typname = 'contrato_via') then
    create type public.contrato_via as enum ('judicial', 'extrajudicial');
  end if;
  if not exists (select 1 from pg_type where typname = 'contatos_procuracao') then
    create type public.contatos_procuracao as enum ('cliente', 'escritorio', 'nenhum');
  end if;
  if not exists (select 1 from pg_type where typname = 'parcela_status') then
    create type public.parcela_status as enum ('pendente', 'paga', 'atrasada', 'cancelada');
  end if;
end
$$;

create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  processo_id uuid references public.processos(id) on delete set null,
  demanda_em_curso boolean not null default false,
  via public.contrato_via not null default 'judicial',
  polo text,
  relato text,
  objeto text,
  natureza text,
  fase text,
  parte_contraria text,
  juizo text,
  complexidade public.nivel_complexidade,
  complexidade_justificativa text,
  proveito_economico numeric(14,2),
  rubricas text[] not null default '{}',
  cautelar_satisfativa boolean not null default false,
  diagnostico jsonb,
  calculo jsonb,
  tabela_honorarios_id uuid references ref.tabelas_honorarios(id),
  modalidade public.contrato_modalidade,
  valor_fixo numeric(14,2),
  percentual_exito numeric(5,2),
  parcelas int check (parcelas is null or parcelas >= 1),
  primeira_parcela_em date,
  dia_vencimento int check (dia_vencimento is null or (dia_vencimento between 1 and 28)),
  gratuidade boolean not null default false,
  poderes_especiais text[] not null default '{}',
  contatos_procuracao public.contatos_procuracao not null default 'escritorio',
  qualificacao jsonb not null default '{}'::jsonb,
  foro_comarca text,
  documento_contrato_id uuid references public.documentos(id) on delete set null,
  documento_procuracao_id uuid references public.documentos(id) on delete set null,
  documento_declaracao_id uuid references public.documentos(id) on delete set null,
  aprovacao_id uuid references public.aprovacoes(id) on delete set null,
  ia_execucao_id uuid references public.ia_execucoes(id) on delete set null,
  status public.contrato_status not null default 'rascunho',
  confirmado_por uuid,
  confirmado_em timestamptz,
  assinado_em timestamptz,
  cancelado_motivo text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists contratos_escritorio_status_idx on public.contratos (escritorio_id, status, atualizado_em desc);
create index if not exists contratos_cliente_idx on public.contratos (escritorio_id, cliente_id);
drop trigger if exists contratos_atualizado_em on public.contratos;
create trigger contratos_atualizado_em before update on public.contratos for each row execute function app.set_atualizado_em();

create table if not exists public.contrato_parcelas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  numero int not null check (numero >= 1),
  vencimento date not null,
  valor numeric(14,2) not null check (valor >= 0),
  status public.parcela_status not null default 'pendente',
  paga_em date,
  comprovante_documento_id uuid references public.documentos(id) on delete set null,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (contrato_id, numero)
);
create index if not exists contrato_parcelas_vencimento_idx on public.contrato_parcelas (escritorio_id, status, vencimento);
drop trigger if exists contrato_parcelas_atualizado_em on public.contrato_parcelas;
create trigger contrato_parcelas_atualizado_em before update on public.contrato_parcelas for each row execute function app.set_atualizado_em();

create table if not exists public.contrato_aditivos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  descricao text not null,
  documento_id uuid references public.documentos(id) on delete set null,
  criado_por uuid,
  criado_em timestamptz not null default now()
);

-- RLS: isolamento por escritório; estagiário cria/edita rascunho mas não confirma nem aprova (RPCs checam)
alter table public.contratos enable row level security;
alter table public.contrato_parcelas enable row level security;
alter table public.contrato_aditivos enable row level security;
drop policy if exists tenant_isolamento on public.contratos;
create policy tenant_isolamento on public.contratos for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists tenant_isolamento on public.contrato_parcelas;
create policy tenant_isolamento on public.contrato_parcelas for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists tenant_isolamento on public.contrato_aditivos;
create policy tenant_isolamento on public.contrato_aditivos for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
-- Transições de status só pelas RPCs e pelo efeito de aprovação
drop policy if exists contratos_status_so_rpc on public.contratos;
create policy contratos_status_so_rpc on public.contratos as restrictive for update to authenticated
  using (true)
  with check (status in ('rascunho', 'aguardando_confirmacao') or app.eh_service_role());
grant select, insert, update, delete on public.contratos, public.contrato_parcelas, public.contrato_aditivos to authenticated;
grant all on public.contratos, public.contrato_parcelas, public.contrato_aditivos to service_role;

do $$
declare t text;
begin
  foreach t in array array['contratos', 'contrato_parcelas', 'contrato_aditivos'] loop
    execute format('drop policy if exists mfa_obrigatorio on public.%I', t);
    execute format('create policy mfa_obrigatorio on public.%I as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita())', t);
  end loop;
end
$$;

-- Parada obrigatória: a advogada confirma valor e modalidade (nunca o estagiário; nunca abaixo do piso, checado no código)
create or replace function public.contrato_confirmar_valor(
  p_id uuid,
  p_modalidade public.contrato_modalidade,
  p_valor_fixo numeric default null,
  p_percentual numeric default null,
  p_parcelas int default null,
  p_primeira_parcela_em date default null,
  p_dia_vencimento int default null
)
returns public.contratos
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos;
begin
  if not app.mfa_satisfeita() then raise exception 'Segundo fator obrigatório' using errcode = '42501'; end if;
  if not app.eh_advogado_ou_socio() then raise exception 'Apenas advogado ou sócio confirma valor e modalidade' using errcode = '42501'; end if;
  select * into c from public.contratos where id = p_id and escritorio_id = app.escritorio_atual() for update;
  if not found then raise exception 'Contrato não encontrado' using errcode = 'P0002'; end if;
  if c.status not in ('rascunho', 'aguardando_confirmacao', 'confirmado') then
    raise exception 'Contrato em % não aceita nova confirmação', c.status using errcode = '55000';
  end if;
  if p_modalidade in ('fixo', 'fixo_parcelado', 'misto') and (p_valor_fixo is null or p_valor_fixo <= 0) then
    raise exception 'Informe o valor fixo' using errcode = '22023';
  end if;
  if p_modalidade in ('exito', 'misto') and (p_percentual is null or p_percentual <= 0 or p_percentual > 100) then
    raise exception 'Informe o percentual de êxito (0 a 100)' using errcode = '22023';
  end if;
  update public.contratos
     set modalidade = p_modalidade,
         valor_fixo = case when p_modalidade in ('fixo', 'fixo_parcelado', 'misto') then p_valor_fixo else null end,
         percentual_exito = case when p_modalidade in ('exito', 'misto') then p_percentual else null end,
         parcelas = case when p_modalidade = 'fixo_parcelado' then coalesce(p_parcelas, 1) else null end,
         primeira_parcela_em = case when p_modalidade = 'fixo_parcelado' then p_primeira_parcela_em else null end,
         dia_vencimento = case when p_modalidade = 'fixo_parcelado' then p_dia_vencimento else null end,
         status = 'confirmado',
         confirmado_por = app.usuario_atual(),
         confirmado_em = now()
   where id = c.id
  returning * into c;
  return c;
end
$$;
revoke execute on function public.contrato_confirmar_valor(uuid, public.contrato_modalidade, numeric, numeric, int, date, int) from public, anon;
grant execute on function public.contrato_confirmar_valor(uuid, public.contrato_modalidade, numeric, numeric, int, date, int) to authenticated, service_role;

-- Envia para aprovação (exige documentos gerados) e cria a linha em aprovacoes
create or replace function public.contrato_enviar_aprovacao(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos;
  v_aprovacao uuid;
begin
  if not app.mfa_satisfeita() then raise exception 'Segundo fator obrigatório' using errcode = '42501'; end if;
  select * into c from public.contratos where id = p_id and escritorio_id = app.escritorio_atual() for update;
  if not found then raise exception 'Contrato não encontrado' using errcode = 'P0002'; end if;
  if c.status <> 'confirmado' then raise exception 'Confirme valor e modalidade antes de enviar para aprovação' using errcode = '55000'; end if;
  if c.documento_contrato_id is null or c.documento_procuracao_id is null then
    raise exception 'Gere o contrato e a procuração antes de enviar para aprovação' using errcode = '55000';
  end if;
  v_aprovacao := public.criar_aprovacao('contrato', c.id, jsonb_build_object(
    'cliente_id', c.cliente_id, 'objeto', c.objeto, 'modalidade', c.modalidade, 'valor_fixo', c.valor_fixo,
    'percentual_exito', c.percentual_exito, 'parcelas', c.parcelas, 'gratuidade', c.gratuidade, 'complexidade', c.complexidade), c.ia_execucao_id, 'usuario');
  update public.contratos set status = 'aguardando_aprovacao', aprovacao_id = v_aprovacao where id = c.id;
  return v_aprovacao;
end
$$;
revoke execute on function public.contrato_enviar_aprovacao(uuid) from public, anon;
grant execute on function public.contrato_enviar_aprovacao(uuid) to authenticated, service_role;

-- Efeito da decisão (chamado por decidir_aprovacao via app.aplicar_efeito_aprovacao, migration 0024)
create or replace function app.efeito_aprovacao_contrato(a public.aprovacoes)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if a.status = 'aprovada' then
    update public.contratos set status = 'aprovado' where id = a.objeto_id and status = 'aguardando_aprovacao';
  elsif a.status = 'rejeitada' then
    update public.contratos set status = 'rascunho', aprovacao_id = null where id = a.objeto_id and status = 'aguardando_aprovacao';
  elsif a.status = 'ajustada' then
    update public.contratos
       set status = 'rascunho',
           aprovacao_id = null,
           diagnostico = coalesce(diagnostico, '{}'::jsonb) || jsonb_build_object('ajustes_aprovacao', a.ajustes, 'ajustado_em', now())
     where id = a.objeto_id and status = 'aguardando_aprovacao';
  end if;
end
$$;

-- Assinatura registrada pela pessoa; gera as parcelas quando a modalidade for parcelada
create or replace function public.contrato_registrar_assinatura(p_id uuid, p_assinado_em date default current_date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contratos;
  i int;
  v_venc date;
begin
  if not app.mfa_satisfeita() then raise exception 'Segundo fator obrigatório' using errcode = '42501'; end if;
  if not app.eh_advogado_ou_socio() then raise exception 'Apenas advogado ou sócio registra assinatura' using errcode = '42501'; end if;
  select * into c from public.contratos where id = p_id and escritorio_id = app.escritorio_atual() for update;
  if not found then raise exception 'Contrato não encontrado' using errcode = 'P0002'; end if;
  if c.status <> 'aprovado' then raise exception 'Só contrato aprovado pode ser marcado como assinado' using errcode = '55000'; end if;
  update public.contratos set status = 'assinado', assinado_em = p_assinado_em where id = c.id;
  if c.modalidade = 'fixo_parcelado' and coalesce(c.parcelas, 0) >= 1 and c.valor_fixo is not null then
    for i in 1..c.parcelas loop
      v_venc := coalesce(c.primeira_parcela_em, p_assinado_em) + make_interval(months => i - 1);
      if c.dia_vencimento is not null then
        v_venc := make_date(extract(year from v_venc)::int, extract(month from v_venc)::int, c.dia_vencimento);
      end if;
      insert into public.contrato_parcelas (escritorio_id, contrato_id, numero, vencimento, valor)
      values (c.escritorio_id, c.id, i, v_venc, round(c.valor_fixo / c.parcelas, 2))
      on conflict (contrato_id, numero) do nothing;
    end loop;
  elsif c.modalidade in ('fixo', 'misto') and c.valor_fixo is not null then
    insert into public.contrato_parcelas (escritorio_id, contrato_id, numero, vencimento, valor)
    values (c.escritorio_id, c.id, 1, p_assinado_em, c.valor_fixo)
    on conflict (contrato_id, numero) do nothing;
  end if;
end
$$;
revoke execute on function public.contrato_registrar_assinatura(uuid, date) from public, anon;
grant execute on function public.contrato_registrar_assinatura(uuid, date) to authenticated, service_role;

-- Parcela paga / cancelada
create or replace function public.contrato_parcela_marcar(p_id uuid, p_status public.parcela_status, p_paga_em date default null, p_observacao text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.mfa_satisfeita() then raise exception 'Segundo fator obrigatório' using errcode = '42501'; end if;
  if coalesce(app.papel_atual(), '') not in ('socio', 'advogado', 'administrativo') then
    raise exception 'Estagiário não altera parcelas' using errcode = '42501';
  end if;
  update public.contrato_parcelas
     set status = p_status, paga_em = case when p_status = 'paga' then coalesce(p_paga_em, current_date) else null end, observacao = coalesce(p_observacao, observacao)
   where id = p_id and escritorio_id = app.escritorio_atual();
  if not found then raise exception 'Parcela não encontrada' using errcode = 'P0002'; end if;
end
$$;
revoke execute on function public.contrato_parcela_marcar(uuid, public.parcela_status, date, text) from public, anon;
grant execute on function public.contrato_parcela_marcar(uuid, public.parcela_status, date, text) to authenticated, service_role;
