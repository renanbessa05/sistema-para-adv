-- 0011: conversas (WhatsApp e painel), mensagens, caixa de entrada de webhooks e templates aprovados pela Meta

do $$
begin
  if not exists (select 1 from pg_type where typname = 'canal_conversa') then
    create type public.canal_conversa as enum ('whatsapp', 'painel');
  end if;
  if not exists (select 1 from pg_type where typname = 'direcao') then
    create type public.direcao as enum ('entrada', 'saida');
  end if;
  if not exists (select 1 from pg_type where typname = 'entrega_status') then
    create type public.entrega_status as enum ('enfileirada', 'enviada', 'entregue', 'lida', 'falhou');
  end if;
  if not exists (select 1 from pg_type where typname = 'template_status') then
    create type public.template_status as enum ('rascunho', 'submetido', 'aprovado', 'rejeitado', 'pausado');
  end if;
end
$$;

-- Uma conversa por telefone e canal dentro do escritório. usuario_id nulo enquanto o telefone não for reconhecido.
create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  canal public.canal_conversa not null default 'whatsapp',
  usuario_id uuid,
  cliente_id uuid,
  telefone_e164 text not null check (telefone_e164 ~ '^\+[1-9]\d{7,14}$'),
  ultima_mensagem_recebida_em timestamptz,
  estado_assistente jsonb not null default '{}'::jsonb,
  aberta boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (escritorio_id, canal, telefone_e164)
);
create index if not exists conversas_usuario_idx on public.conversas (escritorio_id, usuario_id) where aberta;
create index if not exists conversas_ultima_mensagem_idx on public.conversas (escritorio_id, ultima_mensagem_recebida_em desc);
drop trigger if exists conversas_atualizado_em on public.conversas;
create trigger conversas_atualizado_em before update on public.conversas for each row execute function app.set_atualizado_em();

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  direcao public.direcao not null,
  id_externo text unique,
  tipo text not null default 'texto',
  texto text,
  payload jsonb,
  template_nome text,
  status_entrega public.entrega_status,
  erro text,
  intent text,
  ia_execucao_id uuid references public.ia_execucoes(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists mensagens_conversa_data_idx on public.mensagens (conversa_id, criado_em desc);
create index if not exists mensagens_escritorio_data_idx on public.mensagens (escritorio_id, criado_em desc);

-- Caixa de entrada bruta dos webhooks (Meta etc.): idempotente por (fonte, id_externo); escritorio_id nulo até resolver o telefone
create table if not exists public.webhooks_inbox (
  id uuid primary key default gen_random_uuid(),
  fonte text not null,
  id_externo text not null,
  escritorio_id uuid references public.escritorios(id) on delete set null,
  payload jsonb not null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  erro text,
  unique (fonte, id_externo)
);
create index if not exists webhooks_inbox_pendentes_idx on public.webhooks_inbox (fonte, recebido_em) where processado_em is null;

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null,
  categoria text not null default 'UTILITY',
  idioma text not null default 'pt_BR',
  corpo text not null,
  variaveis jsonb not null default '[]'::jsonb,
  status_meta public.template_status not null default 'rascunho',
  meta_template_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (escritorio_id, nome, idioma)
);
drop trigger if exists whatsapp_templates_atualizado_em on public.whatsapp_templates;
create trigger whatsapp_templates_atualizado_em before update on public.whatsapp_templates for each row execute function app.set_atualizado_em();

-- RLS
alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;
alter table public.webhooks_inbox enable row level security;
alter table public.whatsapp_templates enable row level security;

-- Conversa: o próprio usuário da conversa ou sócio
drop policy if exists conversas_acesso on public.conversas;
create policy conversas_acesso on public.conversas for all to authenticated
  using (escritorio_id = app.escritorio_atual() and (usuario_id = app.usuario_atual() or app.eh_socio()))
  with check (escritorio_id = app.escritorio_atual() and (usuario_id = app.usuario_atual() or app.eh_socio()));

drop policy if exists mensagens_acesso on public.mensagens;
create policy mensagens_acesso on public.mensagens for all to authenticated
  using (
    escritorio_id = app.escritorio_atual()
    and exists (select 1 from public.conversas c where c.id = conversa_id and c.escritorio_id = app.escritorio_atual() and (c.usuario_id = app.usuario_atual() or app.eh_socio()))
  )
  with check (
    escritorio_id = app.escritorio_atual()
    and exists (select 1 from public.conversas c where c.id = conversa_id and c.escritorio_id = app.escritorio_atual() and (c.usuario_id = app.usuario_atual() or app.eh_socio()))
  );

-- webhooks_inbox: sem policy para authenticated (só service role)

drop policy if exists templates_select on public.whatsapp_templates;
create policy templates_select on public.whatsapp_templates for select to authenticated using (escritorio_id = app.escritorio_atual());
drop policy if exists templates_escrita_socio on public.whatsapp_templates;
create policy templates_escrita_socio on public.whatsapp_templates for all to authenticated
  using (escritorio_id = app.escritorio_atual() and app.eh_socio())
  with check (escritorio_id = app.escritorio_atual() and app.eh_socio());

grant select, insert, update, delete on public.conversas, public.mensagens, public.whatsapp_templates to authenticated;
revoke all on public.webhooks_inbox from anon, authenticated;
grant all on public.conversas, public.mensagens, public.webhooks_inbox, public.whatsapp_templates to service_role;
