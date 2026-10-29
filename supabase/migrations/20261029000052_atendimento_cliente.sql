-- 0052: atendimento ao cliente por WhatsApp (Fase 2, lote 14; P2)
--
-- Regras de segurança (docs/regras/atendimento-cliente.md):
-- 1. O envio ao cliente vem DESLIGADO: regras_atendimento.envio_ativo = false, e não liga sem horário configurado.
-- 2. Nenhuma mensagem sai sem contato verificado, opt-in vigente e sem opt-out.
-- 3. Resposta livre da IA nasce em rascunho (mensagens sem status_entrega, com aprovacao_id); só a aprovação
--    humana (decidir_aprovacao -> app.efeito_aprovacao_mensagem_cliente) põe o texto na fila 'mensagens_cliente'.
-- 4. Processo em segredo de justiça nunca gera texto de cliente: o efeito bloqueia se a aprovação citar um.
-- Fila: fila_mensagens com fila = 'mensagens_cliente' (migration 0012). Job: enviar-mensagens-cliente (cron abaixo).

-- 1. Contatos de cliente (telefone do cliente, verificação por código e consentimento)
create table if not exists public.clientes_contatos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  telefone_e164 text not null check (telefone_e164 ~ '^\+[1-9]\d{7,14}$'),
  codigo_verificacao_hash text,
  codigo_expira_em timestamptz,
  verificado_em timestamptz,
  opt_in_em timestamptz,
  opt_out_em timestamptz,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (escritorio_id, cliente_id, telefone_e164)
);
create index if not exists clientes_contatos_telefone_idx on public.clientes_contatos (telefone_e164) where ativo;
create index if not exists clientes_contatos_cliente_idx on public.clientes_contatos (escritorio_id, cliente_id);
drop trigger if exists clientes_contatos_atualizado_em on public.clientes_contatos;
create trigger clientes_contatos_atualizado_em before update on public.clientes_contatos for each row execute function app.set_atualizado_em();

-- 2. Regras de atendimento por escritório (ausência de linha = envio desligado)
create table if not exists public.regras_atendimento (
  escritorio_id uuid primary key references public.escritorios(id) on delete cascade,
  envio_ativo boolean not null default false,
  horario_inicio time,
  horario_fim time,
  dias_semana int[] check (dias_semana is null or dias_semana <@ array[1,2,3,4,5,6,7]),
  atualizado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint regras_atendimento_horario_par check ((horario_inicio is null) = (horario_fim is null)),
  constraint regras_atendimento_horario_ordem check (horario_inicio is null or horario_inicio < horario_fim),
  constraint regras_atendimento_envio_exige_horario check (not envio_ativo or (horario_inicio is not null and dias_semana is not null))
);
drop trigger if exists regras_atendimento_atualizado_em on public.regras_atendimento;
create trigger regras_atendimento_atualizado_em before update on public.regras_atendimento for each row execute function app.set_atualizado_em();
insert into public.regras_atendimento (escritorio_id) select id from public.escritorios on conflict (escritorio_id) do nothing;

-- 3. Vínculos com a conversa e com a aprovação
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conversas_cliente_fk') then
    alter table public.conversas add constraint conversas_cliente_fk foreign key (cliente_id) references public.clientes(id) on delete set null;
  end if;
end
$$;
create index if not exists conversas_cliente_idx on public.conversas (escritorio_id, cliente_id) where cliente_id is not null;
alter table public.mensagens add column if not exists aprovacao_id uuid references public.aprovacoes(id) on delete set null;
create index if not exists mensagens_aprovacao_idx on public.mensagens (aprovacao_id) where aprovacao_id is not null;

-- 4. RLS
alter table public.clientes_contatos enable row level security;
alter table public.regras_atendimento enable row level security;

drop policy if exists tenant_isolamento on public.clientes_contatos;
create policy tenant_isolamento on public.clientes_contatos for all to authenticated
  using (escritorio_id = app.escritorio_atual() and app.eh_advogado_ou_socio())
  with check (escritorio_id = app.escritorio_atual() and app.eh_advogado_ou_socio());

