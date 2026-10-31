-- 0054: busca de jurisprudência que ignora acento. "importacao" tem que achar "importação".
-- Cria a configuração pt_sem_acento (português + unaccent) e refaz a coluna tsv e as funções de busca.
-- A migration 0036 não é editada: aqui só se substitui o que ela criou.

create extension if not exists unaccent schema public;

do $$
begin
  if not exists (select 1 from pg_ts_config where cfgname = 'pt_sem_acento') then
    create text search configuration public.pt_sem_acento (copy = pg_catalog.portuguese);
    alter text search configuration public.pt_sem_acento
      alter mapping for hword, hword_part, word with public.unaccent, pg_catalog.portuguese_stem;
  end if;
end
$$;

drop index if exists ref.jurisprudencia_chunks_tsv_idx;
alter table ref.jurisprudencia_chunks drop column tsv;
alter table ref.jurisprudencia_chunks add column tsv tsvector generated always as (to_tsvector('public.pt_sem_acento', texto)) stored;
create index if not exists jurisprudencia_chunks_tsv_idx on ref.jurisprudencia_chunks using gin (tsv);

create or replace function public.buscar_jurisprudencia_texto(p_consulta text, p_limite int default 10)
returns table (jurisprudencia_id uuid, referencia text, trecho text, pontuacao real)
language sql
stable
set search_path = ''
as $$
  select c.jurisprudencia_id, j.referencia_citacao, left(c.texto, 800), ts_rank_cd(c.tsv, q.consulta)::real
  from ref.jurisprudencia_chunks c
  join ref.jurisprudencia j on j.id = c.jurisprudencia_id
  cross join websearch_to_tsquery('public.pt_sem_acento', p_consulta) as q(consulta)
  where c.tsv @@ q.consulta
  order by 4 desc
  limit least(greatest(p_limite, 1), 50)
$$;

-- Busca híbrida: só existe com pgvector instalado (ver 0036). Recriada com a mesma configuração.
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
            cross join websearch_to_tsquery('public.pt_sem_acento', p_consulta) as q(consulta)
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
  end if;
end
$$;
