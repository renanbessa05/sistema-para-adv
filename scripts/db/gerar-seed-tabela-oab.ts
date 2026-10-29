/**
 * Gera o SQL de seed da Tabela OAB/MT a partir de src/lib/honorarios/tabela-oab-mt.ts (fonte única).
 * Uso: pnpm tsx scripts/db/gerar-seed-tabela-oab.ts > trecho.sql  (o conteúdo vai para a migration 0028)
 */
import { ITENS_TABELA_OAB_MT, TABELA_OAB_MT_FONTE, TABELA_OAB_MT_URH, TABELA_OAB_MT_VIGENCIA } from "../../src/lib/honorarios/tabela-oab-mt";

const lit = (s: string | null | undefined) => (s === null || s === undefined ? "null" : `'${s.replace(/'/g, "''")}'`);
const num = (n: number | null) => (n === null ? "null" : String(n));

const linhas = ITENS_TABELA_OAB_MT.map((i) => `    (${lit(i.codigo)}, ${lit(i.secao)}, ${lit(i.item)}, ${num(i.multiploUrh)}, ${num(i.percentual)}, ${num(i.minimoUrh)}, ${lit(i.observacao ?? null)})`);

process.stdout.write(`-- Seed gerado por scripts/db/gerar-seed-tabela-oab.ts (não editar à mão; edite tabela-oab-mt.ts e regenere)
insert into ref.tabelas_honorarios (id, uf, vigencia_inicio, valor_urh, fonte_url)
values ('00000000-0000-4000-8000-0000000000a1'::uuid, 'MT', '${TABELA_OAB_MT_VIGENCIA}', ${TABELA_OAB_MT_URH}, ${lit(TABELA_OAB_MT_FONTE)})
on conflict (uf, vigencia_inicio) do update set valor_urh = excluded.valor_urh, fonte_url = excluded.fonte_url;

insert into ref.tabela_honorarios_itens (tabela_id, codigo, secao, item, multiplo_urh, percentual, minimo_urh, observacao)
select '00000000-0000-4000-8000-0000000000a1'::uuid, v.codigo, v.secao, v.item, v.multiplo_urh, v.percentual, v.minimo_urh, v.observacao
  from (values
${linhas.join(",\n")}
  ) as v(codigo, secao, item, multiplo_urh, percentual, minimo_urh, observacao)
on conflict (tabela_id, codigo) do update set secao = excluded.secao, item = excluded.item, multiplo_urh = excluded.multiplo_urh, percentual = excluded.percentual, minimo_urh = excluded.minimo_urh, observacao = excluded.observacao;
`);
