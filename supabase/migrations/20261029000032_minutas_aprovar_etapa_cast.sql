-- 0032: correção de minuta_aprovar_etapa (0031): o CASE de status precisa do cast para public.minuta_status.
create or replace function public.minuta_aprovar_etapa(p_minuta uuid, p_numero int, p_comentario text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare m public.minutas; e public.minuta_etapas;
begin
  m := app.minuta_para_etapa(p_minuta);
  select * into e from public.minuta_etapas where minuta_id = m.id and numero = p_numero;
  if not found then raise exception 'Etapa % ainda não foi gerada', p_numero using errcode = 'P0002'; end if;
  if p_numero <> m.etapa_atual then raise exception 'A etapa atual é a %; aprove na ordem', m.etapa_atual using errcode = '55000'; end if;
  update public.minuta_etapas set status = 'aprovada', aprovada_por = app.usuario_atual(), aprovada_em = now(), comentarios = p_comentario where id = e.id;
  update public.minutas
     set etapa_atual = least(6, p_numero + 1),
         status = (case when p_numero >= 6 then 'redigida' else 'em_etapas' end)::public.minuta_status
   where id = m.id;
end
$$;
