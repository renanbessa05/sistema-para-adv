-- 0010: notificações (regras por escritório, fila de envio com deduplicação) e ausências
-- Regras de negócio em docs/regras/notificacoes.md; a tabela regras_notificacao guarda só o override por escritório.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'evento_notificacao') then
    create type public.evento_notificacao as enum (
      'nova_publicacao', 'publicacao_sem_processo', 'publicacao_sem_tratamento_24h', 'publicacao_sem_tratamento_48h',
      'prazo_d3', 'prazo_d1', 'prazo_d0', 'prazo_vencido',
      'tarefa_atrasada', 'tarefa_reatribuida', 'resumo_do_dia',
      'captacao_falhou', 'calendario_incompleto', 'convite'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'canal') then
    create type public.canal as enum ('painel', 'whatsapp', 'email');
  end if;
  if not exists (select 1 from pg_type where typname = 'notificacao_status') then
    create type public.notificacao_status as enum ('pendente', 'enfileirada', 'enviada', 'entregue', 'lida', 'falhou', 'cancelada');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_ausencia') then
    create type public.tipo_ausencia as enum ('ferias', 'licenca', 'outro');
  end if;
end
$$;

-- Override por escritório das regras padrão (src/lib/notificacoes/regras.ts)
create table if not exists public.regras_notificacao (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  evento public.evento_notificacao not null,
  canal public.canal not null,
  ativo boolean not null default true,
  horario_local time,
  destinatario_regra text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (escritorio_id, evento, canal)
);
drop trigger if exists regras_notificacao_atualizado_em on public.regras_notificacao;
create trigger regras_notificacao_atualizado_em before update on public.regras_notificacao for each row execute function app.set_atualizado_em();

-- Uma linha por notificação a entregar; chave_dedup = evento + objeto + destinatário + canal + dia local
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  evento public.evento_notificacao not null,
  destinatario_id uuid not null,
  canal public.canal not null,
  template text,
  variaveis jsonb not null default '{}'::jsonb,
  objeto_tipo text,
  objeto_id uuid,
  agendada_para timestamptz not null default now(),
  status public.notificacao_status not null default 'pendente',
  mensagem_id uuid,
  erro text,
  tentativas int not null default 0 check (tentativas >= 0),
  enviada_em timestamptz,
  lida_em timestamptz,
  chave_dedup text not null unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists notificacoes_escritorio_status_agenda_idx on public.notificacoes (escritorio_id, status, agendada_para);
create index if not exists notificacoes_destinatario_status_idx on public.notificacoes (destinatario_id, status);
create index if not exists notificacoes_objeto_idx on public.notificacoes (objeto_tipo, objeto_id);
drop trigger if exists notificacoes_atualizado_em on public.notificacoes;
create trigger notificacoes_atualizado_em before update on public.notificacoes for each row execute function app.set_atualizado_em();

-- Ausências: notificações do ausente vão para o substituto; sem substituto, para os sócios
create table if not exists public.ausencias (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  usuario_id uuid not null,
  inicio date not null,
  fim date not null,
  tipo public.tipo_ausencia not null default 'ferias',
  substituto_id uuid,
  motivo text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint ausencia_periodo_valido check (fim >= inicio),
  constraint ausencia_substituto_diferente check (substituto_id is null or substituto_id <> usuario_id)
);
create index if not exists ausencias_escritorio_periodo_idx on public.ausencias (escritorio_id, inicio, fim);
create index if not exists ausencias_usuario_idx on public.ausencias (escritorio_id, usuario_id, fim);
drop trigger if exists ausencias_atualizado_em on public.ausencias;
create trigger ausencias_atualizado_em before update on public.ausencias for each row execute function app.set_atualizado_em();

-- Marcar como lida: só o destinatário
create or replace function public.marcar_notificacao_lida(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notificacoes
     set status = 'lida',
         lida_em = coalesce(lida_em, now())
   where id = p_id
     and escritorio_id = app.escritorio_atual()
     and destinatario_id = app.usuario_atual();
  if not found then
    raise exception 'Notificação não encontrada' using errcode = 'P0002';
  end if;
end
$$;

-- RLS
alter table public.regras_notificacao enable row level security;
alter table public.notificacoes enable row level security;
alter table public.ausencias enable row level security;

drop policy if exists regras_select on public.regras_notificacao;
create policy regras_select on public.regras_notificacao for select to authenticated using (escritorio_id = app.escritorio_atual());
drop policy if exists regras_escrita_socio on public.regras_notificacao;
create policy regras_escrita_socio on public.regras_notificacao for all to authenticated
  using (escritorio_id = app.escritorio_atual() and app.eh_socio())
  with check (escritorio_id = app.escritorio_atual() and app.eh_socio());

-- Notificação: só o destinatário ou sócio lê; escrita só pela service role (jobs) e leitura via RPC
drop policy if exists notificacoes_select on public.notificacoes;
create policy notificacoes_select on public.notificacoes for select to authenticated
  using (escritorio_id = app.escritorio_atual() and (destinatario_id = app.usuario_atual() or app.eh_socio()));

drop policy if exists ausencias_acesso on public.ausencias;
create policy ausencias_acesso on public.ausencias for all to authenticated
  using (escritorio_id = app.escritorio_atual() and (usuario_id = app.usuario_atual() or app.papel_atual() in ('socio', 'administrativo')))
  with check (escritorio_id = app.escritorio_atual() and (usuario_id = app.usuario_atual() or app.papel_atual() in ('socio', 'administrativo')));

grant select, insert, update, delete on public.regras_notificacao, public.ausencias to authenticated;
revoke all on public.notificacoes from anon, authenticated;
grant select on public.notificacoes to authenticated;
grant all on public.regras_notificacao, public.notificacoes, public.ausencias to service_role;
grant execute on function public.marcar_notificacao_lida(uuid) to authenticated, service_role;
revoke execute on function public.marcar_notificacao_lida(uuid) from anon, public;
