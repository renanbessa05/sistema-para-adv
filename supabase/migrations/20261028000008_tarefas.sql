-- 0008: tarefas, eventos de tarefa, baseline de minutos por tipo, RPCs e views (atrasadas, críticas)
--
-- Regras (docs/regras/estados.md e permissoes.md): tarefa nasce 'a_fazer'; executor, responsável ou sócio movem
-- para 'em_andamento' e 'pronta_para_revisao'; só advogado e sócio concluem (administrativo conclui tarefa
-- administrativa sem prazo ligado); estagiário para em 'pronta_para_revisao'. Mudança de executor e de status
-- passa por RPC; o UPDATE direto só alcança campos descritivos (título, descrição, prioridade, vencimento).
-- Ao confirmar um prazo pela primeira vez, o trigger cria a tarefa 'protocolar' com vencimento = data interna.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tarefa_tipo') then
    create type public.tarefa_tipo as enum ('protocolar', 'redigir', 'revisar', 'audiencia', 'contato_cliente', 'diligencia', 'conferencia_pje', 'outro');
  end if;
  if not exists (select 1 from pg_type where typname = 'tarefa_origem') then
    create type public.tarefa_origem as enum ('prazo', 'publicacao', 'audiencia', 'whatsapp', 'manual', 'ia', 'sistema');
  end if;
  if not exists (select 1 from pg_type where typname = 'tarefa_status') then
    create type public.tarefa_status as enum ('a_fazer', 'em_andamento', 'pronta_para_revisao', 'concluida', 'cancelada');
  end if;
  if not exists (select 1 from pg_type where typname = 'prioridade') then
    create type public.prioridade as enum ('baixa', 'normal', 'alta', 'critica');
  end if;
  if not exists (select 1 from pg_type where typname = 'tarefa_evento_tipo') then
    create type public.tarefa_evento_tipo as enum ('criada', 'reatribuida', 'status_alterado', 'comentario', 'vencimento_alterado');
  end if;
end
$$;

