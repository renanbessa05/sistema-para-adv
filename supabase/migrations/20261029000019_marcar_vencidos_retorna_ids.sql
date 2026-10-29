-- 0019: o job de vencidos precisa saber QUAIS prazos venceram para enfileirar o evento prazo_vencido
--
-- Compatibilidade: `marcar_prazos_vencidos(date) returns int` continua existindo com o mesmo nome, assinatura e
-- retorno (quem chamava segue funcionando); o trabalho passa para `marcar_prazos_vencidos_detalhado(date)`, que
-- devolve uma linha por prazo vencido (id, processo_id, responsavel_id). Ambas só pela service role.

create or replace function public.marcar_prazos_vencidos_detalhado(p_hoje date)
returns table (id uuid, processo_id uuid, responsavel_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.eh_service_role() then
    raise exception 'Apenas o sistema marca prazos vencidos' using errcode = '42501';
  end if;
  return query
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
    returning p.id, p.escritorio_id, p.processo_id, p.responsavel_id, c.status as de_status
  ), eventos as (
    insert into public.prazos_eventos (escritorio_id, prazo_id, tipo, de_status, para_status, usuario_id, dados)
    select v.escritorio_id, v.id, 'vencido', v.de_status, 'vencido', null, jsonb_build_object('hoje', p_hoje, 'sistema', true) from vencidos v
    returning 1
  )
  -- CTEs que modificam dados rodam até o fim mesmo sem serem lidas pela consulta principal
  select v.id, v.processo_id, v.responsavel_id
    from vencidos v;
end
$$;

-- Mesmo nome, assinatura e retorno de antes: devolve quantos venceram
create or replace function public.marcar_prazos_vencidos(p_hoje date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  select count(*) into n from public.marcar_prazos_vencidos_detalhado(p_hoje);
  return coalesce(n, 0);
end
$$;

revoke execute on function public.marcar_prazos_vencidos_detalhado(date) from public, anon, authenticated;
grant execute on function public.marcar_prazos_vencidos_detalhado(date) to service_role;
revoke execute on function public.marcar_prazos_vencidos(date) from public, anon, authenticated;
grant execute on function public.marcar_prazos_vencidos(date) to service_role;
