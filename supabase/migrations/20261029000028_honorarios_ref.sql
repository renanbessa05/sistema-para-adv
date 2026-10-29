-- 0028: Tabela de Honorários da OAB/MT em `ref` (Fase 2, lote 3; T1.37 do escopo)
--
-- ref.tabelas_honorarios guarda uma linha por vigência (URH e data); ref.tabela_honorarios_itens, as rubricas em
-- múltiplos de URH e/ou percentual com mínimo. O seed abaixo é gerado de src/lib/honorarios/tabela-oab-mt.ts
-- (fonte única). A regra "tabela com mais de 12 meses não calcula" fica no código (src/lib/honorarios/tabela.ts).
-- A tabela do ano seguinte entra como nova linha pela tela Configurações → Honorários (sócio), sem editar esta.

create table if not exists ref.tabelas_honorarios (
  id uuid primary key default gen_random_uuid(),
  uf text not null,
  vigencia_inicio date not null,
  valor_urh numeric(12,2) not null check (valor_urh > 0),
  fonte_url text,
  importada_por uuid,
  criado_em timestamptz not null default now(),
  unique (uf, vigencia_inicio)
);

create table if not exists ref.tabela_honorarios_itens (
  id uuid primary key default gen_random_uuid(),
  tabela_id uuid not null references ref.tabelas_honorarios(id) on delete cascade,
  codigo text not null,
  secao text not null,
  item text not null,
  multiplo_urh numeric(8,2),
  percentual numeric(5,2),
  minimo_urh numeric(8,2),
  observacao text,
  unique (tabela_id, codigo),
  check (multiplo_urh is not null or percentual is not null)
);
create index if not exists tabela_honorarios_itens_tabela_idx on ref.tabela_honorarios_itens (tabela_id, secao);

grant select on ref.tabelas_honorarios, ref.tabela_honorarios_itens to anon, authenticated, service_role;
grant insert, update on ref.tabelas_honorarios, ref.tabela_honorarios_itens to service_role;

-- Tabela vigente de uma UF numa data (a mais recente com vigência <= data)
create or replace function app.tabela_honorarios_vigente(p_uf text default 'MT', p_data date default current_date)
returns uuid
language sql
stable
set search_path = ''
as $$
  select t.id from ref.tabelas_honorarios t
   where t.uf = p_uf and t.vigencia_inicio <= p_data
   order by t.vigencia_inicio desc
   limit 1
$$;
grant execute on function app.tabela_honorarios_vigente(text, date) to authenticated, service_role;

-- Seed gerado por scripts/db/gerar-seed-tabela-oab.ts (não editar à mão; edite tabela-oab-mt.ts e regenere)
insert into ref.tabelas_honorarios (id, uf, vigencia_inicio, valor_urh, fonte_url)
values ('00000000-0000-4000-8000-0000000000a1'::uuid, 'MT', '2026-03-12', 1339.07, 'Tabela de Honorários 2026 da OAB/MT (references/tabela-oab-mt.md da skill; URL oficial a confirmar)')
on conflict (uf, vigencia_inicio) do update set valor_urh = excluded.valor_urh, fonte_url = excluded.fonte_url;

