-- 0016: MFA (TOTP) obrigatório para sócio e advogado (docs/escopo-revisado.md 1.3.2 e 2.1; docs/regras/permissoes.md "Segundo fator")
--
-- Como funciona: o Supabase Auth grava no JWT o claim `aal` ('aal1' = só senha/link; 'aal2' = senha + segundo fator).
-- app.mfa_satisfeita() lê esse claim e vira policy RESTRITIVA nas tabelas sensíveis e checagem nas RPCs de decisão:
-- sócio e advogado com fator verificado só enxergam e decidem com aal2. Quem ainda não cadastrou nenhum fator tem
-- carência (consegue entrar para cadastrar o primeiro). Estagiário e administrativo não são exigidos. Service role
-- (jobs, WhatsApp via whatsapp_executar) ignora, porque não é uma sessão de pessoa.
--
-- O Custom Access Token Hook (0004) parte de `event -> 'claims'` e só acrescenta escritorio_id/papel com jsonb_set,
-- então os claims originais do Auth (aal, amr, sub, role...) são preservados. Nada a corrigir ali.

create or replace function app.mfa_satisfeita()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.eh_service_role()
      or coalesce(app.papel_atual(), '') not in ('socio', 'advogado')
      or coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (
        select 1
          from auth.mfa_factors f
         where f.user_id = auth.uid()
           and f.status = 'verified'
      )
$$;
comment on function app.mfa_satisfeita() is
  'true quando o papel não exige MFA, quando a sessão é aal2, quando o usuário ainda não tem fator verificado (carência para cadastrar) ou quando é service role.';
grant execute on function app.mfa_satisfeita() to authenticated, service_role;

-- Policies restritivas: somam-se às permissivas já existentes (tenant_isolamento etc.). Não entram aqui
-- escritorios, escritorio_membros, usuario_telefones, escritorio_configuracoes e ref.*: o layout, a tela de
-- cadastro do fator e a sessão precisam deles antes do segundo fator.
do $$
declare
  t text;