drop policy if exists regras_atendimento_leitura on public.regras_atendimento;
create policy regras_atendimento_leitura on public.regras_atendimento for select to authenticated
  using (escritorio_id = app.escritorio_atual() and app.eh_advogado_ou_socio());
drop policy if exists regras_atendimento_escrita_socio on public.regras_atendimento;
create policy regras_atendimento_escrita_socio on public.regras_atendimento for all to authenticated
  using (escritorio_id = app.escritorio_atual() and app.eh_socio())
  with check (escritorio_id = app.escritorio_atual() and app.eh_socio());

-- Conversas e mensagens de cliente: advogado e sócio leem; só o sistema (service role) escreve.
drop policy if exists conversas_cliente_leitura on public.conversas;
create policy conversas_cliente_leitura on public.conversas for select to authenticated
  using (escritorio_id = app.escritorio_atual() and cliente_id is not null and app.eh_advogado_ou_socio());

drop policy if exists mensagens_cliente_leitura on public.mensagens;
create policy mensagens_cliente_leitura on public.mensagens for select to authenticated
  using (
    escritorio_id = app.escritorio_atual()
    and app.eh_advogado_ou_socio()
    and exists (select 1 from public.conversas c where c.id = conversa_id and c.escritorio_id = app.escritorio_atual() and c.cliente_id is not null)
  );

drop policy if exists mensagens_cliente_so_sistema_ins on public.mensagens;
create policy mensagens_cliente_so_sistema_ins on public.mensagens as restrictive for insert to authenticated
  with check (app.eh_service_role() or not exists (select 1 from public.conversas c where c.id = conversa_id and c.cliente_id is not null));
drop policy if exists mensagens_cliente_so_sistema_upd on public.mensagens;
create policy mensagens_cliente_so_sistema_upd on public.mensagens as restrictive for update to authenticated
  using (app.eh_service_role() or not exists (select 1 from public.conversas c where c.id = conversa_id and c.cliente_id is not null))
  with check (app.eh_service_role() or not exists (select 1 from public.conversas c where c.id = conversa_id and c.cliente_id is not null));
drop policy if exists mensagens_cliente_so_sistema_del on public.mensagens;
create policy mensagens_cliente_so_sistema_del on public.mensagens as restrictive for delete to authenticated
  using (app.eh_service_role() or not exists (select 1 from public.conversas c where c.id = conversa_id and c.cliente_id is not null));

-- Colunas que o painel pode alterar diretamente; verificação e consentimento passam pelas RPCs abaixo.
revoke all on public.clientes_contatos from anon, authenticated;
grant select on public.clientes_contatos to authenticated;
grant insert (escritorio_id, cliente_id, telefone_e164) on public.clientes_contatos to authenticated;
grant update (ativo) on public.clientes_contatos to authenticated;
revoke all on public.regras_atendimento from anon, authenticated;
grant select, insert, update on public.regras_atendimento to authenticated;
grant all on public.clientes_contatos, public.regras_atendimento to service_role;

-- 5. Laço de MFA (mesmo bloco de 0016 e 0034, com as tabelas novas)
do $$
declare t text;
begin
  foreach t in array array['clientes_contatos', 'regras_atendimento'] loop
    execute format('drop policy if exists mfa_obrigatorio on public.%I', t);
    execute format('create policy mfa_obrigatorio on public.%I as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita())', t);
  end loop;
end
$$;

