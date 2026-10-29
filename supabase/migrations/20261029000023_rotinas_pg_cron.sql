-- 0023: rotinas agendadas pelo Postgres (pg_cron + pg_net) em vez do Vercel Cron
--
-- Contexto (docs/adr/0003, adendo de 29/10/2026): o plano Hobby da Vercel só aceita cron diário. O agendador passa
-- para o banco: pg_cron dispara, nos mesmos horários (UTC), uma chamada HTTP GET para /api/jobs/<rotina> no app,
-- com `Authorization: Bearer <CRON_SECRET>`. As rotas e os jobs não mudam.
--
-- Credenciais ficam no Vault com os nomes 'app:url' (ex.: https://sistema-para-adv.vercel.app) e 'app:cron_secret'
-- (o mesmo CRON_SECRET da Vercel). Sem elas a chamada é pulada com um NOTICE, nunca com erro.
-- Em Postgres sem pg_cron/pg_net (CI local) a função existe mas nada é agendado.

-- Extensões, se o servidor as oferece (Supabase sim; Postgres comum do CI não)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  end if;
end
$$;

-- Lê uma credencial das rotinas no Vault (null se o Vault ou o segredo não existir)
create or replace function app.credencial_rotinas(p_nome text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_valor text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v_valor using p_nome;
  return nullif(btrim(coalesce(v_valor, '')), '');
end
$$;
revoke execute on function app.credencial_rotinas(text) from public, anon, authenticated;

-- Dispara uma rotina do app por HTTP (assíncrono: pg_net enfileira e responde depois em net._http_response).
-- Devolve o id da requisição em pg_net, ou null quando pulou (sem credenciais ou sem pg_net).
create or replace function app.chamar_rotina(p_rotina text, p_timeout_ms integer default 300000)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := app.credencial_rotinas('app:url');
  v_segredo text := app.credencial_rotinas('app:cron_secret');
  v_id bigint;
begin
  if p_rotina is null or p_rotina !~ '^[a-z0-9-]+$' then
    raise exception 'Nome de rotina inválido: %', p_rotina using errcode = '22023';
  end if;
  if v_url is null or v_segredo is null then
    raise notice 'Rotina % pulada: grave app:url e app:cron_secret no Vault', p_rotina;
    return null;
  end if;
  if to_regprocedure('net.http_get(text,jsonb,jsonb,integer)') is null then
    raise notice 'Rotina % pulada: pg_net indisponível neste banco', p_rotina;
    return null;
  end if;
  execute 'select net.http_get(url := $1, headers := $2, timeout_milliseconds := $3)'
     into v_id
    using rtrim(v_url, '/') || '/api/jobs/' || p_rotina,
          jsonb_build_object('Authorization', 'Bearer ' || v_segredo, 'User-Agent', 'pg_cron'),
          p_timeout_ms;
  return v_id;
end
$$;
revoke execute on function app.chamar_rotina(text, integer) from public, anon, authenticated;

-- Agenda (ou reagenda: cron.schedule com o mesmo nome substitui) as 11 rotinas. Horários em UTC, iguais aos que
-- estavam em vercel.json antes desta migration (Cuiabá = UTC-4).
do $$
declare
  r record;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron indisponível: rotinas não agendadas neste banco';
    return;
  end if;
  for r in
    select * from (values
      ('captar-djen',         '0 10,11,12 * * 1-5'),
      ('classificar',         '*/5 10-22 * * 1-5'),
      ('enriquecer-datajud',  '30 9 * * *'),
      ('drenar-notificacoes', '*/5 * * * *'),
      ('alertas-publicacao',  '0 12-22 * * 1-5'),
      ('alertas-prazo',       '0 11 * * 1-5'),
      ('resumo-do-dia',       '30 11 * * 1-5'),
      ('marcar-vencidos',     '5 4 * * *'),
      ('exportar-prazos',     '0 22 * * 1-5'),
      ('atualizar-metricas',  '0 3 * * *'),
      ('captacao-vigilante',  '0 13 * * 1-5')
    ) as t(rotina, horario)
  loop
    perform cron.schedule('rotina:' || r.rotina, r.horario, format('select app.chamar_rotina(%L)', r.rotina));
  end loop;
end
$$;

-- Visão de operação: agendamentos e última execução de cada rotina (só service_role; /admin/status pode ler)
create or replace function app.rotinas_agendadas()
returns table (rotina text, horario text, ativa boolean, ultima_execucao timestamptz, ultimo_status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('cron.job') is null then
    return;
  end if;
  return query execute $q$
    select replace(j.jobname, 'rotina:', '') as rotina,
           j.schedule as horario,
           j.active as ativa,
           d.start_time as ultima_execucao,
           d.status as ultimo_status
      from cron.job j
      left join lateral (
        select start_time, status from cron.job_run_details where jobid = j.jobid order by start_time desc limit 1
      ) d on true
     where j.jobname like 'rotina:%'
     order by j.jobname
  $q$;
end
$$;
revoke execute on function app.rotinas_agendadas() from public, anon, authenticated;
grant execute on function app.rotinas_agendadas() to service_role;
