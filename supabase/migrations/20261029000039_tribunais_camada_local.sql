-- 0039: camada local dos demais tribunais estaduais (lote 9). Fonte: skill analise-processual-todos-tribunais,
-- references/camada-local.md. Regra da própria skill: nada de camada local é afirmado de memória. Por isso o seed
-- traz só os itens a verificar, com situacao 'a_verificar'. Confirmações entram por escritório, com fonte.
-- tribunal_sigla = '*' vale para qualquer TJ fora de MT; a confirmação de um TJ específico fica em escritorio_camada_local.

create table if not exists ref.tribunal_camada_local (
  tribunal_sigla text not null,
  bloco smallint not null check (bloco between 1 and 8),
  bloco_titulo text not null,
  item text not null,
  situacao text not null default 'a_verificar' check (situacao in ('confirmado', 'a_verificar')),
  fonte text,
  primary key (tribunal_sigla, bloco, item)
);
grant select on ref.tribunal_camada_local to authenticated, service_role;
grant insert, update, delete on ref.tribunal_camada_local to service_role;

insert into ref.tribunal_camada_local (tribunal_sigla, bloco, bloco_titulo, item) values
  ('*', 1, 'Sistema eletrônico e protocolo', 'Qual sistema eletrônico o tribunal usa naquele grau e naquela comarca (pode haver mais de um por fase ou classe)'),
  ('*', 1, 'Sistema eletrônico e protocolo', 'Como peticionar sem cadastro prévio e se há credenciamento além do certificado digital'),
  ('*', 1, 'Sistema eletrônico e protocolo', 'Tamanho e formato de arquivo aceitos; exigência de PDF pesquisável; assinatura digital'),
  ('*', 1, 'Sistema eletrônico e protocolo', 'Horário-limite do protocolo eletrônico e regra de indisponibilidade do sistema (art. 224, §1º, do CPC e norma local)'),
  ('*', 1, 'Sistema eletrônico e protocolo', 'Onde consultar o andamento e como extrair cópia integral dos autos'),
  ('*', 2, 'Endereçamento e qualificação', 'Nomenclatura da unidade naquele estado (vara única, cível, fazenda pública, juizado, foro regional, distrital, entrância)'),
  ('*', 2, 'Endereçamento e qualificação', 'Como o tribunal grafa comarca e vara no cabeçalho (copiar dos autos, não inventar)'),
  ('*', 2, 'Endereçamento e qualificação', 'Órgão de segundo grau competente (câmara, grupo, seção ou turma) e como se endereça o recurso'),
  ('*', 2, 'Endereçamento e qualificação', 'Exigência local de e-mail, telefone ou endereço eletrônico das partes'),
  ('*', 3, 'Custas, preparo e gratuidade', 'Tabela de custas vigente e quem a edita (lei estadual, regimento, ato do tribunal)'),
  ('*', 3, 'Custas, preparo e gratuidade', 'Guia utilizada, forma de emissão e comprovação; recolhimento único ou guias separadas'),
  ('*', 3, 'Custas, preparo e gratuidade', 'Valor do preparo recursal e prazo; complementação (art. 1.007 do CPC) e recolhimento em dobro'),
  ('*', 3, 'Custas, preparo e gratuidade', 'Isenções estaduais e tratamento local do pedido de gratuidade'),
  ('*', 3, 'Custas, preparo e gratuidade', 'Dispensa de porte por processo eletrônico, se houver'),
  ('*', 4, 'Prazos e expediente', 'Feriados forenses estaduais e locais; suspensão de expediente por ato do tribunal; ponto facultativo; feriado municipal da comarca'),
  ('*', 4, 'Prazos e expediente', 'Certidão comprovando suspensão do expediente ao alegar tempestividade (art. 1.003, §6º, do CPC)'),
  ('*', 4, 'Prazos e expediente', 'Regime de intimação (pelo sistema, por publicação no DJe, ou ambos) e a partir de quando o prazo corre'),
  ('*', 5, 'Competência interna e regime recursal', 'Divisão de competência entre câmaras e seções por matéria (regimento interno)'),
  ('*', 5, 'Competência interna e regime recursal', 'Sustentação oral: cabimento e forma de requerer; sessão virtual, prazo para destaque e oposição'),
  ('*', 5, 'Competência interna e regime recursal', 'Pedido de preferência e memoriais'),
  ('*', 5, 'Competência interna e regime recursal', 'Órgão competente para embargos de declaração, agravo interno e incidentes'),
  ('*', 6, 'Normas da corregedoria e da secretaria', 'Provimentos e normas gerais da corregedoria do estado'),
  ('*', 6, 'Normas da corregedoria e da secretaria', 'Rotinas de serventia que geram nulidade quando descumpridas (certificação, publicação, intimação pessoal, mandado, penhora e avaliação)'),
  ('*', 6, 'Normas da corregedoria e da secretaria', 'Exigências documentais próprias na distribuição'),
  ('*', 7, 'Jurisprudência e entendimento dominante', 'Súmulas e enunciados do tribunal local, quando existirem'),
  ('*', 7, 'Jurisprudência e entendimento dominante', 'IRDR e IAC instaurados no tribunal sobre a matéria, inclusive com suspensão de processos'),
  ('*', 7, 'Jurisprudência e entendimento dominante', 'Orientação dominante da câmara competente'),
  ('*', 7, 'Jurisprudência e entendimento dominante', 'Turmas Recursais e enunciados do FONAJE, quando for juizado'),
  ('*', 8, 'Logística da atuação à distância', 'Necessidade de correspondente para audiência presencial, sustentação oral, carga ou diligência'),
  ('*', 8, 'Logística da atuação à distância', 'Audiência por videoconferência: regra do tribunal, forma de requerer, consequência da ausência'),
  ('*', 8, 'Logística da atuação à distância', 'Substabelecimento e procuração: verificar poderes já outorgados'),
  ('*', 8, 'Logística da atuação à distância', 'Cadastro da advogada no sistema daquele tribunal, com antecedência ao prazo')
on conflict (tribunal_sigla, bloco, item) do nothing;

-- Confirmações do escritório: só entram com fonte (página oficial, provimento, tabela de custas, ou o próprio documento dos autos).
create table if not exists public.escritorio_camada_local (
  id uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  tribunal_sigla text not null,
  bloco smallint not null check (bloco between 1 and 8),
  item text not null,
  situacao text not null default 'confirmado' check (situacao in ('confirmado', 'a_verificar')),
  fonte text not null,
  confirmado_por uuid,
  confirmado_em timestamptz not null default now(),
  unique (escritorio_id, tribunal_sigla, bloco, item)
);

alter table public.escritorio_camada_local enable row level security;
drop policy if exists tenant_isolamento on public.escritorio_camada_local;
create policy tenant_isolamento on public.escritorio_camada_local for all to authenticated using (escritorio_id = app.escritorio_atual()) with check (escritorio_id = app.escritorio_atual());
drop policy if exists mfa_obrigatorio on public.escritorio_camada_local;
create policy mfa_obrigatorio on public.escritorio_camada_local as restrictive for all to authenticated using (app.mfa_satisfeita()) with check (app.mfa_satisfeita());
grant select, insert, update, delete on public.escritorio_camada_local to authenticated;
grant all on public.escritorio_camada_local to service_role;
