-- 0040: tipo de análise para outros tribunais estaduais (lote 9). Enum em migration própria.
alter type public.analise_tipo add value if not exists 'outros_tribunais';
