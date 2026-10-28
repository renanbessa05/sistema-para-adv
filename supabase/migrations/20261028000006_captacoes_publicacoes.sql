-- 0006: captações (rodadas de ingestão), publicações, eventos de publicação e auditoria de acessos
--
-- Sigilo (docs/escopo-revisado.md, 2.1 "Sigilo" e 2.3 "Exceções"): `publicacoes.texto` e `payload_bruto`
-- não têm privilégio SELECT para `authenticated`. O grant é feito por lista explícita de colunas, por isso
-- **`select *` em `publicacoes` falha para usuários logados** ("permission denied for table publicacoes").
-- O app deve listar as colunas (o PostgREST com `select=col1,col2` funciona) e ler o texto pela RPC
-- `publicacao_texto(id)`, que checa sigilo e papel e grava `auditoria_acessos`.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'fonte_publicacao') then
    create type public.fonte_publicacao as enum ('djen', 'pje_manual', 'email_manual', 'datajud', 'pje_extensao');
  end if;
  if not exists (select 1 from pg_type where typname = 'publicacao_tipo') then
    create type public.publicacao_tipo as enum ('intimacao', 'citacao', 'despacho', 'decisao', 'sentenca', 'acordao', 'edital', 'pauta', 'outro');
  end if;
  if not exists (select 1 from pg_type where typname = 'publicacao_status') then
    create type public.publicacao_status as enum ('nova', 'classificada', 'vinculada', 'sem_processo', 'com_prazo_sugerido', 'sem_prazo', 'tratada', 'ignorada', 'duplicada', 'arquivada');
  end if;
  if not exists (select 1 from pg_type where typname = 'vinculo_tipo') then
    create type public.vinculo_tipo as enum ('automatico_numero', 'manual', 'nao_e_nosso');
  end if;
  if not exists (select 1 from pg_type where typname = 'classificado_por') then
    create type public.classificado_por as enum ('ia', 'humano');
  end if;
  if not exists (select 1 from pg_type where typname = 'captacao_status') then
    create type public.captacao_status as enum ('em_andamento', 'concluida', 'falhou');
  end if;
  if not exists (select 1 from pg_type where typname = 'acesso_acao') then
    create type public.acesso_acao as enum ('visualizou_texto', 'exportou', 'baixou', 'visualizou_cliente');
  end if;
end
$$;

-- "Sistema" = service role (jobs) ou conexão direta sem JWT (migrations, pg_cron, testes).
-- Toda requisição que passa pelo PostgREST carrega JWT (anon, authenticated ou service_role).
create or replace function app.eh_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role() = 'service_role', false)
      or coalesce(current_setting('role', true), 'none') = 'service_role'
      or auth.jwt() is null
$$;

-- Rodadas de captação (uma linha por execução do job, por escritório e fonte)
create table if not exists public.captacoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  fonte public.fonte_publicacao not null,
  iniciada_em timestamptz not null default now(),
  finalizada_em timestamptz,
  parametros jsonb not null default '{}'::jsonb,
  itens_recebidos int not null default 0,
  itens_novos int not null default 0,
  itens_duplicados int not null default 0,
  erros jsonb not null default '[]'::jsonb,
  status public.captacao_status not null default 'em_andamento',
  criado_em timestamptz not null default now()
);
create index if not exists captacoes_escritorio_inicio_idx on public.captacoes (escritorio_id, iniciada_em desc);

