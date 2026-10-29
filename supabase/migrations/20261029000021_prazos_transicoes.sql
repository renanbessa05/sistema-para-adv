-- 0021: transições de prazo a partir de suspenso/prorrogado (docs/regras/estados.md)
--
-- 1. suspender_ou_prorrogar_prazo aceita origem em ('confirmado', 'suspenso', 'prorrogado'): um prazo suspenso
--    pode ser prorrogado ao voltar, um prorrogado pode ser prorrogado de novo ou suspenso.
-- 2. retomar_prazo: suspenso → confirmado, com fundamento obrigatório e nova data final opcional (>= atual),
--    recalculando data_interna quando a data muda. O evento fica em prazos_eventos como as demais transições.
-- marcar_prazos_vencidos (0007) só vence 'confirmado' e 'prorrogado': prazo suspenso não vence (conferido; sem alteração).

-- confirmado | suspenso | prorrogado → suspenso | prorrogado, com nova data (obrigatória na prorrogação) e fundamento
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
  if pz.status not in ('confirmado', 'suspenso', 'prorrogado') then
    raise exception 'Transição de prazo não permitida: % → %', pz.status, p_novo_status using errcode = '42501';
  end if;
  if pz.status = p_novo_status and p_nova_data is null then
    raise exception 'O prazo já está %', p_novo_status using errcode = '22023';
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

-- suspenso → confirmado (retomada), com fundamento e nova data final opcional (>= atual)
create or replace function public.retomar_prazo(p_id uuid, p_nova_data date default null, p_fundamento text default null)
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
  pz := app.prazo_para_decisao(p_id, 'retomar');
  if pz.status <> 'suspenso' then
    raise exception 'Transição de prazo não permitida: % → confirmado (retomar)', pz.status using errcode = '42501';
  end if;
  if nullif(btrim(p_fundamento), '') is null then
    raise exception 'Retomar prazo exige fundamento (ato normativo ou decisão)' using errcode = '22023';
  end if;
  if p_nova_data is not null and p_nova_data < pz.data_final then
    raise exception 'A nova data final não pode ser anterior à atual' using errcode = '22023';
  end if;

  data_anterior := pz.data_final;
  if p_nova_data is not null and p_nova_data <> pz.data_final then
    pz.data_final := p_nova_data;
    nova_interna := app.calcular_data_interna(pz);
  end if;

  update public.prazos p
     set status = 'confirmado',
         data_final = coalesce(p_nova_data, p.data_final),
         data_interna = coalesce(nova_interna, p.data_interna),
         data_confirmada = coalesce(p_nova_data, p.data_confirmada, p.data_final)
   where p.id = pz.id;

  insert into public.prazos_eventos (escritorio_id, prazo_id, tipo, de_status, para_status, usuario_id, dados)
  values (pz.escritorio_id, pz.id, 'retomado', pz.status, 'confirmado', app.usuario_atual(),
          jsonb_build_object('fundamento', p_fundamento, 'data_anterior', data_anterior, 'data_final', pz.data_final, 'data_interna', coalesce(nova_interna, pz.data_interna)));
end
$$;

grant execute on function public.suspender_ou_prorrogar_prazo(uuid, public.prazo_status, date, text) to authenticated, service_role;
grant execute on function public.retomar_prazo(uuid, date, text) to authenticated, service_role;
revoke execute on function public.retomar_prazo(uuid, date, text) from public, anon;
