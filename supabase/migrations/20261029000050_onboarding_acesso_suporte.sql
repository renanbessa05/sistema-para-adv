-- 0050: onboarding (criar_escritorio) e acesso de suporte concedido pelo sócio (conceder/revogar)
--
-- criar_escritorio é FECHADA POR PADRÃO: só roda se a configuração de banco app.cadastro_aberto = 'on'.
-- Esta migration NÃO liga a configuração. Ligar o cadastro público é decisão do dono, fora deste arquivo.
-- Só cria o primeiro escritório de quem ainda não tem vínculo ativo; demais vínculos entram por convite.

create or replace function public.criar_escritorio(
  p_nome text,
  p_nome_completo text,
  p_razao_social text default null,
  p_cnpj text default null,
  p_oab_numero text default null,
  p_oab_uf text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_id uuid;
begin
  if coalesce(current_setting('app.cadastro_aberto', true), 'off') <> 'on' then
    raise exception 'Cadastro de novos escritórios está desligado' using errcode = '42501';
  end if;
  if v_usuario is null then
    raise exception 'Sessão inválida' using errcode = '42501';
  end if;
  if v_email = '' then
    raise exception 'Conta sem e-mail' using errcode = '22023';
  end if;
  if exists (select 1 from public.escritorio_membros m where m.usuario_id = v_usuario and m.ativo) then
    raise exception 'Usuário já vinculado a um escritório: peça convite ao sócio' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_nome, '')), '') is null then
    raise exception 'Informe o nome do escritório' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_nome_completo, '')), '') is null then
    raise exception 'Informe seu nome completo' using errcode = '22023';
  end if;
  if p_oab_uf is not null and btrim(p_oab_uf) <> '' and upper(btrim(p_oab_uf)) !~ '^[A-Z]{2}$' then
    raise exception 'UF da OAB inválida' using errcode = '22023';
  end if;

  insert into public.escritorios (nome, razao_social, cnpj)
  values (btrim(p_nome), nullif(btrim(coalesce(p_razao_social, '')), ''), nullif(btrim(coalesce(p_cnpj, '')), ''))
  returning id into v_id;

  insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, oab_numero, oab_uf, aceito_em)
  values (
    v_id, v_usuario, v_email, 'socio', btrim(p_nome_completo),
    nullif(btrim(coalesce(p_oab_numero, '')), ''),
    nullif(upper(btrim(coalesce(p_oab_uf, ''))), ''),
    now()
  );

  return v_id;
end
$$;
revoke execute on function public.criar_escritorio(text, text, text, text, text, text) from public, anon;
grant execute on function public.criar_escritorio(text, text, text, text, text, text) to authenticated;

-- Sócio concede acesso de suporte ao seu escritório (conta já existente), com validade e motivo.
create or replace function public.conceder_acesso_suporte(p_email text, p_expira_em timestamptz, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escritorio uuid := app.escritorio_atual();
  v_alvo uuid;
  v_id uuid;
begin
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
  if not app.eh_socio() then
    raise exception 'Apenas sócio concede acesso de suporte' using errcode = '42501';
  end if;
  if p_expira_em is null or p_expira_em <= now() or p_expira_em > now() + interval '30 days' then
    -- Teto de 30 dias é proposta técnica (a confirmar pelo escritório); ver docs/adr/0014.
    raise exception 'Validade deve estar entre agora e 30 dias' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Informe o motivo (mínimo 10 caracteres)' using errcode = '22023';
  end if;

  select u.id into v_alvo from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if v_alvo is null then
    raise exception 'Conta não encontrada para este e-mail' using errcode = 'P0002';
  end if;

  insert into public.acessos_suporte (escritorio_id, usuario_id, concedido_por, motivo, expira_em)
  values (v_escritorio, v_alvo, auth.uid(), btrim(p_motivo), p_expira_em)
  returning id into v_id;
  return v_id;
end
$$;
revoke execute on function public.conceder_acesso_suporte(text, timestamptz, text) from public, anon;
grant execute on function public.conceder_acesso_suporte(text, timestamptz, text) to authenticated;

create or replace function public.revogar_acesso_suporte(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
  if not app.eh_socio() then
    raise exception 'Apenas sócio revoga acesso de suporte' using errcode = '42501';
  end if;
  update public.acessos_suporte
     set revogado_em = now(), revogado_por = auth.uid()
   where id = p_id
     and escritorio_id = app.escritorio_atual()
     and revogado_em is null;
  if not found then
    raise exception 'Acesso não encontrado ou já revogado' using errcode = 'P0002';
  end if;
end
$$;
revoke execute on function public.revogar_acesso_suporte(uuid) from public, anon;
grant execute on function public.revogar_acesso_suporte(uuid) to authenticated;