-- "Hoje" no fuso do escritório (glossário): nunca a data do servidor
create or replace function app.hoje_local(p_escritorio_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select app.hoje_no_fuso(coalesce((select e.timezone from public.escritorios e where e.id = p_escritorio_id), 'America/Cuiaba'))
$$;

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  processo_id uuid references public.processos(id) on delete set null,
  prazo_id uuid references public.prazos(id) on delete set null,
  publicacao_id uuid references public.publicacoes(id) on delete set null,
  titulo text not null check (btrim(titulo) <> ''),
  descricao text,
  tipo public.tarefa_tipo not null default 'outro',
  origem public.tarefa_origem not null default 'manual',
  criado_por_tipo text not null default 'usuario' check (criado_por_tipo in ('usuario', 'ia', 'sistema')),
  criado_por_id uuid,
  ia_execucao_id uuid,                               -- FK para ia_execucoes entra na migration que cria a tabela
  responsavel_id uuid,                               -- advogado que responde pela tarefa (em geral, o do processo)
  executor_id uuid,                                  -- quem faz
  vencimento date,                                   -- data interna quando ligada a prazo
  prioridade public.prioridade not null default 'normal',
  status public.tarefa_status not null default 'a_fazer',
  concluida_em timestamptz,
  concluida_por uuid,
  cancelada_motivo text,
  recorrencia jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists tarefas_escritorio_status_venc_idx on public.tarefas (escritorio_id, status, vencimento);
create index if not exists tarefas_escritorio_executor_idx on public.tarefas (escritorio_id, executor_id, status);
create index if not exists tarefas_escritorio_responsavel_idx on public.tarefas (escritorio_id, responsavel_id, status);
create index if not exists tarefas_escritorio_processo_idx on public.tarefas (escritorio_id, processo_id);
create index if not exists tarefas_prazo_idx on public.tarefas (prazo_id);
drop trigger if exists tarefas_atualizado_em on public.tarefas;
create trigger tarefas_atualizado_em before update on public.tarefas for each row execute function app.set_atualizado_em();

create table if not exists public.tarefa_eventos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  tipo public.tarefa_evento_tipo not null,
  de_usuario_id uuid,
  para_usuario_id uuid,
  usuario_id uuid,                                   -- quem fez; nulo = sistema
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists tarefa_eventos_tarefa_idx on public.tarefa_eventos (tarefa_id, criado_em);
create index if not exists tarefa_eventos_escritorio_idx on public.tarefa_eventos (escritorio_id, criado_em desc);

-- Minutos que a tarefa levaria sem o sistema (para a métrica de tempo economizado). escritorio_id nulo = baseline global.
-- Sem seed: os valores vêm do levantamento do escritório (a confirmar), nunca inventados aqui.
create table if not exists public.tipos_tarefa_baseline (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid references public.escritorios(id) on delete cascade,
  tipo public.tarefa_tipo not null,
  minutos_manual_estimados int not null check (minutos_manual_estimados > 0),
  fonte_estimativa text,
  vigencia_inicio date not null default current_date,
  criado_em timestamptz not null default now()
);
create unique index if not exists tipos_tarefa_baseline_unq on public.tipos_tarefa_baseline (coalesce(escritorio_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo, vigencia_inicio);

-- Tarefa "administrativa" (que o administrativo pode reatribuir e concluir): sem prazo ligado e de tipo não jurídico. (a confirmar)
create or replace function app.tarefa_eh_administrativa(p_tarefa public.tarefas)
returns boolean
language sql
immutable
as $$
  select p_tarefa.prazo_id is null and p_tarefa.tipo in ('contato_cliente', 'diligencia', 'conferencia_pje', 'outro')
$$;

create or replace function app.membro_ativo(p_escritorio_id uuid, p_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.escritorio_membros m where m.escritorio_id = p_escritorio_id and m.usuario_id = p_usuario_id and m.ativo)
$$;

-- Eventos automáticos: 'criada' no insert; 'vencimento_alterado' quando o vencimento muda por UPDATE direto
create or replace function app.registrar_tarefa_criada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tarefa_eventos (escritorio_id, tarefa_id, tipo, para_usuario_id, usuario_id, dados)
  values (new.escritorio_id, new.id, 'criada', new.executor_id, app.usuario_atual(),
          jsonb_build_object('origem', new.origem, 'tipo', new.tipo, 'vencimento', new.vencimento, 'prazo_id', new.prazo_id, 'criado_por_tipo', new.criado_por_tipo));
  return new;
end
$$;
drop trigger if exists tarefas_registrar_criada on public.tarefas;
create trigger tarefas_registrar_criada after insert on public.tarefas for each row execute function app.registrar_tarefa_criada();

create or replace function app.registrar_tarefa_vencimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vencimento is distinct from old.vencimento then
    insert into public.tarefa_eventos (escritorio_id, tarefa_id, tipo, usuario_id, dados)
    values (new.escritorio_id, new.id, 'vencimento_alterado', app.usuario_atual(), jsonb_build_object('de', old.vencimento, 'para', new.vencimento));
  end if;
  return new;
end
$$;
drop trigger if exists tarefas_registrar_vencimento on public.tarefas;
create trigger tarefas_registrar_vencimento after update of vencimento on public.tarefas for each row execute function app.registrar_tarefa_vencimento();

-- Prazo → tarefa: ao virar 'confirmado' pela primeira vez cria a tarefa 'protocolar'; prorrogação move o vencimento
-- das tarefas abertas ligadas; cancelamento do prazo cancela as tarefas abertas ligadas.
create or replace function app.sincronizar_tarefas_do_prazo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proc record;
  responsavel uuid;
begin
  if new.status = 'confirmado' and old.status is distinct from new.status
     and not exists (select 1 from public.tarefas t where t.prazo_id = new.id) then
    select p.responsavel_id, p.numero_cnj_mascara into proc from public.processos p where p.id = new.processo_id;
    responsavel := coalesce(new.responsavel_id, proc.responsavel_id, new.confirmado_por);
    insert into public.tarefas (escritorio_id, processo_id, prazo_id, publicacao_id, titulo, tipo, origem, criado_por_tipo, criado_por_id,
                                responsavel_id, executor_id, vencimento, prioridade, status)
    values (new.escritorio_id, new.processo_id, new.id, new.publicacao_id,
            coalesce(new.ato_descricao, 'Prazo') || ' — ' || coalesce(proc.numero_cnj_mascara, '(sem número)'),
            'protocolar', 'prazo', 'sistema', new.confirmado_por,
            responsavel, responsavel, coalesce(new.data_interna, new.data_final), 'alta', 'a_fazer');
  end if;

  if new.data_interna is distinct from old.data_interna and new.status in ('confirmado', 'prorrogado', 'suspenso') then
    update public.tarefas t
       set vencimento = coalesce(new.data_interna, new.data_final)
     where t.prazo_id = new.id and t.status not in ('concluida', 'cancelada');
  end if;

  if new.status = 'cancelado' and old.status is distinct from new.status then
    update public.tarefas t
       set status = 'cancelada', cancelada_motivo = coalesce('Prazo cancelado: ' || new.motivo_cancelamento, 'Prazo cancelado')
     where t.prazo_id = new.id and t.status not in ('concluida', 'cancelada');
    insert into public.tarefa_eventos (escritorio_id, tarefa_id, tipo, usuario_id, dados)
    select t.escritorio_id, t.id, 'status_alterado', app.usuario_atual(), jsonb_build_object('para', 'cancelada', 'motivo', 'prazo cancelado', 'prazo_id', new.id)
      from public.tarefas t where t.prazo_id = new.id and t.status = 'cancelada' and t.cancelada_motivo like 'Prazo cancelado%';
  end if;
  return new;
end
$$;
drop trigger if exists prazos_sincronizar_tarefas on public.prazos;
create trigger prazos_sincronizar_tarefas after update on public.prazos for each row execute function app.sincronizar_tarefas_do_prazo();

-- Carrega a tarefa do escritório atual
create or replace function app.tarefa_do_escritorio(p_id uuid)
returns public.tarefas
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.tarefas;
begin
  select * into t from public.tarefas x where x.id = p_id and x.escritorio_id = app.escritorio_atual();
  if not found then
    raise exception 'Tarefa não encontrada' using errcode = 'P0002';
  end if;
  return t;
end
$$;

-- Criar tarefa (qualquer papel; estagiário só para si). Também é possível inserir direto, sob as mesmas policies.
create or replace function public.criar_tarefa(
  p_titulo text,
  p_tipo public.tarefa_tipo default 'outro',
  p_processo_id uuid default null,
  p_prazo_id uuid default null,
  p_publicacao_id uuid default null,
  p_descricao text default null,
  p_executor_id uuid default null,
  p_responsavel_id uuid default null,
  p_vencimento date default null,
  p_prioridade public.prioridade default 'normal',
  p_origem public.tarefa_origem default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  esc uuid := app.escritorio_atual();
  usuario uuid := app.usuario_atual();
  executor uuid := coalesce(p_executor_id, usuario);
  responsavel uuid;
  novo_id uuid;
begin
  if esc is null or usuario is null then
    raise exception 'Usuário sem escritório' using errcode = '42501';
  end if;
  if app.papel_atual() = 'estagiario' and executor <> usuario then
    raise exception 'Estagiário só cria tarefa para si' using errcode = '42501';
  end if;
  if not app.membro_ativo(esc, executor) then
    raise exception 'Executor não é membro ativo do escritório' using errcode = '22023';
  end if;
  if p_processo_id is not null and not exists (select 1 from public.processos p where p.id = p_processo_id and p.escritorio_id = esc) then
    raise exception 'Processo não encontrado' using errcode = 'P0002';
  end if;
  if p_prazo_id is not null and not exists (select 1 from public.prazos p where p.id = p_prazo_id and p.escritorio_id = esc) then
    raise exception 'Prazo não encontrado' using errcode = 'P0002';
  end if;
  if p_publicacao_id is not null and not exists (select 1 from public.publicacoes p where p.id = p_publicacao_id and p.escritorio_id = esc) then
    raise exception 'Publicação não encontrada' using errcode = 'P0002';
  end if;
  responsavel := coalesce(p_responsavel_id, (select p.responsavel_id from public.processos p where p.id = p_processo_id), usuario);

  insert into public.tarefas (escritorio_id, processo_id, prazo_id, publicacao_id, titulo, descricao, tipo, origem, criado_por_tipo, criado_por_id,
                              responsavel_id, executor_id, vencimento, prioridade, status)
  values (esc, p_processo_id, p_prazo_id, p_publicacao_id, p_titulo, p_descricao, p_tipo, coalesce(p_origem, 'manual'), 'usuario', usuario,
          responsavel, executor, p_vencimento, coalesce(p_prioridade, 'normal'), 'a_fazer')
  returning id into novo_id;
  return novo_id;
end
$$;

-- Reatribuir: sócio; responsável; o próprio executor; administrativo em tarefa administrativa. Estagiário nunca.
create or replace function public.reatribuir_tarefa(p_id uuid, p_para_usuario uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tarefas;
  papel text := app.papel_atual();
  usuario uuid := app.usuario_atual();
begin
  t := app.tarefa_do_escritorio(p_id);
  if t.status in ('concluida', 'cancelada') then
    raise exception 'Tarefa % não pode ser reatribuída', t.status using errcode = '42501';
  end if;
  if papel = 'estagiario' then
    raise exception 'Estagiário não reatribui tarefa' using errcode = '42501';
  end if;
  if not (
    app.eh_socio()
    or (papel = 'advogado' and (t.responsavel_id = usuario or t.executor_id = usuario))
    or (papel = 'administrativo' and (t.executor_id = usuario or app.tarefa_eh_administrativa(t)))
  ) then
    raise exception 'Apenas o responsável, o executor ou um sócio pode reatribuir a tarefa' using errcode = '42501';
  end if;
  if p_para_usuario is null or not app.membro_ativo(t.escritorio_id, p_para_usuario) then
    raise exception 'Novo executor não é membro ativo do escritório' using errcode = '22023';
  end if;
  if p_para_usuario = t.executor_id then
    return;
  end if;
  update public.tarefas set executor_id = p_para_usuario where id = t.id;
  insert into public.tarefa_eventos (escritorio_id, tarefa_id, tipo, de_usuario_id, para_usuario_id, usuario_id, dados)
  values (t.escritorio_id, t.id, 'reatribuida', t.executor_id, p_para_usuario, usuario, jsonb_build_object('motivo', p_motivo));
end
$$;

-- a_fazer → em_andamento → pronta_para_revisao (executor, responsável ou sócio). Para concluir ou cancelar, use as RPCs próprias.
create or replace function public.alterar_status_tarefa(p_id uuid, p_status public.tarefa_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tarefas;
  usuario uuid := app.usuario_atual();
begin
  if p_status = 'concluida' then
    perform public.concluir_tarefa(p_id, false);
    return;
  end if;
  if p_status = 'cancelada' then
    raise exception 'Cancelar tarefa exige motivo: use cancelar_tarefa' using errcode = '22023';
  end if;
  t := app.tarefa_do_escritorio(p_id);
  if not (app.eh_socio() or t.executor_id = usuario or t.responsavel_id = usuario) then
    raise exception 'Apenas o executor, o responsável ou um sócio pode mover a tarefa' using errcode = '42501';
  end if;
  if not ((t.status = 'a_fazer' and p_status = 'em_andamento') or (t.status = 'em_andamento' and p_status = 'pronta_para_revisao')) then
    raise exception 'Transição de tarefa não permitida: % → %', t.status, p_status using errcode = '42501';
  end if;
  update public.tarefas set status = p_status where id = t.id;
  insert into public.tarefa_eventos (escritorio_id, tarefa_id, tipo, usuario_id, dados)
  values (t.escritorio_id, t.id, 'status_alterado', usuario, jsonb_build_object('de', t.status, 'para', p_status));
end
$$;

-- Concluir: advogado e sócio; administrativo só tarefa administrativa; estagiário nunca (para em pronta_para_revisao).
-- Com p_protocolado e prazo ligado em aberto, cumpre o prazo com evidência 'tarefa' (exige poder agir no processo).
create or replace function public.concluir_tarefa(p_id uuid, p_protocolado boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tarefas;
  papel text := app.papel_atual();
  usuario uuid := app.usuario_atual();
  prazo_status public.prazo_status;
begin
  t := app.tarefa_do_escritorio(p_id);
  if papel = 'estagiario' then
    raise exception 'Estagiário não conclui tarefa: envie para revisão (pronta_para_revisao)' using errcode = '42501';
  end if;
  if not (app.eh_advogado_ou_socio() or (papel = 'administrativo' and app.tarefa_eh_administrativa(t))) then
    raise exception 'Apenas advogado ou sócio conclui esta tarefa' using errcode = '42501';
  end if;
  if t.status not in ('a_fazer', 'em_andamento', 'pronta_para_revisao') then
    raise exception 'Transição de tarefa não permitida: % → concluida', t.status using errcode = '42501';
  end if;

  update public.tarefas set status = 'concluida', concluida_em = now(), concluida_por = usuario where id = t.id;
  insert into public.tarefa_eventos (escritorio_id, tarefa_id, tipo, usuario_id, dados)
  values (t.escritorio_id, t.id, 'status_alterado', usuario, jsonb_build_object('de', t.status, 'para', 'concluida', 'protocolado', coalesce(p_protocolado, false)));

  if coalesce(p_protocolado, false) and t.prazo_id is not null then
    select status into prazo_status from public.prazos where id = t.prazo_id;
    if prazo_status in ('confirmado', 'prorrogado', 'vencido') then
      perform public.cumprir_prazo(t.prazo_id, 'tarefa');
    end if;
  end if;
end
$$;

-- Cancelar: advogado e sócio, com motivo (administrativo em tarefa administrativa)
create or replace function public.cancelar_tarefa(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tarefas;
  papel text := app.papel_atual();
begin
  t := app.tarefa_do_escritorio(p_id);
  if not (app.eh_advogado_ou_socio() or (papel = 'administrativo' and app.tarefa_eh_administrativa(t))) then
    raise exception 'Apenas advogado ou sócio cancela tarefa' using errcode = '42501';
  end if;
  if t.status in ('concluida', 'cancelada') then
    raise exception 'Transição de tarefa não permitida: % → cancelada', t.status using errcode = '42501';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Cancelar tarefa exige motivo' using errcode = '22023';
  end if;
  update public.tarefas set status = 'cancelada', cancelada_motivo = p_motivo where id = t.id;
  insert into public.tarefa_eventos (escritorio_id, tarefa_id, tipo, usuario_id, dados)
  values (t.escritorio_id, t.id, 'status_alterado', app.usuario_atual(), jsonb_build_object('de', t.status, 'para', 'cancelada', 'motivo', p_motivo));
end
$$;

-- Views (security_invoker: a RLS de tarefas e escritorios vale para quem consulta). "Hoje" no fuso do escritório.
create or replace view public.tarefas_atrasadas with (security_invoker = true) as
  select t.*, app.hoje_no_fuso(e.timezone) as hoje_local
    from public.tarefas t
    join public.escritorios e on e.id = t.escritorio_id
   where t.status not in ('concluida', 'cancelada')
     and t.vencimento is not null
     and t.vencimento < app.hoje_no_fuso(e.timezone);

create or replace view public.tarefas_criticas with (security_invoker = true) as
  select t.*, p.data_final as prazo_data_final, p.status as prazo_status, app.hoje_no_fuso(e.timezone) as hoje_local
    from public.tarefas t
    join public.escritorios e on e.id = t.escritorio_id
    join public.prazos p on p.id = t.prazo_id
   where t.status not in ('concluida', 'cancelada')
     and p.status not in ('cumprido', 'cancelado', 'rejeitado')
     and p.data_final <= app.hoje_no_fuso(e.timezone);

-- RLS
alter table public.tarefas enable row level security;
alter table public.tarefa_eventos enable row level security;
alter table public.tipos_tarefa_baseline enable row level security;

drop policy if exists tenant_isolamento on public.tarefas;
create policy tenant_isolamento on public.tarefas for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
-- Criar: qualquer papel, sempre em 'a_fazer'; estagiário só para si
drop policy if exists tarefas_insert_papel on public.tarefas;
create policy tarefas_insert_papel on public.tarefas as restrictive for insert to authenticated
  with check (status = 'a_fazer' and (app.papel_atual() <> 'estagiario' or executor_id = app.usuario_atual()));
-- Editar campos descritivos: sócio, responsável, executor ou quem criou (executor e status mudam por RPC)
drop policy if exists tarefas_update_papel on public.tarefas;
create policy tarefas_update_papel on public.tarefas as restrictive for update to authenticated
  using (app.eh_socio() or responsavel_id = app.usuario_atual() or executor_id = app.usuario_atual() or criado_por_id = app.usuario_atual());

drop policy if exists tenant_isolamento on public.tarefa_eventos;
create policy tenant_isolamento on public.tarefa_eventos for select to authenticated using (escritorio_id = app.escritorio_atual());

drop policy if exists baseline_select on public.tipos_tarefa_baseline;
create policy baseline_select on public.tipos_tarefa_baseline for select to authenticated using (escritorio_id is null or escritorio_id = app.escritorio_atual());
drop policy if exists baseline_escrita_socio on public.tipos_tarefa_baseline;
create policy baseline_escrita_socio on public.tipos_tarefa_baseline for all to authenticated
  using (escritorio_id = app.escritorio_atual() and app.eh_socio()) with check (escritorio_id = app.escritorio_atual() and app.eh_socio());

grant select, insert on public.tarefas to authenticated;
grant update (titulo, descricao, tipo, prioridade, vencimento, processo_id, publicacao_id, recorrencia) on public.tarefas to authenticated;
grant select on public.tarefa_eventos to authenticated;
grant select, insert, update, delete on public.tipos_tarefa_baseline to authenticated;
grant select on public.tarefas_atrasadas, public.tarefas_criticas to authenticated;
grant all on public.tarefas, public.tarefa_eventos, public.tipos_tarefa_baseline to service_role;
grant select on public.tarefas_atrasadas, public.tarefas_criticas to service_role;

grant execute on function public.criar_tarefa(text, public.tarefa_tipo, uuid, uuid, uuid, text, uuid, uuid, date, public.prioridade, public.tarefa_origem) to authenticated, service_role;
grant execute on function public.reatribuir_tarefa(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.alterar_status_tarefa(uuid, public.tarefa_status) to authenticated, service_role;
grant execute on function public.concluir_tarefa(uuid, boolean) to authenticated, service_role;
grant execute on function public.cancelar_tarefa(uuid, text) to authenticated, service_role;
