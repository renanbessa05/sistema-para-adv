-- 0022: correções da revisão adversarial das pendências da Fase 1 (29/10/2026)
--
-- 1. MFA: carência limitada a 7 dias da criação da conta; escrita em escritorio_membros, usuario_telefones e
--    escritorio_configuracoes exige segundo fator (a leitura segue livre, para o layout e a tela de cadastro);
--    policy restritiva também em integracoes, divergencias_operacao, atos_prazo, exportacoes, processo_colaboradores,
--    processo_assuntos, auditoria_acessos, ausencias, regras_notificacao, fases_kanban e captacoes; checagem em
--    gerar_codigo_telefone, integracao_definir_segredo e integracao_remover_segredo.
-- 2. Convite para usuário existente: a RPC recebe o escritório, só liga usuario_id e NÃO aceita pela pessoa; o aceite
--    é explícito (aceitar_convite) e só vínculos aceitos definem os claims do JWT e o escritório do WhatsApp.
-- 3. Prazos vencidos: variante por escritório (job itera escritório a escritório, sem conjunto em memória).
-- 4. Divergências: semana precisa ser sexta-feira; só causa, correção e resolução são editáveis; resolvida não muda.
-- 5. Integrações: status 'erro' volta a 'ativa' quando o job passa a funcionar.
-- 6. Processos: competencia_manual guarda que a equipe ajustou a competência (o DataJud não sobrescreve).
-- 7. RPCs de prazo deixam de ser executáveis por public/anon.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. MFA
-- ---------------------------------------------------------------------------------------------------------------

-- Carência: só para quem nunca verificou um fator E cuja conta tem menos de 7 dias (prazo para cadastrar o
-- autenticador). Depois disso, sócio e advogado sem fator ficam sem dados até cadastrar um (a tela /mfa/cadastro
-- só precisa de escritorios e escritorio_membros, que seguem legíveis). Remover o último fator de uma conta
-- antiga não reabre o acesso só com senha.
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
      or (
        not exists (
          select 1
            from auth.mfa_factors f
           where f.user_id = auth.uid()
             and f.status = 'verified'
        )
        and coalesce(
          (select u.created_at > now() - interval '7 days' from auth.users u where u.id = auth.uid()),
          true
        )
      )
$$;
comment on function app.mfa_satisfeita() is
  'true quando o papel não exige MFA, quando a sessão é aal2, quando o usuário nunca verificou fator e a conta tem menos de 7 dias (carência) ou quando é service role.';

-- Escrita em tabelas que precisam continuar legíveis antes do segundo fator
do $$
declare
  t text;
begin
  foreach t in array array['escritorio_membros', 'usuario_telefones', 'escritorio_configuracoes'] loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    execute format('drop policy if exists mfa_obrigatorio_insert on public.%I', t);
    execute format('create policy mfa_obrigatorio_insert on public.%I as restrictive for insert to authenticated with check (app.mfa_satisfeita())', t);
    execute format('drop policy if exists mfa_obrigatorio_update on public.%I', t);
    execute format('create policy mfa_obrigatorio_update on public.%I as restrictive for update to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita())', t);
    execute format('drop policy if exists mfa_obrigatorio_delete on public.%I', t);
    execute format('create policy mfa_obrigatorio_delete on public.%I as restrictive for delete to authenticated using (app.mfa_satisfeita())', t);
  end loop;
end
$$;

-- Tabelas que ficaram fora da lista de 0016
do $$
declare
  t text;
begin
  foreach t in array array[
    'integracoes', 'divergencias_operacao', 'atos_prazo', 'exportacoes',
    'processo_colaboradores', 'processo_assuntos', 'auditoria_acessos',
    'ausencias', 'regras_notificacao', 'fases_kanban', 'captacoes'
  ] loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    execute format('drop policy if exists mfa_obrigatorio on public.%I', t);
    execute format(
      'create policy mfa_obrigatorio on public.%I as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita())',
      t
    );
  end loop;
end
$$;

-- 0014: gerar código do telefone exige segundo fator (senão uma sessão só com senha cadastra um telefone e passa a
-- operar pelo WhatsApp, canal que não pede aal2)
create or replace function public.gerar_codigo_telefone(p_telefone_id uuid)
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
  update public.usuario_telefones
     set codigo_verificacao_hash = encode(extensions.digest(v_codigo, 'sha256'), 'hex'),
         codigo_expira_em = now() + interval '30 minutes'
   where id = p_telefone_id
     and escritorio_id = app.escritorio_atual()
     and (usuario_id = app.usuario_atual() or app.eh_socio());
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'Telefone não encontrado ou sem permissão' using errcode = '42501';
  end if;
  return v_codigo;
