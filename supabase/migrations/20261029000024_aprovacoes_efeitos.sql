-- 0024: decidir_aprovacao passa a aplicar o efeito da decisão no objeto aprovado (Fase 2, lote 1)
--
-- Até aqui a RPC só gravava a decisão. A partir desta migration ela chama app.aplicar_efeito_aprovacao(a), que
-- procura uma função app.efeito_aprovacao_<objeto_tipo>(public.aprovacoes) e a executa com a linha já decidida.
-- Cada lote seguinte cria a sua: efeito_aprovacao_contrato, efeito_aprovacao_minuta, efeito_aprovacao_calculo,
-- efeito_aprovacao_mensagem_cliente. Sem função para o tipo, nada acontece (prazo e tarefas já têm RPCs próprias).
-- O efeito roda na mesma transação da decisão: se levantar exceção, a decisão não é gravada.
--
-- Também entra o valor 'calculo' no enum aprovacao_objeto (uso só a partir da migration seguinte: valor novo de
-- enum não pode ser usado na mesma transação em que foi criado).

alter type public.aprovacao_objeto add value if not exists 'calculo';

alter table public.aprovacoes add column if not exists efeito_aplicado_em timestamptz;

create or replace function app.aplicar_efeito_aprovacao(a public.aprovacoes)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_funcao text := format('app.efeito_aprovacao_%s(public.aprovacoes)', a.objeto_tipo::text);
begin
  if to_regprocedure(v_funcao) is null then
    return false;
  end if;
  execute format('select app.efeito_aprovacao_%I($1)', a.objeto_tipo::text) using a;
  update public.aprovacoes set efeito_aplicado_em = now() where id = a.id;
  return true;
end
$$;
revoke execute on function app.aplicar_efeito_aprovacao(public.aprovacoes) from public, anon, authenticated;
grant execute on function app.aplicar_efeito_aprovacao(public.aprovacoes) to service_role;

-- Cópia da versão vigente (0016) com a chamada do efeito ao final.
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

  -- Efeito no objeto (minuta, contrato, cálculo, mensagem a cliente): na mesma transação da decisão.
  if app.aplicar_efeito_aprovacao(a) then
    select * into a from public.aprovacoes where id = a.id;
  end if;
  return a;
end
$$;

-- Criação de aprovações por usuários: o solicitante é a pessoa ou a IA; a RPC genérica evita INSERT direto
-- com snapshot arbitrário e garante escritorio_id e prazo de resposta (48 h úteis aproximadas: 2 dias).
create or replace function public.criar_aprovacao(
  p_objeto_tipo public.aprovacao_objeto,
  p_objeto_id uuid,
  p_snapshot jsonb default '{}'::jsonb,
  p_ia_execucao_id uuid default null,
  p_solicitada_por_tipo public.solicitante_tipo default 'usuario'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  esc uuid := coalesce(app.escritorio_atual(), null);
  novo uuid;
begin
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
  if esc is null then
    raise exception 'Sessão sem escritório' using errcode = '42501';
  end if;
  if exists (select 1 from public.aprovacoes x where x.objeto_tipo = p_objeto_tipo and x.objeto_id = p_objeto_id and x.status = 'pendente') then
    raise exception 'Já existe aprovação pendente para este objeto' using errcode = '55000';
  end if;
  insert into public.aprovacoes (escritorio_id, objeto_tipo, objeto_id, solicitada_por_tipo, solicitada_por_id, ia_execucao_id, conteudo_snapshot, prazo_resposta_em)
  values (esc, p_objeto_tipo, p_objeto_id, coalesce(p_solicitada_por_tipo, 'usuario'), app.usuario_atual(), p_ia_execucao_id, coalesce(p_snapshot, '{}'::jsonb), now() + interval '2 days')
  returning id into novo;
  return novo;
end
$$;
revoke execute on function public.criar_aprovacao(public.aprovacao_objeto, uuid, jsonb, uuid, public.solicitante_tipo) from public, anon;
grant execute on function public.criar_aprovacao(public.aprovacao_objeto, uuid, jsonb, uuid, public.solicitante_tipo) to authenticated, service_role;
