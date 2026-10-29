-- 0045: LGPD como produto (Fase 3, lote 12; P5 do escopo)
--
-- 1. operacoes_tratamento: inventário das operações (art. 37 da LGPD), semeado a partir de docs/lgpd/registro-operacoes.md
--    para cada escritório existente e para os criados depois (trigger em escritorios).
-- 2. lgpd_solicitacoes: pedidos dos titulares (acesso, correção, eliminação, portabilidade, revogação). O prazo de resposta
--    é informado por quem registra o pedido; esta migration não fixa prazo legal.
-- 3. politicas_retencao: uma linha por tipo de dado. prazo_meses NULL = sem descarte automático. Ativar exige confirmação
--    registrada (quem e quando). Constraint: ativo só com prazo e confirmação.
-- 4. lgpd_auditoria: quem anonimizou, exportou, configurou retenção e quanto o descarte apagou. Só sócio lê; escrita só
--    por função security definer ou pela service role.
-- 5. RPCs: lgpd_configurar_politica (ativa/desativa; exige a frase ATIVAR DESCARTE) e lgpd_anonimizar_titular
--    (irreversível: exige o nome exato do titular; mantém processos e registros, troca os dados pessoais).
-- 6. Storage: exportações LGPD no bucket exportacoes, prefixo lgpd/, legíveis só pelo sócio (policy restritiva).
-- 7. Rotina descarte-retencao domingo 05h UTC (01h em Cuiabá). Por padrão só LISTA candidatos; apaga apenas política
--    ativa e confirmada de tipo com descarte automático (ver src/lib/lgpd/retencao.ts).
--
-- Laço de MFA (0016) e policy de sócio nas tabelas novas. Nenhuma tabela nova é lida por anon.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Inventário de operações
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.operacoes_tratamento (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null,
  dados text not null,
  titulares text not null,
  base_legal text not null,
  origem text not null,
  compartilhamento text not null,
  retencao text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (escritorio_id, nome)
);
drop trigger if exists operacoes_tratamento_atualizado_em on public.operacoes_tratamento;
create trigger operacoes_tratamento_atualizado_em before update on public.operacoes_tratamento for each row execute function app.set_atualizado_em();