end
$$;

-- 0017: gravar e remover segredo exigem segundo fator (corpos copiados, só a checagem acrescentada)
create or replace function public.integracao_definir_segredo(p_tipo public.tipo_integracao, p_segredo text, p_config jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escritorio uuid := app.escritorio_atual();
  v_nome text;
  v_secret_id uuid;
  v_existe boolean := false;
begin
  if not app.eh_socio() then
    raise exception 'Apenas sócio pode gravar segredos de integração' using errcode = '42501';
  end if;
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
  if v_escritorio is null then
    raise exception 'Sessão sem escritório' using errcode = '42501';
  end if;
  if p_segredo is null or btrim(p_segredo) = '' then
    raise exception 'Informe o segredo da integração' using errcode = '22023';
  end if;
  if p_config is not null and jsonb_typeof(p_config) <> 'object' then
    raise exception 'A configuração da integração precisa ser um objeto JSON' using errcode = '22023';
  end if;
  if to_regprocedure('vault.create_secret(text,text,text,uuid)') is null then
    raise exception 'Vault indisponível neste banco: habilite a extensão supabase_vault antes de gravar segredos' using errcode = '0A000';
  end if;

  v_nome := app.nome_segredo_integracao(v_escritorio, p_tipo);

  select i.vault_secret_id into v_secret_id
    from public.integracoes i
   where i.escritorio_id = v_escritorio and i.tipo = p_tipo;

  if v_secret_id is not null then
    execute 'select exists (select 1 from vault.secrets where id = $1)' into v_existe using v_secret_id;
    if v_existe then
      execute 'select vault.update_secret($1, $2)' using v_secret_id, btrim(p_segredo);
    else
      v_secret_id := null; -- referência órfã: recria abaixo
    end if;
  end if;

  if v_secret_id is null then
    execute 'delete from vault.secrets where name = $1' using v_nome;
    execute 'select vault.create_secret($1, $2, $3)'
       into v_secret_id
      using btrim(p_segredo), v_nome, 'Segredo da integração ' || p_tipo::text || ' do escritório ' || v_escritorio::text;
  end if;

  insert into public.integracoes (escritorio_id, tipo, config, vault_secret_id, status, ultimo_erro)
  values (v_escritorio, p_tipo, coalesce(p_config, '{}'::jsonb), v_secret_id, 'ativa', null)
  on conflict (escritorio_id, tipo) do update
     set config = public.integracoes.config || coalesce(excluded.config, '{}'::jsonb),
         vault_secret_id = excluded.vault_secret_id,
         status = 'ativa',
         ultimo_erro = null;
end
$$;

create or replace function public.integracao_remover_segredo(p_tipo public.tipo_integracao)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escritorio uuid := app.escritorio_atual();
  v_secret_id uuid;
begin
  if not app.eh_socio() then
    raise exception 'Apenas sócio pode remover segredos de integração' using errcode = '42501';
  end if;
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
  if v_escritorio is null then
    raise exception 'Sessão sem escritório' using errcode = '42501';
  end if;

  select i.vault_secret_id into v_secret_id
    from public.integracoes i
   where i.escritorio_id = v_escritorio and i.tipo = p_tipo;
  if not found then
    raise exception 'Integração não configurada' using errcode = 'P0002';
  end if;

  if v_secret_id is not null and to_regclass('vault.secrets') is not null then
    execute 'delete from vault.secrets where id = $1' using v_secret_id;
  end if;

  update public.integracoes
     set vault_secret_id = null,
         status = 'inativa',
         ultimo_erro = null
   where escritorio_id = v_escritorio and tipo = p_tipo;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Convite para usuário existente: vínculo sem aceite não vale
-- ---------------------------------------------------------------------------------------------------------------

-- Só vínculos aceitos (aceito_em preenchido) definem o escritório da sessão
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  membro record;
  app_meta jsonb;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  select m.escritorio_id, m.papel
    into membro
    from public.escritorio_membros m
   where m.usuario_id = (event ->> 'user_id')::uuid
     and m.ativo
     and m.aceito_em is not null
   order by m.aceito_em desc, m.criado_em
   limit 1;

  if membro.escritorio_id is not null then
    claims := jsonb_set(claims, '{escritorio_id}', to_jsonb(membro.escritorio_id::text), true);
    claims := jsonb_set(claims, '{papel}', to_jsonb(membro.papel::text), true);
    app_meta := coalesce(claims -> 'app_metadata', '{}'::jsonb)
      || jsonb_build_object('escritorio_id', membro.escritorio_id::text, 'papel', membro.papel::text);
    claims := jsonb_set(claims, '{app_metadata}', app_meta, true);
  end if;

  return jsonb_set(event, '{claims}', claims, true);
end
$$;

-- 0014: o WhatsApp também só age por vínculo aceito (corpo copiado, só o filtro acrescentado)
create or replace function public.whatsapp_executar(p_usuario_id uuid, p_acao text, p_parametros jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  v_claims jsonb;
begin
  select escritorio_id, papel into m
    from public.escritorio_membros
   where usuario_id = p_usuario_id and ativo and aceito_em is not null
   order by aceito_em desc limit 1;
  if m.escritorio_id is null then
    return jsonb_build_object('ok', false, 'mensagem', 'Usuário sem vínculo ativo.');
  end if;

  v_claims := jsonb_build_object('sub', p_usuario_id::text, 'role', 'authenticated', 'escritorio_id', m.escritorio_id::text, 'papel', m.papel::text);
  perform set_config('request.jwt.claims', v_claims::text, true);
  perform set_config('request.jwt.claim.sub', p_usuario_id::text, true);

  begin
    if p_acao = 'reatribuir_tarefa' then
      perform public.reatribuir_tarefa((p_parametros->>'tarefa_id')::uuid, (p_parametros->>'para')::uuid, 'reatribuída pelo WhatsApp');
      return jsonb_build_object('ok', true, 'mensagem', 'Tarefa reatribuída. A pessoa será avisada.');
    elsif p_acao = 'concluir_tarefa' then
      perform public.concluir_tarefa((p_parametros->>'tarefa_id')::uuid, coalesce((p_parametros->>'protocolado')::boolean, false));
      return jsonb_build_object('ok', true, 'mensagem', 'Tarefa concluída.');
    elsif p_acao = 'confirmar_prazo' then
      perform public.confirmar_prazo((p_parametros->>'prazo_id')::uuid);
      return jsonb_build_object('ok', true, 'mensagem', 'Prazo confirmado. A tarefa foi criada para o responsável.');
    else
      return jsonb_build_object('ok', false, 'mensagem', 'Ação desconhecida.');
    end if;
  exception when others then
    return jsonb_build_object('ok', false, 'mensagem', 'Não foi possível: ' || sqlerrm);
  end;
end
$$;

-- A versão de 0020 (só e-mail, aceitava pela pessoa e varria todos os escritórios) sai
drop function if exists public.vincular_membro_existente(text);

-- Liga o usuário existente à linha pendente DO ESCRITÓRIO informado; aceito_em fica nulo até a pessoa aceitar.
-- Devolve o usuario_id vinculado, ou null quando não há usuário com o e-mail ou não há convite pendente ali.
create or replace function public.vincular_membro_existente(p_email text, p_escritorio_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_usuario uuid;
  v_linhas int;
begin
  if v_email = '' or p_escritorio_id is null then
    return null;
  end if;

  select u.id into v_usuario from auth.users u where lower(u.email) = v_email limit 1;
  if v_usuario is null then
    return null;
  end if;

  update public.escritorio_membros m
     set usuario_id = v_usuario,
         convite_token = coalesce(m.convite_token, encode(extensions.gen_random_bytes(16), 'hex'))
   where m.usuario_id is null
     and m.escritorio_id = p_escritorio_id
     and lower(m.email_convite) = v_email;
  get diagnostics v_linhas = row_count;

  return case when v_linhas > 0 then v_usuario else null end;
end
$$;
revoke execute on function public.vincular_membro_existente(text, uuid) from public, anon, authenticated;
grant execute on function public.vincular_membro_existente(text, uuid) to service_role;

-- Convites do usuário logado ainda não aceitos (a RLS de escritorio_membros não deixaria ler sem claims)
create or replace function public.convites_pendentes()
returns table (escritorio_id uuid, escritorio_nome text, papel public.papel, convidado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.escritorio_id, e.nome, m.papel, m.criado_em
    from public.escritorio_membros m
    join public.escritorios e on e.id = m.escritorio_id
   where m.usuario_id = auth.uid()
     and m.ativo
     and m.aceito_em is null
   order by m.criado_em desc
$$;
revoke execute on function public.convites_pendentes() from public, anon;
grant execute on function public.convites_pendentes() to authenticated;

-- Aceite explícito: a partir daqui o vínculo passa a valer nos claims (próximo refresh) e no WhatsApp
create or replace function public.aceitar_convite(p_escritorio_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linhas int;
begin
  if auth.uid() is null then
    raise exception 'Sessão sem usuário' using errcode = '42501';
  end if;
  update public.escritorio_membros m
     set aceito_em = now(),
         convite_token = null
   where m.usuario_id = auth.uid()
     and m.escritorio_id = p_escritorio_id
     and m.ativo
     and m.aceito_em is null;
  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end
$$;
revoke execute on function public.aceitar_convite(uuid) from public, anon;
grant execute on function public.aceitar_convite(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Prazos vencidos por escritório
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.marcar_prazos_vencidos_detalhado(p_hoje date, p_escritorio uuid)
returns table (id uuid, processo_id uuid, responsavel_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.eh_service_role() then
    raise exception 'Apenas o sistema marca prazos vencidos' using errcode = '42501';
  end if;
  if p_escritorio is null then
    raise exception 'Informe o escritório' using errcode = '22023';
  end if;
  return query
  with candidatos as (
    select c.id, c.escritorio_id, c.status
      from public.prazos c
     where c.escritorio_id = p_escritorio
       and c.status in ('confirmado', 'prorrogado')
       and c.data_final < p_hoje
     for update
  ), vencidos as (
    update public.prazos p
       set status = 'vencido'
      from candidatos c
     where p.id = c.id
    returning p.id, p.escritorio_id, p.processo_id, p.responsavel_id, c.status as de_status
  ), eventos as (
    insert into public.prazos_eventos (escritorio_id, prazo_id, tipo, de_status, para_status, usuario_id, dados)
    select v.escritorio_id, v.id, 'vencido', v.de_status, 'vencido', null, jsonb_build_object('hoje', p_hoje, 'sistema', true) from vencidos v
    returning 1
  )
  select v.id, v.processo_id, v.responsavel_id
    from vencidos v;
end
$$;
revoke execute on function public.marcar_prazos_vencidos_detalhado(date, uuid) from public, anon, authenticated;
grant execute on function public.marcar_prazos_vencidos_detalhado(date, uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Divergências: sexta-feira, colunas editáveis, resolvida não muda
-- ---------------------------------------------------------------------------------------------------------------
alter table public.divergencias_operacao drop constraint if exists divergencia_semana_sexta;
alter table public.divergencias_operacao add constraint divergencia_semana_sexta check (extract(isodow from semana) = 5);

revoke update on public.divergencias_operacao from authenticated;
grant update (causa, correcao, resolvida_em) on public.divergencias_operacao to authenticated;

create or replace function app.divergencia_bloqueia_resolvida()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.resolvida_em is not null and not app.eh_service_role() then
    raise exception 'Divergência já resolvida não pode ser alterada' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists divergencias_operacao_bloqueia_resolvida on public.divergencias_operacao;
create trigger divergencias_operacao_bloqueia_resolvida before update on public.divergencias_operacao
  for each row execute function app.divergencia_bloqueia_resolvida();

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Integrações: sucesso limpa o erro
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.integracao_registrar_sucesso(p_escritorio uuid, p_tipo public.tipo_integracao)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.integracoes
     set status = 'ativa', ultimo_erro = null
   where escritorio_id = p_escritorio and tipo = p_tipo and status = 'erro'
$$;
revoke execute on function public.integracao_registrar_sucesso(uuid, public.tipo_integracao) from public, anon, authenticated;
grant execute on function public.integracao_registrar_sucesso(uuid, public.tipo_integracao) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Competência ajustada à mão não é sobrescrita pelo DataJud
-- ---------------------------------------------------------------------------------------------------------------
alter table public.processos add column if not exists competencia_manual boolean not null default false;
comment on column public.processos.competencia_manual is 'true quando a equipe escolheu a competência na tela; o enriquecimento pelo DataJud não a sobrescreve.';

-- ---------------------------------------------------------------------------------------------------------------
-- 7. RPCs de prazo não executáveis por public/anon
-- ---------------------------------------------------------------------------------------------------------------
revoke execute on function public.confirmar_prazo(uuid, date, uuid, int, boolean, text) from public, anon;
revoke execute on function public.rejeitar_prazo(uuid, text) from public, anon;
revoke execute on function public.suspender_ou_prorrogar_prazo(uuid, public.prazo_status, date, text) from public, anon;
revoke execute on function public.cumprir_prazo(uuid, public.cumprimento_evidencia) from public, anon;
revoke execute on function public.cancelar_prazo(uuid, text) from public, anon;
