-- 0018: divergências da operação paralela (docs/runbooks/operacao-paralela.md; escopo T1.35)
--
-- Toda sexta o administrativo cruza os prazos do sistema com o PJe e registra aqui o que divergiu:
-- qual prazo/publicação/processo, o que divergiu, a causa e a correção feita. A tela /admin/divergencias
-- conta as semanas consecutivas sem divergência "não explicada" (sem causa preenchida); meta: 4 semanas.
-- Quem registra e resolve: sócio, advogado e administrativo. Estagiário só lê.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'divergencia_tipo') then
    create type public.divergencia_tipo as enum (
      'data_prazo',               -- data final do sistema diferente da do PJe/conferência manual
      'publicacao_nao_captada',   -- expediente visto no PJe/e-mail que não apareceu na caixa de publicações
      'classificacao_errada',     -- tipo de ato ou "gera prazo" classificado errado pela IA
      'cadastro_advogado',        -- OAB/nome do advogado errado no processo ou no cadastro da equipe
      'prazo_nao_sugerido',       -- publicação captada e vinculada, mas sem prazo sugerido quando devia
      'outro'
    );
  end if;
end
$$;

create table if not exists public.divergencias_operacao (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  semana date not null,                               -- sexta-feira de referência da conferência semanal
  tipo public.divergencia_tipo not null default 'outro',
  prazo_id uuid references public.prazos(id) on delete set null,
  publicacao_id uuid references public.publicacoes(id) on delete set null,
  processo_id uuid references public.processos(id) on delete set null,
  descricao text not null,
  causa text,                                         -- nulo/vazio = divergência ainda não explicada
  correcao text,
  registrada_por uuid,
  resolvida_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint divergencia_descricao_nao_vazia check (btrim(descricao) <> '')
);
create index if not exists divergencias_operacao_escritorio_semana_idx on public.divergencias_operacao (escritorio_id, semana desc);
create index if not exists divergencias_operacao_prazo_idx on public.divergencias_operacao (prazo_id);
drop trigger if exists divergencias_operacao_atualizado_em on public.divergencias_operacao;
create trigger divergencias_operacao_atualizado_em before update on public.divergencias_operacao for each row execute function app.set_atualizado_em();

-- RLS: isolamento por escritório; escrita só para sócio, advogado e administrativo (estagiário lê)
alter table public.divergencias_operacao enable row level security;

drop policy if exists tenant_isolamento on public.divergencias_operacao;
create policy tenant_isolamento on public.divergencias_operacao for all to authenticated
  using (escritorio_id = app.escritorio_atual())
  with check (escritorio_id = app.escritorio_atual());

drop policy if exists divergencias_insert_papel on public.divergencias_operacao;
create policy divergencias_insert_papel on public.divergencias_operacao as restrictive for insert to authenticated
  with check (app.papel_atual() in ('socio', 'advogado', 'administrativo'));

drop policy if exists divergencias_update_papel on public.divergencias_operacao;
create policy divergencias_update_papel on public.divergencias_operacao as restrictive for update to authenticated
  using (app.papel_atual() in ('socio', 'advogado', 'administrativo'))
  with check (app.papel_atual() in ('socio', 'advogado', 'administrativo'));

grant select, insert, update on public.divergencias_operacao to authenticated;
grant all on public.divergencias_operacao to service_role;
