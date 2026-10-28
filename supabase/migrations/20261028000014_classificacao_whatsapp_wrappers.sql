-- 0014: campos da classificação por IA, verificação de telefone e execução de ações pelo WhatsApp em nome do usuário

alter table public.publicacoes add column if not exists classificacao jsonb;
alter table public.publicacoes add column if not exists confianca_ia numeric(3,2);
alter table public.publicacoes add column if not exists revisar_classificacao boolean not null default false;

-- Código de verificação do telefone: gerado no painel (pelo próprio usuário ou sócio), digitado no WhatsApp.
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
grant execute on function public.gerar_codigo_telefone(uuid) to authenticated;

-- Chamada pela rotina do WhatsApp (service role): a pessoa digitou o código do próprio telefone → verificado + opt-in.
create or replace function public.verificar_telefone(p_telefone text, p_codigo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linhas int;
begin
  update public.usuario_telefones
     set verificado_em = now(),
         opt_in_em = coalesce(opt_in_em, now()),
         codigo_verificacao_hash = null,
         codigo_expira_em = null
   where telefone_e164 = p_telefone
     and ativo
     and codigo_verificacao_hash = encode(extensions.digest(p_codigo, 'sha256'), 'hex')
     and codigo_expira_em > now();
  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end
$$;
revoke execute on function public.verificar_telefone(text, text) from public, anon, authenticated;
grant execute on function public.verificar_telefone(text, text) to service_role;

-- Executa uma ação de escrita confirmada pelo WhatsApp com os claims do usuário, passando pelas mesmas RPCs e regras do painel.
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
   where usuario_id = p_usuario_id and ativo
   order by aceito_em desc nulls last limit 1;
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
revoke execute on function public.whatsapp_executar(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.whatsapp_executar(uuid, text, jsonb) to service_role;

-- Registro da ação vinda do WhatsApp na fila de aprovações (auditoria: quem, o quê, quando)
create or replace function app.registrar_acao_whatsapp(p_escritorio_id uuid, p_usuario_id uuid, p_objeto_tipo public.aprovacao_objeto, p_objeto_id uuid, p_snapshot jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.aprovacoes (escritorio_id, objeto_tipo, objeto_id, solicitada_por_tipo, solicitada_por_id, conteudo_snapshot, status, aprovador_id, decidida_em)
  values (p_escritorio_id, p_objeto_tipo, p_objeto_id, 'usuario', p_usuario_id, p_snapshot, 'aprovada', p_usuario_id, now());
$$;
revoke execute on function app.registrar_acao_whatsapp(uuid, uuid, public.aprovacao_objeto, uuid, jsonb) from public, anon, authenticated;
grant execute on function app.registrar_acao_whatsapp(uuid, uuid, public.aprovacao_objeto, uuid, jsonb) to service_role;

-- O grant em publicacoes é por lista de colunas (0006): liberar leitura das colunas novas
grant select (classificacao, confianca_ia, revisar_classificacao) on public.publicacoes to authenticated;
