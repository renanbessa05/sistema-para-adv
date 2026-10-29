-- 0025: documentos (Storage privado por escritório) e texto extraído por página (Fase 2, lote 1)
--
-- Regras (docs/escopo-revisado.md 1.3.2 e 2.3, migration 13 prevista): o arquivo fica no bucket privado `documentos`
-- com caminho `<escritorio_id>/<processo_id|geral>/<uuid>.<ext>`; a linha em public.documentos guarda metadados e
-- hash; o texto extraído vai para documento_paginas (uma linha por página, com tsvector em português) para a IA
-- ler por trechos e para a busca. Documento de processo sigiloso segue a regra do processo (app.pode_ver_sigiloso).
-- Escrita no Storage só pela service role (server actions sobem o arquivo com o cliente admin após validar a sessão);
-- leitura por URL assinada, com registro em auditoria_acessos.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'documento_tipo') then
    create type public.documento_tipo as enum ('contrato', 'procuracao', 'declaracao', 'peca', 'autos', 'anexo', 'exportacao', 'memoria_calculo', 'outro');
  end if;
  if not exists (select 1 from pg_type where typname = 'documento_origem') then
    create type public.documento_origem as enum ('gerado', 'upload', 'pje_extensao');
  end if;
end
$$;

create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  processo_id uuid references public.processos(id) on delete set null,
  cliente_id uuid references public.clientes(id) on delete set null,
  tipo public.documento_tipo not null default 'anexo',
  nome text not null,
  bucket text not null default 'documentos',
  caminho text not null,
  mime text not null,
  tamanho bigint not null check (tamanho >= 0),
  hash_sha256 text not null,
  origem public.documento_origem not null default 'upload',
  paginas int,
  texto_extraido_em timestamptz,
  extracao_erro text,
  anthropic_file_id text,
  anthropic_file_expira_em timestamptz,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (bucket, caminho)
);
create index if not exists documentos_escritorio_idx on public.documentos (escritorio_id, criado_em desc);
create index if not exists documentos_processo_idx on public.documentos (escritorio_id, processo_id) where processo_id is not null;
create index if not exists documentos_cliente_idx on public.documentos (escritorio_id, cliente_id) where cliente_id is not null;
create index if not exists documentos_hash_idx on public.documentos (escritorio_id, hash_sha256);
drop trigger if exists documentos_atualizado_em on public.documentos;
create trigger documentos_atualizado_em before update on public.documentos for each row execute function app.set_atualizado_em();

create table if not exists public.documento_paginas (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  documento_id uuid not null references public.documentos(id) on delete cascade,
  numero int not null check (numero >= 1),
  texto text not null default '',
  tsv tsvector generated always as (to_tsvector('portuguese', coalesce(texto, ''))) stored,
  unique (documento_id, numero)
);
create index if not exists documento_paginas_tsv_idx on public.documento_paginas using gin (tsv);
create index if not exists documento_paginas_escritorio_idx on public.documento_paginas (escritorio_id, documento_id);

-- RLS: isolamento por escritório + sigilo do processo (quem não pode ver sigiloso não vê o documento)
alter table public.documentos enable row level security;
alter table public.documento_paginas enable row level security;

drop policy if exists tenant_isolamento on public.documentos;
create policy tenant_isolamento on public.documentos for select to authenticated
  using (escritorio_id = app.escritorio_atual() and (processo_id is null or app.pode_ver_sigiloso(processo_id)));
-- Inserção/atualização por usuário (metadados): advogado, sócio e administrativo; estagiário não envia documento.
drop policy if exists documentos_escrita on public.documentos;
create policy documentos_escrita on public.documentos for insert to authenticated
  with check (escritorio_id = app.escritorio_atual() and coalesce(app.papel_atual(), '') in ('socio', 'advogado', 'administrativo'));
drop policy if exists documentos_atualiza on public.documentos;
create policy documentos_atualiza on public.documentos for update to authenticated
  using (escritorio_id = app.escritorio_atual() and coalesce(app.papel_atual(), '') in ('socio', 'advogado', 'administrativo'))
  with check (escritorio_id = app.escritorio_atual());
drop policy if exists documentos_apaga on public.documentos;
create policy documentos_apaga on public.documentos for delete to authenticated
  using (escritorio_id = app.escritorio_atual() and app.eh_advogado_ou_socio());

drop policy if exists tenant_isolamento on public.documento_paginas;
create policy tenant_isolamento on public.documento_paginas for select to authenticated
  using (escritorio_id = app.escritorio_atual()
     and exists (select 1 from public.documentos d where d.id = documento_id and (d.processo_id is null or app.pode_ver_sigiloso(d.processo_id))));

revoke all on public.documentos, public.documento_paginas from anon;
grant select, insert, update, delete on public.documentos to authenticated;
grant select on public.documento_paginas to authenticated;
grant all on public.documentos, public.documento_paginas to service_role;

-- MFA: reexecução do laço da 0016 para as tabelas novas (a 0016 já previa 'documentos', mas a tabela não existia)
do $$
declare
  t text;
begin
  foreach t in array array['documentos', 'documento_paginas'] loop
    execute format('drop policy if exists mfa_obrigatorio on public.%I', t);
    execute format(
      'create policy mfa_obrigatorio on public.%I as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita())',
      t
    );
  end loop;
end
$$;

-- Auditoria de download (acao 'baixou' já existe em acesso_acao)
create or replace function public.documento_registrar_acesso(p_id uuid, p_acao public.acesso_acao default 'baixou')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
begin
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
  select id, escritorio_id, processo_id, tipo into d from public.documentos where id = p_id and escritorio_id = app.escritorio_atual();
  if not found then
    raise exception 'Documento não encontrado' using errcode = 'P0002';
  end if;
  if d.processo_id is not null and not app.pode_ver_sigiloso(d.processo_id) then
    raise exception 'Sem permissão para acessar documento de processo sigiloso' using errcode = '42501';
  end if;
  insert into public.auditoria_acessos (escritorio_id, usuario_id, objeto_tipo, objeto_id, acao, contexto)
  values (d.escritorio_id, app.usuario_atual(), 'documento', d.id, p_acao, jsonb_build_object('processo_id', d.processo_id, 'tipo', d.tipo, 'papel', app.papel_atual()));
end
$$;
revoke execute on function public.documento_registrar_acesso(uuid, public.acesso_acao) from public, anon;
grant execute on function public.documento_registrar_acesso(uuid, public.acesso_acao) to authenticated, service_role;

-- Storage: buckets privados e leitura por prefixo do escritório. Só no Supabase (o Postgres do CI não tem o schema).
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'schema storage ausente: buckets e policies de Storage não criados neste banco';
    return;
  end if;
  insert into storage.buckets (id, name, public) values ('documentos', 'documentos', false) on conflict (id) do nothing;
  insert into storage.buckets (id, name, public) values ('exportacoes', 'exportacoes', false) on conflict (id) do nothing;

  -- Leitura direta pelo cliente só do prefixo do próprio escritório; escrita e remoção ficam com a service role.
  execute 'drop policy if exists documentos_leitura_escritorio on storage.objects';
  execute $p$
    create policy documentos_leitura_escritorio on storage.objects for select to authenticated
      using (bucket_id in ('documentos', 'exportacoes')
             and (storage.foldername(name))[1] = app.escritorio_atual()::text
             and app.mfa_satisfeita())
  $p$;
end
$$;
