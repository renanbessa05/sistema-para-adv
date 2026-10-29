-- 0033: revisor de peças (Fase 2, lote 5; E4 do escopo)
-- Cada revisão confere uma versão de minuta (ou texto colado/arquivo) com o checklist formal: itens OK, atenção,
-- crítico ou não verificável. Crítico aberto bloqueia o envio para aprovação, salvo justificativa por item.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'revisao_origem') then
    create type public.revisao_origem as enum ('versao', 'colada', 'arquivo');
  end if;
end
$$;

create table if not exists public.minuta_revisoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  minuta_versao_id uuid references public.minuta_versoes(id) on delete cascade,
  documento_id uuid references public.documentos(id) on delete set null,
  origem public.revisao_origem not null,
  ia_execucao_id uuid references public.ia_execucoes(id) on delete set null,
  veredito text,
  itens jsonb not null default '[]'::jsonb,
  relatorio_md text,
  criticos_abertos int not null default 0 check (criticos_abertos >= 0),
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index if not exists minuta_revisoes_versao_idx on public.minuta_revisoes (minuta_versao_id, criado_em desc);

alter table public.minuta_revisoes enable row level security;
drop policy if exists tenant_isolamento on public.minuta_revisoes;
create policy tenant_isolamento on public.minuta_revisoes for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists mfa_obrigatorio on public.minuta_revisoes;
create policy mfa_obrigatorio on public.minuta_revisoes as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita());
grant select, insert, update, delete on public.minuta_revisoes to authenticated;
grant all on public.minuta_revisoes to service_role;

-- Resolve um item crítico com justificativa obrigatória (advogado ou sócio)
create or replace function public.revisao_resolver_item(p_revisao uuid, p_item text, p_justificativa text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.minuta_revisoes; novos jsonb; abertos int;
begin
  if not app.mfa_satisfeita() then raise exception 'Segundo fator obrigatório' using errcode = '42501'; end if;
  if not app.eh_advogado_ou_socio() then raise exception 'Apenas advogado ou sócio resolve item crítico' using errcode = '42501'; end if;
  if nullif(btrim(p_justificativa), '') is null then raise exception 'Justifique o item' using errcode = '22023'; end if;
  select * into r from public.minuta_revisoes where id = p_revisao and escritorio_id = app.escritorio_atual() for update;
  if not found then raise exception 'Revisão não encontrada' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(case when it ->> 'id' = p_item
           then jsonb_set(jsonb_set(it, '{situacao}', '"atencao"'::jsonb), '{justificativa}', to_jsonb(p_justificativa))
           else it end), '[]'::jsonb)
    into novos
    from jsonb_array_elements(r.itens) it;
  select count(*)::int into abertos from jsonb_array_elements(novos) it where it ->> 'situacao' = 'critico';
  update public.minuta_revisoes set itens = novos, criticos_abertos = abertos where id = r.id;
end
$$;
revoke execute on function public.revisao_resolver_item(uuid, text, text) from public, anon;
grant execute on function public.revisao_resolver_item(uuid, text, text) to authenticated, service_role;

-- Envio para aprovação: crítico aberto na última revisão da versão bloqueia, salvo justificativa no comentário
create or replace function public.minuta_enviar_aprovacao(p_minuta uuid, p_comentario text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare m public.minutas; v public.minuta_versoes; lacunas int; criticos int; aprovacao uuid;
begin
  m := app.minuta_para_etapa(p_minuta);
  if m.versao_atual_id is null then raise exception 'Redija a peça (etapa 6) antes de enviar' using errcode = '55000'; end if;
  if m.status not in ('redigida', 'devolvida', 'em_revisao_ia') then raise exception 'Minuta em % não pode ser enviada', m.status using errcode = '55000'; end if;
  select * into v from public.minuta_versoes where id = m.versao_atual_id;
  lacunas := coalesce((v.validacao ->> 'lacunas')::int, 0);
  if lacunas > 0 and nullif(btrim(p_comentario), '') is null then
    raise exception 'A peça tem % lacuna(s) [[VERIFICAR]]; preencha ou justifique no comentário', lacunas using errcode = '55000';
  end if;
  if coalesce(jsonb_array_length(v.validacao -> 'citacoes_sem_id'), 0) > 0 then
    raise exception 'A peça cita jurisprudência sem registro na base; remova ou confirme pela pesquisa' using errcode = '55000';
  end if;
  select coalesce(criticos_abertos, 0) into criticos from public.minuta_revisoes where minuta_versao_id = v.id order by criado_em desc limit 1;
  if coalesce(criticos, 0) > 0 and nullif(btrim(p_comentario), '') is null then
    raise exception 'A revisão tem % item(ns) crítico(s) aberto(s); resolva ou justifique no comentário', criticos using errcode = '55000';
  end if;
  aprovacao := public.criar_aprovacao('minuta', m.id, jsonb_build_object('titulo', m.titulo, 'tipo_peca', m.tipo_peca, 'processo_id', m.processo_id, 'versao', v.numero, 'lacunas', lacunas, 'criticos', coalesce(criticos, 0), 'comentario', p_comentario), v.ia_execucao_id, 'usuario');
  update public.minutas set status = 'aguardando_aprovacao', aprovacao_id = aprovacao where id = m.id;
  return aprovacao;
end
$$;
revoke execute on function public.minuta_enviar_aprovacao(uuid, text) from public, anon;
grant execute on function public.minuta_enviar_aprovacao(uuid, text) to authenticated, service_role;
