-- 0038: audiências (lote 8). Agenda por escritório, ligada a processo. Segue o desenho de cálculos (0034):
-- tenant por escritório, sigilo pelo processo, MFA obrigatório para quem escreve.
-- O alerta de véspera (evento audiencia_d1) sai pelo job alertas-audiencia, 11h UTC em dias úteis (08h em Cuiabá).

create table if not exists public.audiencias (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  tipo text not null default 'outra' check (tipo in ('instrucao', 'conciliacao', 'una', 'julgamento', 'outra')),
  data_hora timestamptz not null,
  modalidade text not null default 'presencial' check (modalidade in ('presencial', 'virtual')),
  local_ou_link text,
  responsavel_id uuid,
  observacoes text,
  status text not null default 'agendada' check (status in ('agendada', 'realizada', 'cancelada', 'adiada')),
  alerta_enviado_em timestamptz,
  google_event_id text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists audiencias_escritorio_data_idx on public.audiencias (escritorio_id, data_hora);
create index if not exists audiencias_alerta_idx on public.audiencias (escritorio_id, status, alerta_enviado_em) where status = 'agendada';
drop trigger if exists audiencias_atualizado_em on public.audiencias;
create trigger audiencias_atualizado_em before update on public.audiencias for each row execute function app.set_atualizado_em();

alter table public.audiencias enable row level security;
drop policy if exists tenant_isolamento on public.audiencias;
create policy tenant_isolamento on public.audiencias for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists audiencias_sigilo on public.audiencias;
create policy audiencias_sigilo on public.audiencias as restrictive for all to authenticated using (app.pode_ver_sigiloso(processo_id));
drop policy if exists mfa_obrigatorio on public.audiencias;
create policy mfa_obrigatorio on public.audiencias as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita());
grant select, insert, update, delete on public.audiencias to authenticated;
grant all on public.audiencias to service_role;

do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron indisponível: rotina alertas-audiencia não agendada neste banco';
    return;
  end if;
  perform cron.schedule('rotina:alertas-audiencia', '0 11 * * 1-5', format('select app.chamar_rotina(%L)', 'alertas-audiencia'));
end
$$;
