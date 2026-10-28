-- 0015: ao marcar um processo como sigiloso, o resumo gerado pela IA sai das publicações (só o texto, via RPC auditada, continua acessível)

create or replace function public.marcar_sigilo(p_processo_id uuid, p_sigiloso boolean, p_nivel int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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
