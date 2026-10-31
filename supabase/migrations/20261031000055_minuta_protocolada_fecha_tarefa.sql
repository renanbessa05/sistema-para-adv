-- 0055: minuta protocolada fecha o fio. Ao marcar a minuta como protocolada, a tarefa ligada é concluída com
-- "protocolado = true" (o que, por concluir_tarefa, cumpre o prazo e, por cumprir_prazo, trata a publicação).
-- Sem tarefa ligada mas com prazo aberto, o prazo é cumprido direto. Substitui a função da migration 0031;
-- nada mais muda (docs/regras/estados.md; docs/regras/fluxo-de-trabalho.md).

create or replace function public.minuta_marcar_protocolada(p_minuta uuid, p_numero_protocolo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.minutas;
  t_status public.tarefa_status;
  p_status public.prazo_status;
begin
  m := app.minuta_para_etapa(p_minuta);
  if m.status <> 'aprovada' then raise exception 'Só minuta aprovada pode ser marcada como protocolada' using errcode = '55000'; end if;
  update public.minutas set status = 'protocolada', protocolo_numero = p_numero_protocolo, protocolada_em = now() where id = m.id;

  -- Tarefa ligada ainda aberta: concluir como protocolada (cumpre o prazo da tarefa, se houver).
  if m.tarefa_id is not null then
    select status into t_status from public.tarefas where id = m.tarefa_id and escritorio_id = m.escritorio_id;
    if t_status in ('a_fazer', 'em_andamento', 'pronta_para_revisao') then
      perform public.concluir_tarefa(m.tarefa_id, true);
    end if;
  end if;

  -- Prazo ligado à minuta ainda aberto (sem tarefa, ou tarefa de outro prazo): cumprir direto.
  if m.prazo_id is not null then
    select status into p_status from public.prazos where id = m.prazo_id and escritorio_id = m.escritorio_id;
    if p_status in ('confirmado', 'prorrogado', 'vencido') then
      perform public.cumprir_prazo(m.prazo_id, 'manual');
    end if;
  end if;
end
$$;
revoke execute on function public.minuta_marcar_protocolada(uuid, text) from public, anon;
grant execute on function public.minuta_marcar_protocolada(uuid, text) to authenticated, service_role;