insert into ref.tabela_honorarios_itens (tabela_id, codigo, secao, item, multiplo_urh, percentual, minimo_urh, observacao)
select '00000000-0000-4000-8000-0000000000a1'::uuid, v.codigo, v.secao, v.item, v.multiplo_urh, v.percentual, v.minimo_urh, v.observacao
  from (values
    ('I.consulta_hora', 'I', 'Consulta, por hora', 0.5, null, null, null),
    ('I.parecer', 'I', 'Parecer escrito', 5, null, null, null),
    ('II.acompanhar_orgao', 'II', 'Acompanhar cliente a órgão administrativo, judiciário ou policial', 2, null, null, null),
    ('II.exame_processo', 'II', 'Exame de processo', 2, null, null, null),
    ('II.peticao_avulsa', 'II', 'Petição ou requerimento avulso', 2, null, null, null),
    ('II.solucao_pendencia', 'II', 'Intervenção para solução de pendência', null, 10, 2, null),
    ('II.contrato_documento', 'II', 'Elaboração de contrato ou documento que crie, modifique ou extinga direitos', 2, null, null, null),
    ('II.transacao_imobiliaria', 'II', 'Assessoria em transação imobiliária (sobre a transação)', null, 2, 2, null),
    ('II.incorporacao', 'II', 'Assessoria ou registro de incorporação imobiliária (sobre o custo)', null, 1, 2, null),
    ('II.convencao_condominio', 'II', 'Convenção de condomínio', 3, null, null, null),
    ('III.assembleia', 'III', 'Participação em assembleia de condomínio ou sociedade', 2, null, null, null),
    ('III.sociedade_civil', 'III', 'Ato constitutivo — sociedade civil', 3, null, null, null),
    ('III.sociedade_cotas', 'III', 'Ato constitutivo — sociedade por cotas (sobre o capital)', null, 1, 3, null),
    ('III.sociedade_anonima', 'III', 'Ato constitutivo — sociedade anônima (sobre o capital social)', null, 1, 5, null),
    ('III.marcas_patentes', 'III', 'Registro de marcas e patentes', 5, null, null, null),
    ('III.visto_contrato', 'III', 'Vistos em contratos comerciais', 1, null, null, null),
    ('IV.diaria', 'IV', 'Diária profissional', 1, null, null, 'Diárias e despesas de viagem são independentes dos honorários e antecipadas pelo cliente'),
    ('V.partido_geral', 'V', 'Advocacia mensal ou de partido — geral (por mês)', 5, null, null, null),
    ('V.partido_me_epp', 'V', 'Advocacia mensal ou de partido — ME e EPP (por mês)', 3, null, null, null),
    ('VII.demissao', 'VII', 'Defesa em inquérito administrativo em que caiba demissão', 6, null, null, null),
    ('VII.demais', 'VII', 'Defesa em inquérito administrativo — demais casos', 3, null, null, null),
    ('VII.recurso', 'VII', 'Recursos em inquérito administrativo', 3, null, null, null),
    ('VIII.cautelar', 'VIII', 'Cautelares específicas ou inominadas', null, 20, 4, 'Havendo ação principal, soma-se a tabela específica; cautelar satisfativa: +50%'),
    ('VIII.notificacao', 'VIII', 'Notificação, interpelação, protesto ou sustação', 2, null, null, null),
    ('IX.sumario', 'IX', 'Procedimento sumário', null, 20, 4, null),
    ('IX.ordinario', 'IX', 'Procedimento ordinário', null, 20, 8, null),
    ('IX.possessoria', 'IX', 'Ação possessória', null, 20, 8, null),
    ('IX.usucapiao', 'IX', 'Usucapião', null, 20, 8, null),
    ('IX.divisao_demarcacao', 'IX', 'Divisão ou demarcação', null, 20, 8, 'Cumuladas: +3 URH'),
    ('IX.nunciacao', 'IX', 'Nunciação de obra nova', null, 20, 4, null),
    ('IX.popular', 'IX', 'Ação popular', null, 20, 8, null),
    ('IX.rescisoria', 'IX', 'Ação rescisória', null, 20, 8, null),
    ('IX.prestacao_contas', 'IX', 'Prestação de contas', null, 20, 5, null),
    ('IX.embargos_terceiro', 'IX', 'Embargos de terceiro', null, 20, 4, null),
    ('IX.desapropriacao', 'IX', 'Desapropriação', null, 20, 8, 'Proveito = diferença entre a oferta e a indenização fixada'),
    ('IX.reivindicatoria', 'IX', 'Reivindicatória', null, 20, 8, null),
    ('IX.outras_ordinarias', 'IX', 'Outras ações ordinárias', null, 20, 8, null),
    ('IX.jurisdicao_voluntaria', 'IX', 'Jurisdição voluntária (sem tabela específica)', 3, null, null, null),
    ('IX.jurisdicao_contenciosa', 'IX', 'Jurisdição contenciosa (sem tabela específica)', null, 20, 4, null),
    ('IX.pedido_avulso', 'IX', 'Outros pedidos avulsos', 3, null, null, null),
    ('IX.reconvencao', 'IX', 'Reconvenção', 3, null, null, null),
    ('IX.excecao', 'IX', 'Exceções em apartado', 3, null, null, null),
    ('IX.incidente', 'IX', 'Outros incidentes', 3, null, null, null),
    ('IX.intervencao_terceiros', 'IX', 'Intervenção de terceiros', 3, null, null, null),
    ('IX.litisconsorcio', 'IX', 'Litisconsórcio e assistência', 4, null, null, 'Simples adesão: 2 URH'),
    ('IX.declaratoria', 'IX', 'Ação declaratória', null, 20, 4, null),
    ('IX.execucao_extrajudicial', 'IX', 'Execução por quantia certa — título extrajudicial', null, 20, 2, null),
    ('IX.insolvencia', 'IX', 'Insolvência civil', null, 20, 8, null),
    ('IX.monitoria', 'IX', 'Ação monitória', null, 20, 2, null),
    ('X.despejo', 'X', 'Despejo', null, 20, 4, null),
    ('X.revisional_aluguel', 'X', 'Revisional, arbitramento e reajuste de aluguel', null, 20, 4, null),
    ('X.renovatoria', 'X', 'Renovatória de locação', null, 20, 4, null),
    ('X.fianca', 'X', 'Fiança — extinção ou substituição', null, 20, 2, null),
    ('X.consignacao', 'X', 'Consignação em pagamento', null, 20, 2, null),
    ('XI.suprimento_outorga', 'XI', 'Suprimento de consentimento de outorga', 2, null, null, null),
    ('XI.alvara', 'XI', 'Outros alvarás', 2, null, null, null),
    ('XI.arrolamento_cautelar', 'XI', 'Arrolamento de bens (cautelar)', 5, null, null, null),
    ('XI.busca_apreensao_menores', 'XI', 'Busca e apreensão de crianças/adolescentes ou bens', 5, null, null, null),
    ('XI.guarda_provisoria', 'XI', 'Guarda provisória', 5, null, null, null),
    ('XI.separacao_corpos', 'XI', 'Separação de corpos', 5, null, null, null),
    ('XI.adocao_maiores', 'XI', 'Adoção de maiores', 5, null, null, null),
    ('XI.adocao_menores', 'XI', 'Adoção de menores', 7, null, null, null),
    ('XI.reconhecimento_filho_judicial', 'XI', 'Reconhecimento de filhos — judicial', 4, null, null, null),
    ('XI.tutela_guarda', 'XI', 'Tutela e guarda em juízo', 4, null, null, null),
    ('XI.poder_familiar', 'XI', 'Suspensão/extinção do poder familiar', 6, null, null, null),
    ('XI.interdicao', 'XI', 'Interdição', 6, null, null, null),
    ('XI.divorcio_amigavel', 'XI', 'Divórcio amigável', 5, null, null, null),
    ('XI.divorcio_litigioso', 'XI', 'Divórcio litigioso', null, 5, 8, 'Reconvenção: +3 URH'),
    ('XI.divorcio_extrajudicial', 'XI', 'Divórcio extrajudicial sem partilha', 4, null, null, 'Com partilha: +5% do proveito'),
    ('XI.alimentos', 'XI', 'Alimentos e incidentes', 5, null, null, null),
    ('XI.execucao_alimentos', 'XI', 'Execução de alimentos', 2, null, null, null),
    ('XI.guarda', 'XI', 'Guarda de menores', 6, null, null, null),
    ('XI.visitas', 'XI', 'Regulamentação de visitas', 4, null, null, null),
    ('XI.alienacao_parental', 'XI', 'Alienação parental', 5, null, null, null),
    ('XI.investigacao_paternidade', 'XI', 'Investigação de paternidade', 6, null, null, null),
    ('XI.negatoria_paternidade', 'XI', 'Negatória de paternidade', 8, null, null, null),
    ('XI.testamento', 'XI', 'Testamento — registro e inscrição', null, 5, 8, null),
    ('XI.arrolamento', 'XI', 'Arrolamento', null, 5, 6, null),
    ('XI.inventario', 'XI', 'Inventário e partilha', null, 5, 4, null),
    ('XI.habilitacao_credito_inventario', 'XI', 'Habilitação de crédito em inventário', null, 5, 6, null),
    ('XI.inventario_negativo', 'XI', 'Inventário negativo', 2, null, null, null),
    ('XI.assistencia_inventario', 'XI', 'Assistência em inventário (inventariante, cônjuge, herdeiro único)', null, 2.5, 4, null),
    ('XI.sobrepartilha', 'XI', 'Retificação, nulidade ou sobrepartilha', null, 5, 6, null),
    ('XI.outras_familia', 'XI', 'Outras atividades no foro de família', 2, null, null, null),
    ('XII.recuperacao_judicial', 'XII', 'Recuperação judicial', 5, null, null, null),
    ('XII.habilitacao_credito', 'XII', 'Habilitação de crédito', 3, null, null, null),
    ('XII.pedido_falencia', 'XII', 'Pedido de falência', 5, null, null, null),
    ('XIV.administrativo', 'XIV', 'Advocacia fiscal — foro administrativo', null, 20, 5, null),
    ('XIV.judicial', 'XIV', 'Advocacia fiscal — judicial e anulatória', null, 20, 5, null),
    ('XV.administrativa', 'XV', 'Previdenciária — postulação administrativa', null, 20, 3, 'Teto: 50% do acumulado pretérito; desconto futuro até 30 vencimentos'),
    ('XV.judicial', 'XV', 'Previdenciária — postulação judicial', null, 20, 5, 'Teto: 50% do acumulado pretérito; desconto futuro até 30 vencimentos'),
    ('XVI.mandado_seguranca', 'XVI', 'Mandado de segurança, injunção e habeas data', 7, null, null, null),
    ('XVII.reclamatoria_sumarissimo', 'XVII', 'Reclamatória trabalhista — rito sumaríssimo', null, 30, 2, null),
    ('XVII.reclamatoria_ordinario', 'XVII', 'Reclamatória trabalhista — rito ordinário', null, 30, 3, null),
    ('XVII.defesa_ordinario', 'XVII', 'Defesa trabalhista — rito ordinário', null, 30, 4, null),
    ('XIX.inquerito', 'XIX', 'Acompanhamento de inquérito', 5, null, null, null),
    ('XIX.processo_ordinario', 'XIX', 'Processo criminal ordinário', 10, null, null, null),
    ('XIX.juri', 'XIX', 'Júri — todo o procedimento até sustentação', 30, null, null, null),
    ('XIX.liberdade_provisoria', 'XIX', 'Liberdade provisória, revogação de preventiva, cautelares', 5, null, null, null),
    ('XIX.hc', 'XIX', 'HC, MS ou recurso ordinário constitucional', 6, null, null, null),
    ('XXI.originaria', 'XXI', 'Ação de competência originária', 15, null, null, null),
    ('XXI.rescisoria', 'XXI', 'Ação rescisória (tribunal)', 15, null, null, null),
    ('XXI.razoes_recurso', 'XXI', 'Razões e contrarrazões de qualquer recurso', 9, null, null, null),
    ('XXI.memorial', 'XXI', 'Memorial', 5, null, null, null),
    ('XXI.sustentacao_oral', 'XXI', 'Sustentação oral', 9, null, null, null),
    ('XXI.acompanhamento_recurso', 'XXI', 'Simples acompanhamento de recurso', 2, null, null, null),
    ('XXI.agravo_instrumento', 'XXI', 'Agravo de instrumento', 4, null, null, null),
    ('XXII.inicial_contestacao', 'XXII', 'Juizados Especiais — pedido inicial ou contestação', null, 20, 2, null),
    ('XXII.recurso', 'XXII', 'Juizados Especiais — recursos', null, 10, 1, null),
    ('XXII.embargos', 'XXII', 'Juizados Especiais — embargos (execução)', null, 10, 2, null),
    ('XXIV.instrucao', 'XXIV', 'Audiência de instrução (estadual/federal/trabalho)', 1.5, null, null, null),
    ('XXIV.preliminar', 'XXIV', 'Audiência preliminar ou de conciliação', 0.5, null, null, null),
    ('XXVII.hora_tecnica', 'XXVII', 'Hora técnica de trabalho', 0.5, null, null, null)
  ) as v(codigo, secao, item, multiplo_urh, percentual, minimo_urh, observacao)
on conflict (tabela_id, codigo) do update set secao = excluded.secao, item = excluded.item, multiplo_urh = excluded.multiplo_urh, percentual = excluded.percentual, minimo_urh = excluded.minimo_urh, observacao = excluded.observacao;