begin
  foreach t in array array[
    'processos', 'processo_partes', 'movimentacoes', 'clientes',
    'publicacoes', 'publicacao_eventos',
    'prazos', 'prazos_eventos',
    'tarefas', 'tarefa_eventos',
    'aprovacoes', 'ia_execucoes',
    'notificacoes',
    'conversas', 'mensagens',
    'documentos'
  ] loop
    if to_regclass(format('public.%I', t)) is null then
      continue; -- tabela ainda não existe (ex.: documentos, Fase 2)
    end if;
    execute format('drop policy if exists mfa_obrigatorio on public.%I', t);
    execute format(
      'create policy mfa_obrigatorio on public.%I as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita())',
      t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- RPCs security definer de decisão: mesma regra, com erro explícito (42501) para a tela mostrar o motivo.
-- Os corpos abaixo são cópias das versões vigentes (0006, 0007, 0008, 0009, 0015) com a checagem acrescentada.
-- ---------------------------------------------------------------------------------------------------------------

-- 0007: carrega o prazo do escritório atual e exige poder agir no processo (base de confirmar/rejeitar/suspender/cumprir/cancelar)
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
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
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

-- 0009: decisão humana sobre a fila de aprovações
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
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
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

-- 0006: transição de estado da publicação (sistema ou pessoa)
create or replace function public.transicionar_publicacao(p_id uuid, p_para public.publicacao_status, p_dados jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pub record;
  sistema boolean := app.eh_service_role();
  papel text := app.papel_atual();
  usuario uuid := app.usuario_atual();
  v_processo_id uuid;
  v_anterior_id uuid;
  v_vinculo public.vinculo_tipo;
begin
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
  p_dados := coalesce(p_dados, '{}'::jsonb);

  if sistema then
    select * into pub from public.publicacoes p where p.id = p_id;
  else
    select * into pub from public.publicacoes p where p.id = p_id and p.escritorio_id = app.escritorio_atual();
  end if;
  if not found then
    raise exception 'Publicação não encontrada' using errcode = 'P0002';
  end if;

  if not sistema and papel = 'estagiario' then
    raise exception 'Estagiário não transiciona publicação' using errcode = '42501';
  end if;
  if not app.transicao_publicacao_permitida(pub.status, p_para, papel, sistema) then
    raise exception 'Transição de publicação não permitida: % → % (papel %)', pub.status, p_para, coalesce(papel, 'sistema') using errcode = '42501';
  end if;

  if p_para = 'vinculada' then
    v_processo_id := nullif(p_dados ->> 'processo_id', '')::uuid;
    if v_processo_id is null then
      raise exception 'Vincular exige processo_id em p_dados' using errcode = '22023';
    end if;
    if not exists (select 1 from public.processos pr where pr.id = v_processo_id and pr.escritorio_id = pub.escritorio_id) then
      raise exception 'Processo não encontrado no escritório' using errcode = 'P0002';
    end if;
    v_vinculo := coalesce(nullif(p_dados ->> 'vinculo_tipo', '')::public.vinculo_tipo, (case when sistema then 'automatico_numero' else 'manual' end)::public.vinculo_tipo);
  elsif p_para = 'ignorada' then
    if nullif(p_dados ->> 'motivo', '') is null then
      raise exception 'Ignorar exige motivo em p_dados' using errcode = '22023';
    end if;
    v_vinculo := 'nao_e_nosso';
  elsif p_para = 'duplicada' then
    v_anterior_id := nullif(p_dados ->> 'publicacao_anterior_id', '')::uuid;
    if v_anterior_id is null or v_anterior_id = pub.id
       or not exists (select 1 from public.publicacoes a where a.id = v_anterior_id and a.escritorio_id = pub.escritorio_id) then
      raise exception 'Duplicada exige publicacao_anterior_id válido do mesmo escritório' using errcode = '22023';
    end if;
  end if;

  update public.publicacoes p
     set status = p_para,
         processo_id = coalesce(v_processo_id, p.processo_id),
         vinculo_tipo = coalesce(v_vinculo, p.vinculo_tipo),
         motivo_nao_e_nosso = case when p_para = 'ignorada' then p_dados ->> 'motivo' else p.motivo_nao_e_nosso end,
         publicacao_anterior_id = coalesce(v_anterior_id, p.publicacao_anterior_id),
         tipo = case when p_para = 'classificada' then coalesce(nullif(p_dados ->> 'tipo', '')::public.publicacao_tipo, p.tipo) else p.tipo end,
         tipo_classificado_por = case when p_para = 'classificada'
           then coalesce(nullif(p_dados ->> 'tipo_classificado_por', '')::public.classificado_por, (case when sistema then 'ia' else 'humano' end)::public.classificado_por)
           else p.tipo_classificado_por end,
         resumo_ia = case when p_para = 'classificada' then coalesce(p_dados ->> 'resumo_ia', p.resumo_ia) else p.resumo_ia end,
         sugere_sigilo = case when p_para = 'classificada' then coalesce((p_dados ->> 'sugere_sigilo')::boolean, p.sugere_sigilo) else p.sugere_sigilo end,
         ia_execucao_id = coalesce(nullif(p_dados ->> 'ia_execucao_id', '')::uuid, p.ia_execucao_id),
         numero_cnj = case when p_para = 'classificada' and nullif(p_dados ->> 'numero_cnj', '') is not null then app.cnj_digitos(p_dados ->> 'numero_cnj') else p.numero_cnj end,
         tratada_por = case when not sistema then usuario else p.tratada_por end,
         tratada_em = case when not sistema or p_para in ('tratada', 'ignorada', 'duplicada', 'sem_prazo') then now() else p.tratada_em end,
         motivo_tratamento = coalesce(nullif(p_dados ->> 'motivo', ''), p.motivo_tratamento)
   where p.id = pub.id;

  insert into public.publicacao_eventos (escritorio_id, publicacao_id, de_status, para_status, usuario_id, dados)
  values (pub.escritorio_id, pub.id, pub.status, p_para, usuario, p_dados || jsonb_build_object('sistema', sistema, 'papel', papel));
end
$$;

-- 0006: leitura auditada do texto da publicação
create or replace function public.publicacao_texto(p_publicacao_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pub record;
  sigiloso boolean := false;
begin
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
  if app.escritorio_atual() is null then
    raise exception 'Usuário sem escritório' using errcode = '42501';
  end if;

  select p.id, p.escritorio_id, p.processo_id, p.texto
    into pub
    from public.publicacoes p
   where p.id = p_publicacao_id
     and p.escritorio_id = app.escritorio_atual();
  if not found then
    raise exception 'Publicação não encontrada' using errcode = 'P0002';
  end if;

  if pub.processo_id is not null then
    select pr.segredo_justica into sigiloso from public.processos pr where pr.id = pub.processo_id;
    if not app.pode_ver_sigiloso(pub.processo_id) then
      raise exception 'Sem permissão para ler o texto de publicação de processo sigiloso' using errcode = '42501';
    end if;
  end if;

  insert into public.auditoria_acessos (escritorio_id, usuario_id, objeto_tipo, objeto_id, acao, contexto)
  values (pub.escritorio_id, app.usuario_atual(), 'publicacao', pub.id, 'visualizou_texto',
          jsonb_build_object('processo_id', pub.processo_id, 'sigiloso', coalesce(sigiloso, false), 'papel', app.papel_atual()));

  return pub.texto;
end
$$;

-- 0015: sigilo do processo (apaga o resumo da IA das publicações ligadas)
create or replace function public.marcar_sigilo(p_processo_id uuid, p_sigiloso boolean, p_nivel int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
  if not app.eh_advogado_ou_socio() then
    raise exception 'Apenas advogado ou sócio pode alterar o sigilo do processo' using errcode = '42501';
  end if;
  update public.processos
     set segredo_justica = p_sigiloso, nivel_sigilo = p_nivel::smallint
   where id = p_processo_id and escritorio_id = app.escritorio_atual();
  if not found then
    raise exception 'Processo não encontrado' using errcode = 'P0002';
  end if;
  if p_sigiloso then
    -- Minimização: resumo em linguagem simples deixa de existir fora da RPC de texto
    update public.publicacoes
       set resumo_ia = null
     where processo_id = p_processo_id and escritorio_id = app.escritorio_atual();
  end if;
end
$$;

-- 0008: tarefas
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
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
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
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
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
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
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
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
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
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
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
