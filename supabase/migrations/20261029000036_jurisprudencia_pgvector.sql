-- 0036: base de jurisprudência (lote 7). Busca por texto em português sempre; quando a extensão vector está
-- instalada e há embeddings, a busca passa a ser híbrida (FTS + similaridade, fusão RRF). Sem vector, nada quebra:
-- o código chama buscar_jurisprudencia_texto e a coluna embedding nem existe.
-- Dados de referência globais (schema ref), como ref.indices_economicos: leitura para usuários autenticados,
-- escrita só pela service role (importação e job).

-- pgvector só é criado onde estiver disponível (o CI local pode não ter a extensão).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'vector') then
    create extension if not exists vector schema public;
  end if;
end
$$;

create table if not exists ref.jurisprudencia (
  id uuid primary key default gen_random_uuid(),
  tribunal text not null,
  tipo text not null check (tipo in ('sumula', 'sumula_vinculante', 'tema_repetitivo', 'acordao', 'decisao_monocratica', 'outro')),
  referencia_citacao text not null,
  orgao text,
  data_julgamento date,
  ementa text not null,
  fonte text not null default 'importacao',
  fonte_url text,
  importado_em timestamptz not null default now(),
  unique (tribunal, referencia_citacao)
);

create table if not exists ref.jurisprudencia_chunks (
  id uuid primary key default gen_random_uuid(),
  jurisprudencia_id uuid not null references ref.jurisprudencia(id) on delete cascade,
  ordem int not null,
  texto text not null,
  tsv tsvector generated always as (to_tsvector('portuguese', texto)) stored,
  unique (jurisprudencia_id, ordem)
);
create index if not exists jurisprudencia_chunks_tsv_idx on ref.jurisprudencia_chunks using gin (tsv);

-- Embedding só existe se a extensão estiver instalada. Chunk sem embedding é a fila do job gerar-embeddings.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    alter table ref.jurisprudencia_chunks add column if not exists embedding public.vector(1024);
    create index if not exists jurisprudencia_chunks_embedding_idx on ref.jurisprudencia_chunks using hnsw (embedding public.vector_cosine_ops);
  end if;
end
$$;

grant select on ref.jurisprudencia, ref.jurisprudencia_chunks to authenticated, service_role;
grant insert, update, delete on ref.jurisprudencia, ref.jurisprudencia_chunks to service_role;

-- Busca só por texto (sempre disponível)
create or replace function public.buscar_jurisprudencia_texto(p_consulta text, p_limite int default 10)
returns table (jurisprudencia_id uuid, referencia text, trecho text, pontuacao real)
language sql
stable
set search_path = ''
as $$
  select c.jurisprudencia_id, j.referencia_citacao, left(c.texto, 800), ts_rank_cd(c.tsv, q.consulta)::real
  from ref.jurisprudencia_chunks c
  join ref.jurisprudencia j on j.id = c.jurisprudencia_id
  cross join websearch_to_tsquery('portuguese', p_consulta) as q(consulta)
  where c.tsv @@ q.consulta
  order by 4 desc
  limit least(greatest(p_limite, 1), 50)
$$;
revoke execute on function public.buscar_jurisprudencia_texto(text, int) from public, anon;
grant execute on function public.buscar_jurisprudencia_texto(text, int) to authenticated, service_role;

-- Busca híbrida (RRF), criada só com pgvector instalado. Recebe o embedding da consulta como texto '[...]'.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    execute $fn$
      create or replace function public.buscar_jurisprudencia(p_consulta text, p_embedding text, p_limite int default 10)
      returns table (jurisprudencia_id uuid, referencia text, trecho text, pontuacao real)
      language sql
      stable
      set search_path = ''
      as $sql$
        with fts as (
          select x.id, row_number() over (order by x.pontos desc) as posicao
          from (
            select c.id, ts_rank_cd(c.tsv, q.consulta) as pontos
            from ref.jurisprudencia_chunks c
            cross join websearch_to_tsquery('portuguese', p_consulta) as q(consulta)
            where c.tsv @@ q.consulta
          ) x
        ),
        vec as (
          select x.id, row_number() over (order by x.distancia) as posicao
          from (
            select c.id, c.embedding operator(public.<=>) p_embedding::public.vector as distancia
            from ref.jurisprudencia_chunks c
            where c.embedding is not null
            order by distancia
            limit 50
          ) x
        ),
        fusao as (
          select coalesce(f.id, v.id) as id,
                 coalesce(1.0 / (60 + f.posicao), 0) + coalesce(1.0 / (60 + v.posicao), 0) as pontos
          from fts f
          full join vec v on v.id = f.id
        )
        select c.jurisprudencia_id, j.referencia_citacao, left(c.texto, 800), f.pontos::real
        from fusao f
        join ref.jurisprudencia_chunks c on c.id = f.id
        join ref.jurisprudencia j on j.id = c.jurisprudencia_id
        order by f.pontos desc
        limit least(greatest(p_limite, 1), 50)
      $sql$
    $fn$;
    execute 'revoke execute on function public.buscar_jurisprudencia(text, text, int) from public, anon';
    execute 'grant execute on function public.buscar_jurisprudencia(text, text, int) to authenticated, service_role';
  end if;
end
$$;

-- Job de embeddings a cada 10 minutos (no-op sem chave Voyage; ver src/server/jobs/gerar-embeddings.ts)
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron indisponível: rotina gerar-embeddings não agendada neste banco';
    return;
  end if;
  perform cron.schedule('rotina:gerar-embeddings', '*/10 * * * *', format('select app.chamar_rotina(%L)', 'gerar-embeddings'));
end
$$;
