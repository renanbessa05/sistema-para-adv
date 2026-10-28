-- 0007: atos padrão, prazos, eventos de prazo e RPCs de transição
--
-- Toda mudança de estado de prazo passa por RPC security definer (docs/regras/estados.md): o UPDATE direto por
-- `authenticated` não é concedido (sem grant) e ainda é negado por policy restritiva. INSERT direto (lançamento
-- manual) só por advogado/sócio e sempre em 'sugerido': a confirmação, que cria a tarefa, vem por confirmar_prazo.
-- Quem decide prazo: sócio, advogado responsável ou colaborador do processo (app.pode_agir_no_processo).
-- Estagiário e administrativo nunca (Lei 8.906/94, art. 3º, §2º).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'prazo_origem') then
    create type public.prazo_origem as enum ('publicacao_djen', 'pje_manual', 'email_manual', 'domicilio_eletronico', 'audiencia', 'decisao', 'manual');
  end if;
  if not exists (select 1 from pg_type where typname = 'prazo_tipo') then
    create type public.prazo_tipo as enum ('processual', 'material', 'interno');
  end if;
  if not exists (select 1 from pg_type where typname = 'contagem') then
    create type public.contagem as enum ('dias_uteis', 'dias_corridos', 'horas');
  end if;
  if not exists (select 1 from pg_type where typname = 'prazo_status') then
    create type public.prazo_status as enum ('sugerido', 'confirmado', 'rejeitado', 'cumprido', 'vencido', 'suspenso', 'prorrogado', 'cancelado');
  end if;
  if not exists (select 1 from pg_type where typname = 'cumprimento_evidencia') then
    create type public.cumprimento_evidencia as enum ('tarefa', 'manual', 'datajud', 'pje');
  end if;
end
$$;

-- Atos com prazo padrão, por escritório (Configurações → Atos; só sócio edita)
create table if not exists public.atos_prazo (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null,
  sinonimos text[] not null default '{}',
  dias int not null check (dias > 0),
  contagem public.contagem not null default 'dias_uteis',
  dobro_padrao boolean not null default false,
  dias_seguranca int not null default 2 check (dias_seguranca >= 0),
  fundamento_legal text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (escritorio_id, nome)
);
create index if not exists atos_prazo_escritorio_idx on public.atos_prazo (escritorio_id, ativo);
drop trigger if exists atos_prazo_atualizado_em on public.atos_prazo;
create trigger atos_prazo_atualizado_em before update on public.atos_prazo for each row execute function app.set_atualizado_em();

create table if not exists public.prazos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  publicacao_id uuid references public.publicacoes(id) on delete set null,
  origem public.prazo_origem not null default 'manual',
  tipo public.prazo_tipo not null default 'processual',
  contagem public.contagem not null default 'dias_uteis',
  ato_id uuid references public.atos_prazo(id) on delete set null,
  ato_descricao text,
  quantidade int check (quantidade is null or quantidade > 0),
  multiplicador smallint not null default 1 check (multiplicador >= 1),
  fundamento_dobro text,
  data_disponibilizacao date,
  data_publicacao date,
  data_inicio_contagem date,
  data_final date not null,
  hora_limite time not null default '23:59:59',
  timezone_juizo text not null default 'America/Cuiaba',
  data_interna date,
  data_sugerida_ia date,
  data_confirmada date,
  memoria_calculo jsonb,
  calendario_incompleto boolean not null default false,
  calendario_reconhecido_por uuid,
  status public.prazo_status not null default 'sugerido',
  motivo_rejeicao text,
  confirmado_por uuid,
  confirmado_em timestamptz,
  cumprido_em timestamptz,
  cumprido_por uuid,
  cumprimento_evidencia public.cumprimento_evidencia,
  responsavel_id uuid,
  ia_execucao_id uuid,                               -- FK para ia_execucoes entra na migration que cria a tabela
  motivo_cancelamento text,
  observacoes text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists prazos_escritorio_status_final_idx on public.prazos (escritorio_id, status, data_final);
