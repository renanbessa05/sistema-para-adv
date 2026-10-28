-- 0003: dados de referência iniciais (idempotente)
-- TJ-MT, comarcas com código IBGE do município-sede (a conferir), calendário 2026 (a conferir na Portaria TJMT/PRES 1915/2025) e preços de IA.

insert into ref.tribunais (sigla, codigo_cnj, segmento, codigo_tr, nome, uf, timezone, sistema_eletronico, url_consulta)
values ('TJMT', '8.11', 8, '11', 'Tribunal de Justiça do Estado de Mato Grosso', 'MT', 'America/Cuiaba', 'pje', 'https://consultaprocessual.tjmt.jus.br/')
on conflict (sigla) do nothing;

-- Comarcas (município-sede → código IBGE). Lista inicial; a tela de configurações permite completar.
with t as (select id from ref.tribunais where sigla = 'TJMT')
insert into ref.comarcas (tribunal_id, nome, codigo_ibge)
select t.id, c.nome, c.ibge from t, (values
  ('Cuiabá', '5103403'), ('Várzea Grande', '5108402'), ('Rondonópolis', '5107602'), ('Sinop', '5107909'),
  ('Sorriso', '5107925'), ('Tangará da Serra', '5107958'), ('Cáceres', '5102504'), ('Barra do Garças', '5101803'),
  ('Lucas do Rio Verde', '5105259'), ('Primavera do Leste', '5107040'), ('Alta Floresta', '5100250'), ('Juína', '5105150'),
  ('Nova Mutum', '5106224'), ('Campo Verde', '5102678'), ('Jaciara', '5104906'), ('Pontes e Lacerda', '5106752'),
  ('Água Boa', '5100201'), ('Colíder', '5103205'), ('Diamantino', '5103502'), ('Mirassol d''Oeste', '5105622'),
  ('Guarantã do Norte', '5104104'), ('Peixoto de Azevedo', '5106422'), ('Juara', '5105101'), ('Sapezal', '5107875'),
  ('Campo Novo do Parecis', '5102637'), ('Nova Xavantina', '5106257'), ('Poconé', '5106505'), ('Chapada dos Guimarães', '5103007'),
  ('Barra do Bugres', '5101704'), ('Paranatinga', '5106307'), ('Alto Araguaia', '5100805'), ('Vila Rica', '5108600'),
  ('Confresa', '5103353'), ('Querência', '5107065'), ('Comodoro', '5103304'), ('Canarana', '5102702')
) as c(nome, ibge)
on conflict (tribunal_id, nome) do nothing;

-- Feriados nacionais 2026 (Lei 662/1949, Lei 10.607/2002, Lei 6.802/1980, Lei 14.759/2023)
insert into ref.feriados (tribunal_id, comarca_id, data, descricao, abrangencia, suspende_prazo, ato_normativo, conferido)
values
  (null, null, '2026-01-01', 'Confraternização Universal', 'nacional', true, 'Lei 10.607/2002', true),
  (null, null, '2026-04-03', 'Sexta-feira Santa', 'nacional', true, 'Lei 9.093/1995, art. 2º (feriado religioso)', true),
  (null, null, '2026-04-21', 'Tiradentes', 'nacional', true, 'Lei 10.607/2002', true),
  (null, null, '2026-05-01', 'Dia do Trabalho', 'nacional', true, 'Lei 10.607/2002', true),
  (null, null, '2026-09-07', 'Independência do Brasil', 'nacional', true, 'Lei 10.607/2002', true),
  (null, null, '2026-10-12', 'Nossa Senhora Aparecida', 'nacional', true, 'Lei 6.802/1980', true),
  (null, null, '2026-11-02', 'Finados', 'nacional', true, 'Lei 10.607/2002', true),
  (null, null, '2026-11-15', 'Proclamação da República', 'nacional', true, 'Lei 10.607/2002', true),
  (null, null, '2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional', true, 'Lei 14.759/2023', true),
  (null, null, '2026-12-25', 'Natal', 'nacional', true, 'Lei 10.607/2002', true)
on conflict (tribunal_id, comarca_id, data, descricao) do nothing;

-- Dias forenses do TJ-MT em 2026 (Portaria TJMT/PRES 1915/2025: feriados e pontos facultativos suspendem expediente e prazos). A CONFERIR na Portaria.
with t as (select id from ref.tribunais where sigla = 'TJMT')
insert into ref.feriados (tribunal_id, comarca_id, data, descricao, abrangencia, suspende_prazo, ato_normativo, conferido)
select t.id, null, f.data::date, f.descricao, 'forense', true, 'Portaria TJMT/PRES 1915/2025 (a conferir)', false
from t, (values
  ('2026-02-16', 'Carnaval'),
  ('2026-02-17', 'Carnaval'),
  ('2026-02-18', 'Quarta-feira de Cinzas (ponto facultativo)'),
  ('2026-06-04', 'Corpus Christi (ponto facultativo)'),
  ('2026-10-30', 'Dia do Servidor Público (ponto facultativo transferido de 28/10)'),
  ('2026-12-08', 'Dia da Justiça (ponto facultativo)')
) as f(data, descricao)
on conflict (tribunal_id, comarca_id, data, descricao) do nothing;

-- Feriado municipal de Cuiabá (a conferir)
with t as (select id from ref.tribunais where sigla = 'TJMT'), c as (select id from ref.comarcas where nome = 'Cuiabá')
insert into ref.feriados (tribunal_id, comarca_id, data, descricao, abrangencia, suspende_prazo, ato_normativo, conferido)
select t.id, c.id, '2026-04-08', 'Aniversário de Cuiabá', 'municipal', true, 'Lei municipal (a conferir)', false from t, c
on conflict (tribunal_id, comarca_id, data, descricao) do nothing;

-- Controle do calendário por ano
with t as (select id from ref.tribunais where sigla = 'TJMT')
insert into ref.calendario_anos (tribunal_id, ano, conferido, ato_normativo, observacoes)
select t.id, 2026, false, 'Portaria TJMT/PRES 1915/2025', 'Carregado a partir de fontes secundárias; conferir contra a Portaria e as alterações de 2026 (portarias 245, 509, 752, 901)' from t
on conflict (tribunal_id, ano) do nothing;

-- Preços de IA (US$ por milhão de tokens), verificados em 28/10/2026 em platform.claude.com/docs/en/about-claude/pricing
insert into ref.ia_precos (modelo, vigencia_inicio, input_por_mtok, output_por_mtok, cache_write_por_mtok, cache_read_por_mtok, observacao, fonte_url)
values
  ('claude-haiku-5-5', '2026-10-28', 0.10, 0.50, 0.125, 0.01, 'Até 100k tokens de entrada; acima: 0,50 / 2,50', 'https://platform.claude.com/docs/en/about-claude/pricing'),
  ('claude-sonnet-5-5', '2026-10-28', 2.00, 10.00, 2.50, 0.10, 'Cache read 0,05x', 'https://platform.claude.com/docs/en/about-claude/pricing'),
  ('claude-opus-5-5', '2026-10-28', 4.00, 20.00, 5.00, 0.20, 'Cache read 0,05x', 'https://platform.claude.com/docs/en/about-claude/pricing'),
  ('claude-fable-5-1', '2026-10-28', 10.00, 50.00, 12.50, 0.25, 'Exige retenção de 30 dias; sem ZDR', 'https://platform.claude.com/docs/en/about-claude/pricing')
on conflict (modelo, vigencia_inicio) do nothing;