create or replace function app.lgpd_semear_operacoes(p_escritorio uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.operacoes_tratamento (escritorio_id, nome, dados, titulares, base_legal, origem, compartilhamento, retencao) values
    (p_escritorio, 'Cadastro da equipe', 'nome, e-mail, OAB, telefone, papel', 'membros do escritório', 'execução de contrato (art. 7º, V) e legítimo interesse (IX)', 'o próprio membro', 'Supabase (banco), Vercel (app), Meta (telefone, pelo WhatsApp), Resend (e-mail)', 'enquanto ativo + 5 anos'),
    (p_escritorio, 'Carteira de processos e clientes', 'nome, CPF/CNPJ, contatos, endereço, polo, número do processo', 'clientes e partes contrárias', 'execução de contrato e exercício regular de direitos em processo (art. 7º, V e VI); dados sensíveis: art. 11, II, "d"', 'cliente, PJe, DJEN, DataJud', 'Supabase; Anthropic (só o texto da publicação, para classificação)', 'vigência do mandato + 5 anos (prazo prescricional de responsabilidade)'),
    (p_escritorio, 'Captação de publicações (DJEN)', 'texto da comunicação, partes, advogados', 'partes do processo, advogados', 'exercício regular de direitos (art. 7º, VI); dado público do diário oficial', 'API pública do CNJ', 'Supabase; Anthropic (classificação)', '5 anos após arquivamento do processo'),
    (p_escritorio, 'Movimentações (DataJud)', 'movimentos, classe, órgão', 'partes (indiretamente)', 'exercício regular de direitos; dado público com termos de uso do CNJ (não coletar dados pessoais de terceiros além do necessário)', 'API pública do CNJ', 'Supabase', 'idem'),
    (p_escritorio, 'Sugestão de prazo e classificação por IA', 'texto da publicação, resultado da classificação', 'partes', 'exercício regular de direitos', 'sistema', 'Anthropic (EUA): transferência internacional; ver fornecedores.md', 'log por 5 anos'),
    (p_escritorio, 'Aprovações e eventos', 'quem aprovou o quê, quando, conteúdo aprovado', 'membros', 'obrigação legal/profissional (responsabilidade do advogado)', 'sistema', 'nenhum', '5 anos'),
    (p_escritorio, 'Conversas pelo WhatsApp (equipe)', 'telefone, mensagens, intents', 'membros', 'execução de contrato; consentimento (opt-in) para o canal', 'o próprio membro', 'Meta (EUA): transferência internacional', '1 ano; metadados 5 anos'),
    (p_escritorio, 'Notificações por e-mail', 'e-mail, resumo de prazos (números de processo, atos)', 'membros', 'execução de contrato', 'sistema', 'Resend', '90 dias no provedor'),
    (p_escritorio, 'Auditoria de acesso a textos sigilosos', 'quem leu, quando', 'membros', 'obrigação legal (art. 46) e segredo de justiça (CPC art. 189)', 'sistema', 'nenhum', '5 anos')
  on conflict (escritorio_id, nome) do nothing
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Políticas de retenção (criadas antes do trigger de escritório)
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.politicas_retencao (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  tipo_dado text not null check (tipo_dado in ('mensagens_whatsapp', 'webhooks_inbox', 'exportacoes_csv', 'processos_encerrados', 'aprovacoes', 'auditoria_acessos')),
  prazo_meses int check (prazo_meses is null or prazo_meses between 1 and 600),
  ativo boolean not null default false,
  confirmado_por uuid,
  confirmado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (escritorio_id, tipo_dado),
  check (not ativo or (prazo_meses is not null and confirmado_em is not null))
);
drop trigger if exists politicas_retencao_atualizado_em on public.politicas_retencao;
create trigger politicas_retencao_atualizado_em before update on public.politicas_retencao for each row execute function app.set_atualizado_em();

-- Prazos sugeridos a partir do próprio docs/lgpd/retencao.md. Nascem DESLIGADOS: nada é apagado sem ativação.
-- processos_encerrados: 5 anos (a confirmar). aprovacoes e auditoria_acessos: sem descarte automático (NULL).
create or replace function app.lgpd_semear_politicas(p_escritorio uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.politicas_retencao (escritorio_id, tipo_dado, prazo_meses) values
    (p_escritorio, 'mensagens_whatsapp', 12),
    (p_escritorio, 'webhooks_inbox', 3),
    (p_escritorio, 'exportacoes_csv', 3),
    (p_escritorio, 'processos_encerrados', 60),
    (p_escritorio, 'aprovacoes', null),
    (p_escritorio, 'auditoria_acessos', null)
  on conflict (escritorio_id, tipo_dado) do nothing
$$;

create or replace function app.lgpd_ao_criar_escritorio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.lgpd_semear_operacoes(new.id);
  perform app.lgpd_semear_politicas(new.id);
  return new;
end
$$;
drop trigger if exists lgpd_ao_criar_escritorio on public.escritorios;
create trigger lgpd_ao_criar_escritorio after insert on public.escritorios for each row execute function app.lgpd_ao_criar_escritorio();

do $$
declare
  e record;
begin
  for e in select id from public.escritorios loop
    perform app.lgpd_semear_operacoes(e.id);
    perform app.lgpd_semear_politicas(e.id);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Solicitações dos titulares
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.lgpd_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  titular_cliente_id uuid references public.clientes(id) on delete set null,
  titular_nome text not null check (length(btrim(titular_nome)) > 0),
  tipo text not null check (tipo in ('acesso', 'correcao', 'eliminacao', 'portabilidade', 'revogacao')),
  recebida_em date not null default ((now() at time zone 'America/Cuiaba')::date),
  prazo date not null,
  status text not null default 'aberta' check (status in ('aberta', 'respondida', 'indeferida')),
  resposta text,
  respondida_em timestamptz,
  registrado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (status = 'aberta' or respondida_em is not null)
);
create index if not exists lgpd_solicitacoes_escritorio_idx on public.lgpd_solicitacoes (escritorio_id, status, prazo);
drop trigger if exists lgpd_solicitacoes_atualizado_em on public.lgpd_solicitacoes;
create trigger lgpd_solicitacoes_atualizado_em before update on public.lgpd_solicitacoes for each row execute function app.set_atualizado_em();

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Auditoria da LGPD
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.lgpd_auditoria (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  usuario_id uuid,
  acao text not null check (acao in ('anonimizar_titular', 'exportar_titular', 'configurar_politica', 'descarte_executado')),
  alvo_tipo text not null,
  alvo_id text,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists lgpd_auditoria_escritorio_idx on public.lgpd_auditoria (escritorio_id, criado_em desc);

-- ---------------------------------------------------------------------------------------------------------------
-- RLS: tenant + só sócio + MFA (restritivas). Escrita nas políticas e na auditoria só por RPC/service role.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.operacoes_tratamento enable row level security;
alter table public.politicas_retencao enable row level security;
alter table public.lgpd_solicitacoes enable row level security;
alter table public.lgpd_auditoria enable row level security;

drop policy if exists tenant_isolamento on public.operacoes_tratamento;
create policy tenant_isolamento on public.operacoes_tratamento for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists tenant_isolamento on public.politicas_retencao;
create policy tenant_isolamento on public.politicas_retencao for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists tenant_isolamento on public.lgpd_solicitacoes;
create policy tenant_isolamento on public.lgpd_solicitacoes for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists tenant_isolamento on public.lgpd_auditoria;
create policy tenant_isolamento on public.lgpd_auditoria for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());

do $$
declare
  t text;
begin
  foreach t in array array['operacoes_tratamento', 'politicas_retencao', 'lgpd_solicitacoes', 'lgpd_auditoria'] loop
    execute format('drop policy if exists lgpd_so_socio on public.%I', t);
    execute format('create policy lgpd_so_socio on public.%I as restrictive for all to authenticated using (app.eh_socio()) with check (app.eh_socio())', t);
    execute format('drop policy if exists mfa_obrigatorio on public.%I', t);
    execute format('create policy mfa_obrigatorio on public.%I as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita())', t);
  end loop;
end
$$;

revoke all on public.operacoes_tratamento, public.politicas_retencao, public.lgpd_solicitacoes, public.lgpd_auditoria from anon;
grant select, update on public.operacoes_tratamento to authenticated;
grant select on public.politicas_retencao to authenticated;
grant select, insert, update on public.lgpd_solicitacoes to authenticated;
grant select on public.lgpd_auditoria to authenticated;
grant all on public.operacoes_tratamento, public.politicas_retencao, public.lgpd_solicitacoes, public.lgpd_auditoria to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. RPCs de ação de sócio (security definer: a escrita de políticas e a auditoria passam por aqui)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.lgpd_configurar_politica(p_tipo text, p_prazo_meses int, p_ativar boolean, p_confirmacao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escritorio uuid := app.escritorio_atual();
begin
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
  if not app.eh_socio() then
    raise exception 'Apenas o sócio configura a retenção' using errcode = '42501';
  end if;
  if p_ativar and p_prazo_meses is null then
    raise exception 'Para ativar o descarte, informe o prazo em meses' using errcode = '22023';
  end if;
  if p_ativar and coalesce(p_confirmacao, '') <> 'ATIVAR DESCARTE' then
    raise exception 'Confirmação ausente: digite ATIVAR DESCARTE' using errcode = '22023';
  end if;

  insert into public.politicas_retencao (escritorio_id, tipo_dado, prazo_meses, ativo, confirmado_por, confirmado_em)
  values (v_escritorio, p_tipo, p_prazo_meses, p_ativar, case when p_ativar then auth.uid() end, case when p_ativar then now() end)
  on conflict (escritorio_id, tipo_dado) do update
     set prazo_meses = excluded.prazo_meses,
         ativo = excluded.ativo,
         confirmado_por = excluded.confirmado_por,
         confirmado_em = excluded.confirmado_em;

  insert into public.lgpd_auditoria (escritorio_id, usuario_id, acao, alvo_tipo, alvo_id, detalhes)
  values (v_escritorio, auth.uid(), 'configurar_politica', 'politica_retencao', p_tipo,
          jsonb_build_object('prazo_meses', p_prazo_meses, 'ativo', p_ativar));
end
$$;
revoke execute on function public.lgpd_configurar_politica(text, int, boolean, text) from public, anon;
grant execute on function public.lgpd_configurar_politica(text, int, boolean, text) to authenticated;

-- Anonimização: irreversível. Troca nome, CPF/CNPJ, contatos e endereço do titular; as partes dos processos ficam
-- ligadas ao titular anonimizado (o processo não é apagado: retenção legal). Documentos no Storage NÃO são alterados
-- aqui: a função devolve a contagem para revisão manual. Conversas do WhatsApp também ficam (ver docs/runbooks).
create or replace function public.lgpd_anonimizar_titular(p_cliente_id uuid, p_confirmacao text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escritorio uuid := app.escritorio_atual();
  v_nome text;
  v_novo text;
  v_partes int;
  v_docs int;
begin
  if not app.mfa_satisfeita() then
    raise exception 'Segundo fator obrigatório' using errcode = '42501';
  end if;
  if not app.eh_socio() then
    raise exception 'Apenas o sócio anonimiza titular' using errcode = '42501';
  end if;

  select c.nome into v_nome
    from public.clientes c
   where c.id = p_cliente_id and c.escritorio_id = v_escritorio
     for update;
  if v_nome is null then
    raise exception 'Titular não encontrado' using errcode = 'P0002';
  end if;
  if btrim(coalesce(p_confirmacao, '')) <> btrim(v_nome) then
    raise exception 'A confirmação não confere com o nome do titular' using errcode = '22023';
  end if;

  v_novo := 'Titular anonimizado ' || left(p_cliente_id::text, 8);

  update public.clientes
     set nome = v_novo, cpf_cnpj = null, email = null, telefone_e164 = null, endereco = null, observacoes = null, ativo = false
   where id = p_cliente_id;

  update public.processo_partes
     set nome = v_novo, documento = null
   where cliente_id = p_cliente_id and escritorio_id = v_escritorio;
  get diagnostics v_partes = row_count;

  update public.lgpd_solicitacoes
     set titular_nome = v_novo
   where titular_cliente_id = p_cliente_id and escritorio_id = v_escritorio;

  select count(*)::int into v_docs from public.documentos where cliente_id = p_cliente_id and escritorio_id = v_escritorio;

  insert into public.lgpd_auditoria (escritorio_id, usuario_id, acao, alvo_tipo, alvo_id, detalhes)
  values (v_escritorio, auth.uid(), 'anonimizar_titular', 'cliente', p_cliente_id::text,
          jsonb_build_object('partes_anonimizadas', v_partes, 'documentos_para_revisao', v_docs));

  return jsonb_build_object('cliente_id', p_cliente_id, 'partes_anonimizadas', v_partes, 'documentos_para_revisao', v_docs);
end
$$;
revoke execute on function public.lgpd_anonimizar_titular(uuid, text) from public, anon;
grant execute on function public.lgpd_anonimizar_titular(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Storage: exportações LGPD só para o sócio (a policy de leitura do bucket vale para o escritório inteiro)
-- ---------------------------------------------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'schema storage ausente: policy de exportações LGPD não criada neste banco';
    return;
  end if;
  execute 'drop policy if exists lgpd_so_socio on storage.objects';
  execute $p$
    create policy lgpd_so_socio on storage.objects as restrictive for select to authenticated
      using (bucket_id <> 'exportacoes' or name not like '%/lgpd/%' or app.eh_socio())
  $p$;
end
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Rotina de descarte (pg_cron + app.chamar_rotina, como 0023, 0030, 0043 e 0044)
-- ---------------------------------------------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron indisponível: rotina descarte-retencao não agendada neste banco';
    return;
  end if;
  perform cron.schedule('rotina:descarte-retencao', '0 5 * * 0', format('select app.chamar_rotina(%L)', 'descarte-retencao'));
end
$$;
