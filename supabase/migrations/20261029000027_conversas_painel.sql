-- 0027: conversas no painel (/assistente) (Fase 2, lote 2)
--
-- A tabela conversas nasceu para o WhatsApp (telefone obrigatório e único por canal). O chat do painel usa a
-- mesma tabela com canal 'painel': sem telefone, com título, processo de contexto, agente ativo e contagem de
-- turnos. Mensagens do assistente guardam os blocos de conteúdo inteiros em `payload` (histórico append-only).
-- Policies seguem como estão: o próprio usuário da conversa ou um sócio (sócio enxerga as conversas da equipe).

alter table public.conversas alter column telefone_e164 drop not null;
alter table public.conversas drop constraint if exists conversas_escritorio_id_canal_telefone_e164_key;
alter table public.conversas drop constraint if exists conversas_canal_telefone_check;
alter table public.conversas add constraint conversas_canal_telefone_check
  check ((canal = 'whatsapp' and telefone_e164 is not null) or canal = 'painel');
create unique index if not exists conversas_whatsapp_telefone_idx on public.conversas (escritorio_id, canal, telefone_e164) where canal = 'whatsapp';

alter table public.conversas
  add column if not exists titulo text,
  add column if not exists processo_id uuid references public.processos(id) on delete set null,
  add column if not exists agente text,
  add column if not exists contexto jsonb not null default '{}'::jsonb,
  add column if not exists turnos int not null default 0 check (turnos >= 0),
  add column if not exists encerrada_em timestamptz;
create index if not exists conversas_painel_usuario_idx on public.conversas (escritorio_id, usuario_id, canal, atualizado_em desc);
create index if not exists mensagens_conversa_idx on public.mensagens (conversa_id, criado_em);

comment on column public.mensagens.tipo is 'text|texto (pessoa ou assistente), ferramenta (resultado de ferramenta, payload com os blocos), sistema (aviso), resumo (resumo de conversa anterior)';