create table if not exists public.publicacoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  captacao_id uuid references public.captacoes(id) on delete set null,
  fonte public.fonte_publicacao not null,
  id_externo text,                                   -- id da comunicação no DJEN; nulo em lançamento manual
  hash_djen text,                                    -- hash da API (muda a cada republicação); serve para a certidão
  hash_dedup text,                                   -- sha256 de tribunal|número|data|texto normalizado (src/lib/djen/hash.ts)
  payload_bruto jsonb,                               -- item original da API (SEM privilégio de leitura para authenticated)
  tribunal_id uuid references ref.tribunais(id),
  numero_cnj char(20) check (numero_cnj is null or app.cnj_valido(numero_cnj)),
  numero_processo_texto text,
  processo_id uuid references public.processos(id) on delete set null,
  vinculo_tipo public.vinculo_tipo,
  motivo_nao_e_nosso text,
  tipo_origem text,                                  -- tipoComunicacao como veio da API
  tipo_documento text,
  tipo public.publicacao_tipo,
  tipo_classificado_por public.classificado_por,
  orgao text,
  classe text,
  meio text,
  data_disponibilizacao date,
  data_publicacao date,
  texto text,                                        -- SEM privilégio de leitura para authenticated: ler por publicacao_texto()
  link text,
  destinatarios jsonb not null default '[]'::jsonb,
  destinatario_advogados jsonb not null default '[]'::jsonb,
  resumo_ia text,
  sugere_sigilo boolean not null default false,
  status public.publicacao_status not null default 'nova',
  tratada_por uuid,
  tratada_em timestamptz,
  motivo_tratamento text,
  publicacao_anterior_id uuid references public.publicacoes(id) on delete set null,
  ia_execucao_id uuid,                               -- FK para ia_execucoes entra na migration que cria a tabela
  cancelada boolean not null default false,          -- publicação cancelada pelo tribunal (DJEN: ativo=false / status 'C')
  motivo_cancelamento text,
  data_cancelamento timestamptz,                     -- formato da API a confirmar; o normalizador converte
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (escritorio_id, fonte, id_externo)
);
create index if not exists publicacoes_escritorio_status_data_idx on public.publicacoes (escritorio_id, status, data_disponibilizacao);
create index if not exists publicacoes_escritorio_processo_idx on public.publicacoes (escritorio_id, processo_id);
create index if not exists publicacoes_escritorio_hash_idx on public.publicacoes (escritorio_id, hash_dedup);
create index if not exists publicacoes_escritorio_cnj_idx on public.publicacoes (escritorio_id, numero_cnj);
drop trigger if exists publicacoes_atualizado_em on public.publicacoes;
create trigger publicacoes_atualizado_em before update on public.publicacoes for each row execute function app.set_atualizado_em();

create table if not exists public.publicacao_eventos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  publicacao_id uuid not null references public.publicacoes(id) on delete cascade,
  de_status public.publicacao_status,                -- nulo = "(captada)"
  para_status public.publicacao_status not null,
  usuario_id uuid,                                   -- nulo = sistema
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists publicacao_eventos_publicacao_idx on public.publicacao_eventos (publicacao_id, criado_em);
create index if not exists publicacao_eventos_escritorio_idx on public.publicacao_eventos (escritorio_id, criado_em desc);

