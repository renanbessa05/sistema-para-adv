-- 0020: vínculo de membro convidado cujo e-mail já tem usuário no Auth
--
-- A trigger app.vincular_membro_por_email (0004) só roda no INSERT em auth.users. Quando o sócio convida um
-- e-mail que já existe no Auth, inviteUserByEmail falha e nada liga a linha pendente de escritorio_membros ao
-- usuário. Esta função faz esse vínculo, só pela service role (chamada por src/server/equipe.ts após o convite
-- falhar por usuário existente). Devolve o usuario_id vinculado, ou null quando não havia usuário com o e-mail
-- ou nenhuma linha pendente. Os claims do JWT (escritorio_id, papel) só mudam no próximo login/refresh.

create or replace function public.vincular_membro_existente(p_email text)
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
  if v_email = '' then
    return null;
  end if;

  select u.id into v_usuario from auth.users u where lower(u.email) = v_email limit 1;
  if v_usuario is null then
    return null;
  end if;

  update public.escritorio_membros m
     set usuario_id = v_usuario,
         aceito_em = coalesce(m.aceito_em, now()),
         convite_token = null
   where m.usuario_id is null
     and lower(m.email_convite) = v_email;
  get diagnostics v_linhas = row_count;

  return case when v_linhas > 0 then v_usuario else null end;
end
$$;

revoke execute on function public.vincular_membro_existente(text) from public, anon, authenticated;
grant execute on function public.vincular_membro_existente(text) to service_role;