-- 6. RPCs de contato (painel, com MFA e papel de advogado ou sócio)
create or replace function public.gerar_codigo_contato_cliente(p_contato_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_linhas int;
begin
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
  if not app.eh_advogado_ou_socio() then
    raise exception 'Apenas advogado ou sócio gera código de verificação' using errcode = '42501';
  end if;
  update public.clientes_contatos
     set codigo_verificacao_hash = encode(extensions.digest(v_codigo, 'sha256'), 'hex'),
         codigo_expira_em = now() + interval '30 minutes'
   where id = p_contato_id and escritorio_id = app.escritorio_atual() and ativo;
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'Contato não encontrado' using errcode = 'P0002';
  end if;
  return v_codigo;
end
$$;
revoke execute on function public.gerar_codigo_contato_cliente(uuid) from public, anon;
grant execute on function public.gerar_codigo_contato_cliente(uuid) to authenticated, service_role;

-- Concede (p_concede = true, exige contato verificado) ou revoga o consentimento de mensagens automáticas.
create or replace function public.cliente_contato_consentimento(p_contato_id uuid, p_concede boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linhas int;
begin
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
  if not app.eh_advogado_ou_socio() then
    raise exception 'Apenas advogado ou sócio registra o consentimento' using errcode = '42501';
  end if;
  if coalesce(p_concede, false) then
    update public.clientes_contatos
       set opt_in_em = now(), opt_out_em = null
     where id = p_contato_id and escritorio_id = app.escritorio_atual() and ativo and verificado_em is not null;
  else
    update public.clientes_contatos
       set opt_out_em = now()
     where id = p_contato_id and escritorio_id = app.escritorio_atual();
  end if;
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'Contato não encontrado, inativo ou ainda não verificado' using errcode = '55000';
  end if;
end
$$;
revoke execute on function public.cliente_contato_consentimento(uuid, boolean) from public, anon;
grant execute on function public.cliente_contato_consentimento(uuid, boolean) to authenticated, service_role;

-- 7. RPCs do sistema (service role): verificação pelo WhatsApp e rascunho da IA
-- Verificação: o cliente digita o código no WhatsApp. Devolve os contatos verificados (normalmente um).
create or replace function public.verificar_contato_cliente(p_telefone text, p_codigo text)
returns table (r_contato_id uuid, r_escritorio_id uuid, r_cliente_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.eh_service_role() then
    raise exception 'Somente o sistema verifica contatos' using errcode = '42501';
  end if;
  return query
    with verificados as (
      update public.clientes_contatos c
         set verificado_em = now(), codigo_verificacao_hash = null, codigo_expira_em = null
       where c.telefone_e164 = p_telefone
         and c.ativo
         and c.codigo_verificacao_hash = encode(extensions.digest(p_codigo, 'sha256'), 'hex')
         and c.codigo_expira_em > now()
      returning c.id, c.escritorio_id, c.cliente_id
    )
    select v.id, v.escritorio_id, v.cliente_id from verificados v;
end
$$;
revoke execute on function public.verificar_contato_cliente(text, text) from public, anon, authenticated;
grant execute on function public.verificar_contato_cliente(text, text) to service_role;

-- Rascunho de resposta livre: cria a mensagem (sem status, ainda não enviada) e a aprovação pendente.
create or replace function public.criar_rascunho_cliente(p_escritorio uuid, p_conversa uuid, p_texto text, p_ia_execucao_id uuid, p_snapshot jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg uuid;
  v_aprovacao uuid;
begin
  if not app.eh_service_role() then
    raise exception 'Somente o sistema cria rascunhos de atendimento' using errcode = '42501';
  end if;
  if not exists (select 1 from public.conversas c where c.id = p_conversa and c.escritorio_id = p_escritorio and c.cliente_id is not null) then
    raise exception 'Conversa de cliente não encontrada' using errcode = 'P0002';
  end if;
  insert into public.mensagens (escritorio_id, conversa_id, direcao, tipo, texto, intent, ia_execucao_id)
  values (p_escritorio, p_conversa, 'saida', 'texto', p_texto, 'resposta_ia', p_ia_execucao_id)
  returning id into v_msg;
  insert into public.aprovacoes (escritorio_id, objeto_tipo, objeto_id, solicitada_por_tipo, ia_execucao_id, conteudo_snapshot, prazo_resposta_em)
  values (p_escritorio, 'mensagem_cliente', v_msg, 'ia', p_ia_execucao_id, coalesce(p_snapshot, '{}'::jsonb), now() + interval '2 days')
  returning id into v_aprovacao;
  update public.mensagens set aprovacao_id = v_aprovacao where id = v_msg;
  return v_msg;
end
$$;
revoke execute on function public.criar_rascunho_cliente(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.criar_rascunho_cliente(uuid, uuid, text, uuid, jsonb) to service_role;

-- 8. Efeito da decisão (decidir_aprovacao -> app.aplicar_efeito_aprovacao, migration 0024)
-- Aprovada: vai para a fila. Ajustada: envia o texto do campo ajustes.texto. Rejeitada: nada sai.
-- Nunca envia: processo em segredo de justiça, contato sem consentimento vigente, envio desligado no escritório.
create or replace function app.efeito_aprovacao_mensagem_cliente(a public.aprovacoes)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.mensagens;
  v_texto text;
  v_ativo boolean;
  v_sigiloso boolean;
  v_consentido boolean;
begin
  select * into m from public.mensagens where id = a.objeto_id and aprovacao_id = a.id for update;
  if not found or m.status_entrega is not null then
    return;
  end if;
  if a.status = 'rejeitada' then
    update public.mensagens set status_entrega = 'falhou', erro = 'rejeitada na revisão humana' where id = m.id;
    return;
  end if;
  if a.status not in ('aprovada', 'ajustada') then
    return;
  end if;

  v_texto := m.texto;
  if a.status = 'ajustada' and nullif(btrim(coalesce(a.ajustes ->> 'texto', '')), '') is not null then
    v_texto := a.ajustes ->> 'texto';
  end if;

  v_sigiloso := false;
  if a.conteudo_snapshot ->> 'processo_id' is not null then
    select p.segredo_justica into v_sigiloso from public.processos p where p.id = (a.conteudo_snapshot ->> 'processo_id')::uuid;
  end if;
  if coalesce(v_sigiloso, false) then
    update public.mensagens set texto = v_texto, status_entrega = 'falhou', erro = 'processo em segredo de justiça: envio bloqueado' where id = m.id;
    return;
  end if;

  select exists (
    select 1
      from public.conversas c
      join public.clientes_contatos k on k.escritorio_id = c.escritorio_id and k.cliente_id = c.cliente_id and k.telefone_e164 = c.telefone_e164
     where c.id = m.conversa_id
       and k.ativo
       and k.verificado_em is not null
       and k.opt_in_em is not null
       and k.opt_out_em is null
  ) into v_consentido;
  if not coalesce(v_consentido, false) then
    update public.mensagens set texto = v_texto, status_entrega = 'falhou', erro = 'contato sem consentimento vigente' where id = m.id;
    return;
  end if;

  select r.envio_ativo into v_ativo from public.regras_atendimento r where r.escritorio_id = m.escritorio_id;
  if coalesce(v_ativo, false) is not true then
    update public.mensagens set texto = v_texto, status_entrega = 'falhou', erro = 'envio ao cliente desligado nas configurações' where id = m.id;
    return;
  end if;

  update public.mensagens set texto = v_texto, status_entrega = 'enfileirada', erro = null where id = m.id;
  perform public.fila_enfileirar('mensagens_cliente', m.escritorio_id, jsonb_build_object('mensagem_id', m.id), 0);
end
$$;
revoke execute on function app.efeito_aprovacao_mensagem_cliente(public.aprovacoes) from public, anon, authenticated;

-- 9. Rotina agendada (pg_cron -> app.chamar_rotina, mesmo padrão de 0023)
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron indisponível: rotina enviar-mensagens-cliente não agendada neste banco';
    return;
  end if;
  perform cron.schedule('rotina:enviar-mensagens-cliente', '*/5 * * * *', format('select app.chamar_rotina(%L)', 'enviar-mensagens-cliente'));
end
$$;