create index if not exists prazos_escritorio_responsavel_final_idx on public.prazos (escritorio_id, responsavel_id, data_final);
create index if not exists prazos_escritorio_processo_idx on public.prazos (escritorio_id, processo_id);
create index if not exists prazos_publicacao_idx on public.prazos (publicacao_id);
drop trigger if exists prazos_atualizado_em on public.prazos;
create trigger prazos_atualizado_em before update on public.prazos for each row execute function app.set_atualizado_em();

create table if not exists public.prazos_eventos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  prazo_id uuid not null references public.prazos(id) on delete cascade,
  tipo text not null,                                -- criado, confirmado, rejeitado, suspenso, prorrogado, cumprido, vencido, cancelado
  de_status public.prazo_status,
  para_status public.prazo_status,
  usuario_id uuid,                                   -- nulo = sistema
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists prazos_eventos_prazo_idx on public.prazos_eventos (prazo_id, criado_em);
create index if not exists prazos_eventos_escritorio_idx on public.prazos_eventos (escritorio_id, criado_em desc);

-- Dia útil forense simplificado (para a data interna): exclui fim de semana, feriados de ref.feriados
-- (nacionais, do tribunal e da comarca, quando suspendem prazo) e o recesso de 20/12 a 20/01 (CPC art. 220).
-- A contagem oficial dos prazos é do motor em src/lib/prazos; esta função só recua os dias de segurança.
create or replace function app.dia_util(p_data date, p_tribunal_id uuid, p_comarca_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select extract(isodow from p_data) < 6
     and not ((extract(month from p_data) = 12 and extract(day from p_data) >= 20) or (extract(month from p_data) = 1 and extract(day from p_data) <= 20))
     and not exists (
       select 1 from ref.feriados f
        where f.data = p_data
          and f.suspende_prazo
          and (f.tribunal_id is null or f.tribunal_id = p_tribunal_id)
          and (f.comarca_id is null or f.comarca_id = p_comarca_id)
     )
$$;

create or replace function app.subtrair_dias_uteis(p_data date, p_dias int, p_tribunal_id uuid, p_comarca_id uuid)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  d date := p_data;
  restantes int := coalesce(p_dias, 0);
begin
  while restantes > 0 loop
    d := d - 1;
    if app.dia_util(d, p_tribunal_id, p_comarca_id) then
      restantes := restantes - 1;
    end if;
  end loop;
  return d;
end
$$;

-- Data interna = data final menos N dias úteis de segurança (do ato; senão, do escritório)
create or replace function app.calcular_data_interna(p_prazo public.prazos)
returns date
language sql
stable
set search_path = ''
as $$
  select app.subtrair_dias_uteis(
    p_prazo.data_final,
    coalesce((select a.dias_seguranca from public.atos_prazo a where a.id = p_prazo.ato_id),
             (select e.dias_seguranca_padrao from public.escritorios e where e.id = p_prazo.escritorio_id), 2),
    pr.tribunal_id, pr.comarca_id)
    from public.processos pr where pr.id = p_prazo.processo_id
$$;

-- Atos padrão (docs/regras/prazos.md, tabela 4). Idempotente: não sobrescreve ato já editado pelo escritório.
create or replace function app.criar_atos_padrao(p_escritorio_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.atos_prazo (escritorio_id, nome, sinonimos, dias, contagem, dobro_padrao, dias_seguranca, fundamento_legal)
  values
    (p_escritorio_id, 'Contestação', '{"contestar","resposta do réu","apresentar defesa"}', 15, 'dias_uteis', false, 2, 'CPC, art. 335'),
    (p_escritorio_id, 'Réplica', '{"impugnação à contestação","manifestação sobre a contestação","réplica à contestação"}', 15, 'dias_uteis', false, 2, 'CPC, arts. 350 e 351'),
    (p_escritorio_id, 'Manifestação', '{"manifestação genérica","manifestar-se","manifeste-se","dizer o que de direito"}', 5, 'dias_uteis', false, 2, 'CPC, art. 218, §3º'),
    (p_escritorio_id, 'Embargos de declaração', '{"embargos declaratórios","aclaratórios"}', 5, 'dias_uteis', false, 2, 'CPC, art. 1.023'),
    (p_escritorio_id, 'Apelação', '{"recurso de apelação","apelar"}', 15, 'dias_uteis', false, 2, 'CPC, art. 1.003, §5º, e art. 1.009'),
    (p_escritorio_id, 'Agravo de instrumento', '{"agravo","agravar"}', 15, 'dias_uteis', false, 2, 'CPC, art. 1.003, §5º, e art. 1.015'),
    (p_escritorio_id, 'Contrarrazões', '{"contrarrazões de apelação","contrarrazões ao recurso","responder ao recurso"}', 15, 'dias_uteis', false, 2, 'CPC, art. 1.003, §5º, e art. 1.010, §1º'),
    (p_escritorio_id, 'Impugnação ao cumprimento de sentença', '{"impugnação","impugnar o cumprimento"}', 15, 'dias_uteis', false, 2, 'CPC, art. 525'),
    (p_escritorio_id, 'Embargos à execução', '{"embargar a execução","embargos do devedor"}', 15, 'dias_uteis', false, 2, 'CPC, art. 915'),
    (p_escritorio_id, 'Pagamento voluntário', '{"cumprimento voluntário da sentença","pagar o débito","efetuar o pagamento"}', 15, 'dias_uteis', false, 2, 'CPC, art. 523')
  on conflict (escritorio_id, nome) do nothing;
end
$$;

create or replace function app.criar_atos_padrao_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.criar_atos_padrao(new.id);
  return new;
end
$$;
drop trigger if exists escritorios_criar_atos_padrao on public.escritorios;
create trigger escritorios_criar_atos_padrao after insert on public.escritorios for each row execute function app.criar_atos_padrao_trigger();

-- Escritórios já existentes recebem os atos padrão
select app.criar_atos_padrao(e.id) from public.escritorios e;

-- Evento "(criado) → sugerido" ao gravar o prazo
create or replace function app.registrar_prazo_criado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.prazos_eventos (escritorio_id, prazo_id, tipo, de_status, para_status, usuario_id, dados)
  values (new.escritorio_id, new.id, 'criado', null, new.status, app.usuario_atual(),
          jsonb_build_object('origem', new.origem, 'data_final', new.data_final, 'data_interna', new.data_interna, 'calendario_incompleto', new.calendario_incompleto));
  return new;
end
$$;
drop trigger if exists prazos_registrar_criado on public.prazos;
create trigger prazos_registrar_criado after insert on public.prazos for each row execute function app.registrar_prazo_criado();

-- Carrega o prazo do escritório atual e exige poder agir no processo (sócio, advogado responsável ou colaborador)
create or replace function app.prazo_para_decisao(p_id uuid, p_acao text)
returns public.prazos
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pz public.prazos;
begin
  select * into pz from public.prazos p where p.id = p_id and p.escritorio_id = app.escritorio_atual();
  if not found then
    raise exception 'Prazo não encontrado' using errcode = 'P0002';
  end if;
  if not app.pode_agir_no_processo(pz.processo_id) then
    raise exception 'Apenas o advogado responsável, colaborador ou sócio pode % o prazo', p_acao using errcode = '42501';
  end if;
  return pz;
end
$$;

-- Quando todos os prazos sugeridos de uma publicação foram decididos, a publicação passa a 'tratada' (sistema)
create or replace function app.publicacao_tratada_se_prazos_decididos(p_publicacao_id uuid, p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pub record;
begin
  if p_publicacao_id is null then
    return;
  end if;
  select id, escritorio_id, status into pub from public.publicacoes where id = p_publicacao_id;
  if not found or pub.status <> 'com_prazo_sugerido' then
    return;
  end if;
  if exists (select 1 from public.prazos pz where pz.publicacao_id = p_publicacao_id and pz.status = 'sugerido') then
    return;
  end if;
  update public.publicacoes set status = 'tratada', tratada_em = now(), tratada_por = coalesce(tratada_por, p_usuario) where id = pub.id;
  insert into public.publicacao_eventos (escritorio_id, publicacao_id, de_status, para_status, usuario_id, dados)
  values (pub.escritorio_id, pub.id, 'com_prazo_sugerido', 'tratada', p_usuario, jsonb_build_object('sistema', true, 'motivo', 'todos os prazos sugeridos foram decididos'));
end
$$;

-- sugerido | suspenso | prorrogado → confirmado. Pode trocar ato, multiplicador e data final antes.
-- Se a data final mudar, a sugerida fica guardada em data_sugerida_ia e a data interna é recalculada.
create or replace function public.confirmar_prazo(
  p_id uuid,
  p_data_final date default null,
  p_ato_id uuid default null,
  p_multiplicador int default null,
  p_reconhecer_calendario boolean default false,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pz public.prazos;
  ato public.atos_prazo;
  nova_final date;
  nova_interna date;
  data_anterior date;
begin
  pz := app.prazo_para_decisao(p_id, 'confirmar');
  if pz.status not in ('sugerido', 'suspenso', 'prorrogado') then
    raise exception 'Transição de prazo não permitida: % → confirmado', pz.status using errcode = '42501';
  end if;
  if pz.calendario_incompleto and not coalesce(p_reconhecer_calendario, false) then
    raise exception 'Prazo com calendário incompleto: é preciso reconhecer o aviso para confirmar' using errcode = 'P0001';
  end if;
  if p_multiplicador is not null and p_multiplicador < 1 then
    raise exception 'Multiplicador inválido' using errcode = '22023';
  end if;

  if p_ato_id is not null then
    select * into ato from public.atos_prazo a where a.id = p_ato_id and a.escritorio_id = pz.escritorio_id;
    if not found then
      raise exception 'Ato não encontrado no escritório' using errcode = 'P0002';
    end if;
  end if;

  data_anterior := pz.data_final;
  nova_final := coalesce(p_data_final, pz.data_final);
  pz.data_final := nova_final;
  pz.ato_id := coalesce(p_ato_id, pz.ato_id);
  if nova_final <> data_anterior or pz.data_interna is null or p_ato_id is not null then
    nova_interna := app.calcular_data_interna(pz);
  else
    nova_interna := pz.data_interna;
  end if;

  update public.prazos p
     set status = 'confirmado',
         data_final = nova_final,
         data_interna = nova_interna,
         data_sugerida_ia = coalesce(p.data_sugerida_ia, data_anterior),   -- a data que o sistema sugeriu, para medir o acerto da IA
         data_confirmada = nova_final,
         ato_id = coalesce(p_ato_id, p.ato_id),
         ato_descricao = coalesce(ato.nome, p.ato_descricao),
         quantidade = coalesce(ato.dias, p.quantidade),
         contagem = coalesce(ato.contagem, p.contagem),
         multiplicador = coalesce(p_multiplicador::smallint, p.multiplicador),
         confirmado_por = app.usuario_atual(),
         confirmado_em = now(),
         calendario_reconhecido_por = case when p.calendario_incompleto then app.usuario_atual() else p.calendario_reconhecido_por end,
         observacoes = coalesce(p_observacao, p.observacoes)
   where p.id = pz.id;

  insert into public.prazos_eventos (escritorio_id, prazo_id, tipo, de_status, para_status, usuario_id, dados)
  values (pz.escritorio_id, pz.id, 'confirmado', pz.status, 'confirmado', app.usuario_atual(),
          jsonb_build_object('data_anterior', data_anterior, 'data_final', nova_final, 'data_interna', nova_interna,
                             'ato_id', coalesce(p_ato_id, pz.ato_id), 'multiplicador', coalesce(p_multiplicador, pz.multiplicador),
                             'reconheceu_calendario', pz.calendario_incompleto and p_reconhecer_calendario, 'observacao', p_observacao));

  perform app.publicacao_tratada_se_prazos_decididos(pz.publicacao_id, app.usuario_atual());
end
$$;

-- sugerido → rejeitado, com motivo
create or replace function public.rejeitar_prazo(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pz public.prazos;
begin
  pz := app.prazo_para_decisao(p_id, 'rejeitar');
  if pz.status <> 'sugerido' then
    raise exception 'Transição de prazo não permitida: % → rejeitado', pz.status using errcode = '42501';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Rejeitar prazo exige motivo' using errcode = '22023';
  end if;
  update public.prazos set status = 'rejeitado', motivo_rejeicao = p_motivo where id = pz.id;
  insert into public.prazos_eventos (escritorio_id, prazo_id, tipo, de_status, para_status, usuario_id, dados)
  values (pz.escritorio_id, pz.id, 'rejeitado', pz.status, 'rejeitado', app.usuario_atual(), jsonb_build_object('motivo', p_motivo));
  perform app.publicacao_tratada_se_prazos_decididos(pz.publicacao_id, app.usuario_atual());
end
$$;

-- confirmado → suspenso | prorrogado, com nova data (obrigatória na prorrogação) e fundamento
create or replace function public.suspender_ou_prorrogar_prazo(p_id uuid, p_novo_status public.prazo_status, p_nova_data date default null, p_fundamento text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pz public.prazos;
  nova_interna date;
  data_anterior date;
begin
  if p_novo_status not in ('suspenso', 'prorrogado') then
    raise exception 'Novo status deve ser suspenso ou prorrogado' using errcode = '22023';
  end if;
  pz := app.prazo_para_decisao(p_id, case when p_novo_status = 'suspenso' then 'suspender' else 'prorrogar' end);
  if pz.status <> 'confirmado' then
    raise exception 'Transição de prazo não permitida: % → %', pz.status, p_novo_status using errcode = '42501';
  end if;
  if nullif(btrim(p_fundamento), '') is null then
    raise exception 'Suspender ou prorrogar exige fundamento (ato normativo ou decisão)' using errcode = '22023';
  end if;
  if p_novo_status = 'prorrogado' and p_nova_data is null then
    raise exception 'Prorrogar exige a nova data final' using errcode = '22023';
  end if;
  if p_nova_data is not null and p_nova_data < pz.data_final then
    raise exception 'A nova data final não pode ser anterior à atual' using errcode = '22023';
  end if;

  data_anterior := pz.data_final;
  if p_nova_data is not null then
    pz.data_final := p_nova_data;
    nova_interna := app.calcular_data_interna(pz);
  end if;

  update public.prazos p
     set status = p_novo_status,
         data_final = coalesce(p_nova_data, p.data_final),
         data_interna = coalesce(nova_interna, p.data_interna)
   where p.id = pz.id;

  insert into public.prazos_eventos (escritorio_id, prazo_id, tipo, de_status, para_status, usuario_id, dados)
  values (pz.escritorio_id, pz.id, p_novo_status::text, pz.status, p_novo_status, app.usuario_atual(),
          jsonb_build_object('fundamento', p_fundamento, 'data_anterior', data_anterior, 'data_final', pz.data_final, 'data_interna', coalesce(nova_interna, pz.data_interna)));
end
$$;

-- confirmado | prorrogado | vencido → cumprido. Pelo advogado/sócio (manual), pela tarefa (concluir_tarefa) ou por job (datajud, pje).
create or replace function public.cumprir_prazo(p_id uuid, p_evidencia public.cumprimento_evidencia default 'manual')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pz public.prazos;
begin
  if app.eh_service_role() then
    select * into pz from public.prazos p where p.id = p_id;
    if not found then
      raise exception 'Prazo não encontrado' using errcode = 'P0002';
    end if;
  else
    pz := app.prazo_para_decisao(p_id, 'cumprir');
  end if;
  if pz.status not in ('confirmado', 'prorrogado', 'vencido') then
    raise exception 'Transição de prazo não permitida: % → cumprido', pz.status using errcode = '42501';
  end if;
  update public.prazos
     set status = 'cumprido', cumprido_em = now(), cumprido_por = app.usuario_atual(), cumprimento_evidencia = coalesce(p_evidencia, 'manual')
   where id = pz.id;
  insert into public.prazos_eventos (escritorio_id, prazo_id, tipo, de_status, para_status, usuario_id, dados)
  values (pz.escritorio_id, pz.id, 'cumprido', pz.status, 'cumprido', app.usuario_atual(), jsonb_build_object('evidencia', coalesce(p_evidencia, 'manual')));
end
$$;

-- confirmado | prorrogado | vencido → cancelado, com motivo
create or replace function public.cancelar_prazo(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pz public.prazos;
begin
  pz := app.prazo_para_decisao(p_id, 'cancelar');
  if pz.status not in ('confirmado', 'prorrogado', 'vencido') then
    raise exception 'Transição de prazo não permitida: % → cancelado', pz.status using errcode = '42501';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Cancelar prazo exige motivo' using errcode = '22023';
  end if;
  update public.prazos set status = 'cancelado', motivo_cancelamento = p_motivo where id = pz.id;
  insert into public.prazos_eventos (escritorio_id, prazo_id, tipo, de_status, para_status, usuario_id, dados)
  values (pz.escritorio_id, pz.id, 'cancelado', pz.status, 'cancelado', app.usuario_atual(), jsonb_build_object('motivo', p_motivo));
end
$$;

-- Job diário (0h05 local): confirmado | prorrogado com data_final < hoje → vencido. Só service role. Devolve quantos venceram.
create or replace function public.marcar_prazos_vencidos(p_hoje date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if not app.eh_service_role() then
    raise exception 'Apenas o sistema marca prazos vencidos' using errcode = '42501';
  end if;
  with candidatos as (
    select c.id, c.escritorio_id, c.status
      from public.prazos c
     where c.status in ('confirmado', 'prorrogado')
       and c.data_final < p_hoje
     for update
  ), vencidos as (
    update public.prazos p
       set status = 'vencido'
      from candidatos c
     where p.id = c.id
    returning c.id, c.escritorio_id, c.status as de_status
  ), eventos as (
    insert into public.prazos_eventos (escritorio_id, prazo_id, tipo, de_status, para_status, usuario_id, dados)
    select v.escritorio_id, v.id, 'vencido', v.de_status, 'vencido', null, jsonb_build_object('hoje', p_hoje, 'sistema', true) from vencidos v
    returning 1
  )
  select count(*) into n from eventos;
  return coalesce(n, 0);
end
$$;

-- RLS
alter table public.atos_prazo enable row level security;
alter table public.prazos enable row level security;
alter table public.prazos_eventos enable row level security;

drop policy if exists tenant_isolamento on public.atos_prazo;
create policy tenant_isolamento on public.atos_prazo for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists atos_prazo_escrita_socio on public.atos_prazo;
create policy atos_prazo_escrita_socio on public.atos_prazo as restrictive for insert to authenticated with check (app.eh_socio());
drop policy if exists atos_prazo_update_socio on public.atos_prazo;
create policy atos_prazo_update_socio on public.atos_prazo as restrictive for update to authenticated using (app.eh_socio());
drop policy if exists atos_prazo_delete_socio on public.atos_prazo;
create policy atos_prazo_delete_socio on public.atos_prazo as restrictive for delete to authenticated using (app.eh_socio());

drop policy if exists tenant_isolamento on public.prazos;
create policy tenant_isolamento on public.prazos for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
-- Lançamento manual: advogado ou sócio, sempre em 'sugerido' (a confirmação vem pela RPC e cria a tarefa)
drop policy if exists prazos_insert_papel on public.prazos;
create policy prazos_insert_papel on public.prazos as restrictive for insert to authenticated
  with check (app.eh_advogado_ou_socio() and status = 'sugerido');
-- Nenhum UPDATE direto por usuário: toda mudança passa pelas RPCs (além disso, não há grant de update)
drop policy if exists prazos_sem_update_direto on public.prazos;
create policy prazos_sem_update_direto on public.prazos as restrictive for update to authenticated using (false);

drop policy if exists tenant_isolamento on public.prazos_eventos;
create policy tenant_isolamento on public.prazos_eventos for select to authenticated using (escritorio_id = app.escritorio_atual());

grant select, insert, update, delete on public.atos_prazo to authenticated;
grant select, insert on public.prazos to authenticated;
grant select on public.prazos_eventos to authenticated;
grant all on public.atos_prazo, public.prazos, public.prazos_eventos to service_role;

grant execute on function public.confirmar_prazo(uuid, date, uuid, int, boolean, text) to authenticated, service_role;
grant execute on function public.rejeitar_prazo(uuid, text) to authenticated, service_role;
grant execute on function public.suspender_ou_prorrogar_prazo(uuid, public.prazo_status, date, text) to authenticated, service_role;
grant execute on function public.cumprir_prazo(uuid, public.cumprimento_evidencia) to authenticated, service_role;
grant execute on function public.cancelar_prazo(uuid, text) to authenticated, service_role;
revoke execute on function public.marcar_prazos_vencidos(date) from public, anon, authenticated;
grant execute on function public.marcar_prazos_vencidos(date) to service_role;