-- Quem viu o quê (LGPD art. 37). INSERT só por função security definer; SELECT só sócio.
create table if not exists public.auditoria_acessos (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  usuario_id uuid,
  objeto_tipo text not null,                         -- 'publicacao', 'processo', 'cliente', 'documento'...
  objeto_id uuid,
  acao public.acesso_acao not null,
  contexto jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists auditoria_acessos_escritorio_idx on public.auditoria_acessos (escritorio_id, criado_em desc);
create index if not exists auditoria_acessos_objeto_idx on public.auditoria_acessos (escritorio_id, objeto_tipo, objeto_id);

-- Evento "(captada) → nova" ao gravar a publicação (job, lançamento manual ou RPC)
create or replace function app.registrar_publicacao_criada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.publicacao_eventos (escritorio_id, publicacao_id, de_status, para_status, usuario_id, dados)
  values (new.escritorio_id, new.id, null, new.status, app.usuario_atual(), jsonb_build_object('fonte', new.fonte, 'captacao_id', new.captacao_id));
  return new;
end
$$;
drop trigger if exists publicacoes_registrar_criada on public.publicacoes;
create trigger publicacoes_registrar_criada after insert on public.publicacoes for each row execute function app.registrar_publicacao_criada();

-- Leitura do texto: qualquer membro do escritório, exceto quando a publicação está ligada a processo
-- sigiloso (aí só sócio, advogado responsável ou colaborador: app.pode_ver_sigiloso). Toda leitura vai para
-- auditoria_acessos (com 'sigiloso' no contexto), não só as de processo sigiloso.
create or replace function public.publicacao_texto(p_publicacao_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pub record;
  sigiloso boolean := false;
begin
  if app.escritorio_atual() is null then
    raise exception 'Usuário sem escritório' using errcode = '42501';
  end if;

  select p.id, p.escritorio_id, p.processo_id, p.texto
    into pub
    from public.publicacoes p
   where p.id = p_publicacao_id
     and p.escritorio_id = app.escritorio_atual();
  if not found then
    raise exception 'Publicação não encontrada' using errcode = 'P0002';
  end if;

  if pub.processo_id is not null then
    select pr.segredo_justica into sigiloso from public.processos pr where pr.id = pub.processo_id;
    if not app.pode_ver_sigiloso(pub.processo_id) then
      raise exception 'Sem permissão para ler o texto de publicação de processo sigiloso' using errcode = '42501';
    end if;
  end if;

  insert into public.auditoria_acessos (escritorio_id, usuario_id, objeto_tipo, objeto_id, acao, contexto)
  values (pub.escritorio_id, app.usuario_atual(), 'publicacao', pub.id, 'visualizou_texto',
          jsonb_build_object('processo_id', pub.processo_id, 'sigiloso', coalesce(sigiloso, false), 'papel', app.papel_atual()));

  return pub.texto;
end
$$;

-- Tabela de transições de docs/regras/estados.md. "sistema" = service role; estagiário nunca transiciona;
-- administrativo só trata sem_processo (vinculada manual / ignorada) e duplicada; advogado e sócio fazem tudo.
create or replace function app.transicao_publicacao_permitida(p_de public.publicacao_status, p_para public.publicacao_status, p_papel text, p_sistema boolean)
returns boolean
language plpgsql
immutable
as $$
declare
  existe boolean;
begin
  if p_de = p_para then
    return false;
  end if;
  existe := case
    when p_para = 'duplicada' then true                                           -- qualquer → duplicada
    when p_de = 'nova' and p_para = 'classificada' then true
    when p_de = 'classificada' and p_para in ('vinculada', 'sem_processo') then true
    when p_de = 'sem_processo' and p_para in ('vinculada', 'ignorada') then true
    when p_de = 'vinculada' and p_para in ('com_prazo_sugerido', 'sem_prazo') then true
    when p_de in ('com_prazo_sugerido', 'sem_prazo') and p_para = 'tratada' then true
    when p_de in ('tratada', 'ignorada', 'duplicada', 'sem_prazo') and p_para = 'arquivada' then true
    else false
  end;
  if not existe then
    return false;
  end if;
  if p_sistema then
    return true;
  end if;
  return case p_papel
    when 'socio' then true
    when 'advogado' then true
    when 'administrativo' then (p_de = 'sem_processo' and p_para in ('vinculada', 'ignorada')) or p_para = 'duplicada'
    else false                                                                    -- estagiário e desconhecidos
  end;
end
$$;

-- p_dados aceitos por destino:
--   vinculada:    processo_id (obrigatório), vinculo_tipo (padrão: 'manual' para humano, 'automatico_numero' para sistema)
--   ignorada:     motivo (obrigatório) → motivo_nao_e_nosso, vinculo_tipo = 'nao_e_nosso'
--   duplicada:    publicacao_anterior_id (obrigatório, do mesmo escritório)
--   classificada: tipo, tipo_classificado_por, resumo_ia, sugere_sigilo, ia_execucao_id, numero_cnj (opcionais)
--   sem_prazo, tratada, demais: motivo (opcional)
create or replace function public.transicionar_publicacao(p_id uuid, p_para public.publicacao_status, p_dados jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pub record;
  sistema boolean := app.eh_service_role();
  papel text := app.papel_atual();
  usuario uuid := app.usuario_atual();
  v_processo_id uuid;
  v_anterior_id uuid;
  v_vinculo public.vinculo_tipo;
begin
  p_dados := coalesce(p_dados, '{}'::jsonb);

  if sistema then
    select * into pub from public.publicacoes p where p.id = p_id;
  else
    select * into pub from public.publicacoes p where p.id = p_id and p.escritorio_id = app.escritorio_atual();
  end if;
  if not found then
    raise exception 'Publicação não encontrada' using errcode = 'P0002';
  end if;

  if not sistema and papel = 'estagiario' then
    raise exception 'Estagiário não transiciona publicação' using errcode = '42501';
  end if;
  if not app.transicao_publicacao_permitida(pub.status, p_para, papel, sistema) then
    raise exception 'Transição de publicação não permitida: % → % (papel %)', pub.status, p_para, coalesce(papel, 'sistema') using errcode = '42501';
  end if;

  if p_para = 'vinculada' then
    v_processo_id := nullif(p_dados ->> 'processo_id', '')::uuid;
    if v_processo_id is null then
      raise exception 'Vincular exige processo_id em p_dados' using errcode = '22023';
    end if;
    if not exists (select 1 from public.processos pr where pr.id = v_processo_id and pr.escritorio_id = pub.escritorio_id) then
      raise exception 'Processo não encontrado no escritório' using errcode = 'P0002';
    end if;
    v_vinculo := coalesce(nullif(p_dados ->> 'vinculo_tipo', '')::public.vinculo_tipo, (case when sistema then 'automatico_numero' else 'manual' end)::public.vinculo_tipo);
  elsif p_para = 'ignorada' then
    if nullif(p_dados ->> 'motivo', '') is null then
      raise exception 'Ignorar exige motivo em p_dados' using errcode = '22023';
    end if;
    v_vinculo := 'nao_e_nosso';
  elsif p_para = 'duplicada' then
    v_anterior_id := nullif(p_dados ->> 'publicacao_anterior_id', '')::uuid;
    if v_anterior_id is null or v_anterior_id = pub.id
       or not exists (select 1 from public.publicacoes a where a.id = v_anterior_id and a.escritorio_id = pub.escritorio_id) then
      raise exception 'Duplicada exige publicacao_anterior_id válido do mesmo escritório' using errcode = '22023';
    end if;
  end if;

  update public.publicacoes p
     set status = p_para,
         processo_id = coalesce(v_processo_id, p.processo_id),
         vinculo_tipo = coalesce(v_vinculo, p.vinculo_tipo),
         motivo_nao_e_nosso = case when p_para = 'ignorada' then p_dados ->> 'motivo' else p.motivo_nao_e_nosso end,
         publicacao_anterior_id = coalesce(v_anterior_id, p.publicacao_anterior_id),
         tipo = case when p_para = 'classificada' then coalesce(nullif(p_dados ->> 'tipo', '')::public.publicacao_tipo, p.tipo) else p.tipo end,
         tipo_classificado_por = case when p_para = 'classificada'
           then coalesce(nullif(p_dados ->> 'tipo_classificado_por', '')::public.classificado_por, (case when sistema then 'ia' else 'humano' end)::public.classificado_por)
           else p.tipo_classificado_por end,
         resumo_ia = case when p_para = 'classificada' then coalesce(p_dados ->> 'resumo_ia', p.resumo_ia) else p.resumo_ia end,
         sugere_sigilo = case when p_para = 'classificada' then coalesce((p_dados ->> 'sugere_sigilo')::boolean, p.sugere_sigilo) else p.sugere_sigilo end,
         ia_execucao_id = coalesce(nullif(p_dados ->> 'ia_execucao_id', '')::uuid, p.ia_execucao_id),
         numero_cnj = case when p_para = 'classificada' and nullif(p_dados ->> 'numero_cnj', '') is not null then app.cnj_digitos(p_dados ->> 'numero_cnj') else p.numero_cnj end,
         tratada_por = case when not sistema then usuario else p.tratada_por end,
         tratada_em = case when not sistema or p_para in ('tratada', 'ignorada', 'duplicada', 'sem_prazo') then now() else p.tratada_em end,
         motivo_tratamento = coalesce(nullif(p_dados ->> 'motivo', ''), p.motivo_tratamento)
   where p.id = pub.id;

  insert into public.publicacao_eventos (escritorio_id, publicacao_id, de_status, para_status, usuario_id, dados)
  values (pub.escritorio_id, pub.id, pub.status, p_para, usuario, p_dados || jsonb_build_object('sistema', sistema, 'papel', papel));
end
$$;

-- RLS
alter table public.captacoes enable row level security;
alter table public.publicacoes enable row level security;
alter table public.publicacao_eventos enable row level security;
alter table public.auditoria_acessos enable row level security;

-- Captações: leitura por quem vê /admin/status (sócio, advogado, administrativo); escrita só pelos jobs (service role)
drop policy if exists captacoes_select on public.captacoes;
create policy captacoes_select on public.captacoes for select to authenticated
  using (escritorio_id = app.escritorio_atual() and app.papel_atual() in ('socio', 'advogado', 'administrativo'));

drop policy if exists tenant_isolamento on public.publicacoes;
create policy tenant_isolamento on public.publicacoes for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
-- Lançamento manual (PJe, e-mail): sócio, advogado e administrativo; nasce 'nova'
drop policy if exists publicacoes_insert_papel on public.publicacoes;
create policy publicacoes_insert_papel on public.publicacoes as restrictive for insert to authenticated
  with check (app.papel_atual() in ('socio', 'advogado', 'administrativo') and status = 'nova' and fonte in ('pje_manual', 'email_manual'));
drop policy if exists publicacoes_update_papel on public.publicacoes;
create policy publicacoes_update_papel on public.publicacoes as restrictive for update to authenticated
  using (app.papel_atual() in ('socio', 'advogado', 'administrativo'));

drop policy if exists tenant_isolamento on public.publicacao_eventos;
create policy tenant_isolamento on public.publicacao_eventos for select to authenticated using (escritorio_id = app.escritorio_atual());

drop policy if exists auditoria_select_socio on public.auditoria_acessos;
create policy auditoria_select_socio on public.auditoria_acessos for select to authenticated
  using (escritorio_id = app.escritorio_atual() and app.eh_socio());

-- Grants. publicacoes: SELECT por lista de colunas (texto e payload_bruto fora); UPDATE direto só nos campos
-- descritivos (status, vínculo, tratamento e classificação mudam pela RPC transicionar_publicacao).
grant select on public.captacoes to authenticated;
grant select (
  id, escritorio_id, captacao_id, fonte, id_externo, hash_djen, hash_dedup, tribunal_id, numero_cnj, numero_processo_texto,
  processo_id, vinculo_tipo, motivo_nao_e_nosso, tipo_origem, tipo_documento, tipo, tipo_classificado_por, orgao, classe, meio,
  data_disponibilizacao, data_publicacao, link, destinatarios, destinatario_advogados, resumo_ia, sugere_sigilo, status,
  tratada_por, tratada_em, motivo_tratamento, publicacao_anterior_id, ia_execucao_id, cancelada, motivo_cancelamento,
  data_cancelamento, criado_em, atualizado_em
) on public.publicacoes to authenticated;
revoke select (texto, payload_bruto) on public.publicacoes from authenticated;
grant insert on public.publicacoes to authenticated;
grant update (numero_cnj, numero_processo_texto, tribunal_id, tipo_origem, tipo_documento, orgao, classe, meio, data_disponibilizacao, data_publicacao, link, destinatarios, destinatario_advogados, sugere_sigilo)
  on public.publicacoes to authenticated;
grant select on public.publicacao_eventos to authenticated;
grant select on public.auditoria_acessos to authenticated;
grant all on public.captacoes, public.publicacoes, public.publicacao_eventos, public.auditoria_acessos to service_role;

grant execute on function public.publicacao_texto(uuid) to authenticated, service_role;
grant execute on function public.transicionar_publicacao(uuid, public.publicacao_status, jsonb) to authenticated, service_role;
