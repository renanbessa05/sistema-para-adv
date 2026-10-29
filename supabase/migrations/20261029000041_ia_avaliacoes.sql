-- 0041: avaliações de agentes, custo do mês por agente e funções públicas do teto (Fase 3, lote 10)
--
-- ia_avaliacoes guarda o resultado de `scripts/avaliar-agente.ts --gravar`: uma linha por rodada de avaliação de um
-- agente, com a versão do prompt, o modo (falso = sem API; real = com a API), totais e o detalhe por caso (jsonb).
-- Escrita só pela service role (o script); leitura só pelo sócio do escritório (tela /admin/ia).
--
-- ia_custos_do_escritorio agrupa ia_execucoes do mês por agente (chamadas, erros, tokens, custo e taxa de acerto do
-- cache). É security invoker: o RLS de ia_execucoes (só sócio) continua valendo.
--
-- public.ia_gasto_mes e public.ia_teto_escritorio são wrappers das funções de app (0026). A config.toml expõe só os
-- schemas public, ref e graphql_public, então `admin.rpc('ia_gasto_mes')` em src/server/ia/teto.ts procurava uma
-- função que não existia: o erro voltava em `error`, `data` vinha nulo e o teto nunca bloqueava. Estes wrappers
-- corrigem isso. Só service role os executa: a função de app não confere o escritório do chamador.
--
-- Chaves de escritorio_configuracoes lidas pelo código (sem linha = padrão do ambiente / padrão do código):
--   'ia.teto_mensal_usd'  número em US$ (0026)
--   'ia.alerta_percentual' número de 1 a 100; padrão 80 (job alertas-ia, migration 0043)

create table if not exists public.ia_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  agente text not null,
  agente_versao text not null,
  modo text not null check (modo in ('falso', 'real')),
  modelo text,
  total_casos int not null default 0 check (total_casos >= 0),
  casos_ok int not null default 0 check (casos_ok >= 0),
  situacao text not null check (situacao in ('aprovada', 'reprovada')),
  custo_usd numeric(12,6) not null default 0 check (custo_usd >= 0),
  detalhes jsonb not null default '[]'::jsonb,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (casos_ok <= total_casos)
);
create index if not exists ia_avaliacoes_escritorio_idx on public.ia_avaliacoes (escritorio_id, agente, criado_em desc);
drop trigger if exists ia_avaliacoes_atualizado_em on public.ia_avaliacoes;
create trigger ia_avaliacoes_atualizado_em before update on public.ia_avaliacoes for each row execute function app.set_atualizado_em();

alter table public.ia_avaliacoes enable row level security;
drop policy if exists ia_avaliacoes_select_socio on public.ia_avaliacoes;
create policy ia_avaliacoes_select_socio on public.ia_avaliacoes for select to authenticated using (escritorio_id = app.escritorio_atual() and app.eh_socio());
grant select on public.ia_avaliacoes to authenticated;
grant all on public.ia_avaliacoes to service_role;

do $$
declare
  t text;
begin
  foreach t in array array['ia_avaliacoes'] loop
    execute format('drop policy if exists mfa_obrigatorio on public.%I', t);
    execute format('create policy mfa_obrigatorio on public.%I as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita())', t);
  end loop;
end
$$;

create or replace function public.ia_custos_do_escritorio(p_escritorio uuid, p_data date default (now() at time zone 'UTC')::date)
returns table (
  agente text,
  chamadas bigint,
  erros bigint,
  input_tokens bigint,
  output_tokens bigint,
  cache_criacao_tokens bigint,
  cache_leitura_tokens bigint,
  custo_usd numeric,
  taxa_cache_hit numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.agente,
         count(*)::bigint,
         (count(*) filter (where e.status <> 'ok'))::bigint,
         sum(e.input_tokens)::bigint,
         sum(e.output_tokens)::bigint,
         sum(e.cache_creation_input_tokens)::bigint,
         sum(e.cache_read_input_tokens)::bigint,
         round(sum(coalesce(e.custo_estimado, 0)), 6),
         case when sum(e.input_tokens + e.cache_creation_input_tokens + e.cache_read_input_tokens) > 0
              then round(sum(e.cache_read_input_tokens)::numeric / sum(e.input_tokens + e.cache_creation_input_tokens + e.cache_read_input_tokens)::numeric, 4)
              else null
         end
    from public.ia_execucoes e
   where e.escritorio_id = p_escritorio
     and e.criado_em >= date_trunc('month', p_data::timestamp) at time zone 'UTC'
     and e.criado_em <  (date_trunc('month', p_data::timestamp) + interval '1 month') at time zone 'UTC'
   group by e.agente
   order by sum(coalesce(e.custo_estimado, 0)) desc, e.agente
$$;
revoke execute on function public.ia_custos_do_escritorio(uuid, date) from public, anon;
grant execute on function public.ia_custos_do_escritorio(uuid, date) to authenticated, service_role;

create or replace function public.ia_gasto_mes(p_escritorio uuid, p_data date default null)
returns numeric
language sql
stable
set search_path = ''
as $$
  select app.ia_gasto_mes(p_escritorio, coalesce(p_data, (now() at time zone 'UTC')::date))
$$;
revoke execute on function public.ia_gasto_mes(uuid, date) from public, anon, authenticated;
grant execute on function public.ia_gasto_mes(uuid, date) to service_role;

create or replace function public.ia_teto_escritorio(p_escritorio uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select app.ia_teto_escritorio(p_escritorio)
$$;
revoke execute on function public.ia_teto_escritorio(uuid) from public, anon, authenticated;
grant execute on function public.ia_teto_escritorio(uuid) to service_role;
