import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeNoFuso } from "@/lib/prazos";
import { mesAnterior, primeiroDiaDoMes, resumirPorUsuario } from "@/lib/relatorios/agregar";
import { csvProdutividade } from "@/lib/relatorios/csv";
import { produtividadeDoPeriodo, TIPO_AGENDAMENTO_PRODUTIVIDADE, TIPO_EXPORTACAO_PRODUTIVIDADE } from "../relatorios";
import { executarJob, listarEscritoriosAtivos } from "./registro";

/**
 * Dia 1, 11h UTC (07h em Cuiabá): para cada escritório com o relatório mensal ativo, gera o CSV de produtividade do
 * mês anterior no bucket `exportacoes` (prefixo relatorio-produtividade-, legível só pelo sócio) e registra em
 * `exportacoes`. `ultima_competencia` evita gerar o mesmo mês duas vezes. Nenhum e-mail é enviado aqui.
 */
export async function relatorioMensal(admin: SupabaseClient, opcoes: { agora?: Date } = {}) {
  const resumo = [];
  for (const escritorio of await listarEscritoriosAtivos(admin)) {
    const r = await executarJob(
      admin,
      "relatorio-mensal",
      async () => {
        const { data: agendado, error: erroAgenda } = await admin
          .from("relatorios_agendados")
          .select("id, ultima_competencia")
          .eq("escritorio_id", escritorio.id)
          .eq("tipo", TIPO_AGENDAMENTO_PRODUTIVIDADE)
          .eq("ativo", true)
          .maybeSingle();
        if (erroAgenda) throw new Error(erroAgenda.message);
        if (!agendado) return { itens: 0, detalhes: { agendado: false } };

        const competencia = mesAnterior(hojeNoFuso(escritorio.timezone, opcoes.agora));
        if (agendado.ultima_competencia && String(agendado.ultima_competencia) >= competencia) {
          return { itens: 0, detalhes: { agendado: true, jaGerado: true, competencia } };
        }

        const linhas = await produtividadeDoPeriodo(admin, competencia, competencia, escritorio.id);
        const csv = csvProdutividade(resumirPorUsuario(linhas));
        const caminho = `${escritorio.id}/relatorio-produtividade-${competencia.slice(0, 7)}.csv`;
        const { data: buckets } = await admin.storage.listBuckets();
        if (!buckets?.some((b) => b.name === "exportacoes")) await admin.storage.createBucket("exportacoes", { public: false });
        const { error: erroUpload } = await admin.storage.from("exportacoes").upload(caminho, Buffer.from(csv, "utf8"), { contentType: "text/csv; charset=utf-8", upsert: true });
        if (erroUpload) throw new Error(`upload: ${erroUpload.message}`);
        const { error: erroExport } = await admin.from("exportacoes").insert({ escritorio_id: escritorio.id, tipo: TIPO_EXPORTACAO_PRODUTIVIDADE, caminho_storage: caminho, linhas: linhas.length });
        if (erroExport) throw new Error(`exportacoes: ${erroExport.message}`);
        const { error: erroMarca } = await admin
          .from("relatorios_agendados")
          .update({ ultima_competencia: primeiroDiaDoMes(competencia), ultima_geracao_em: new Date().toISOString() })
          .eq("id", agendado.id);
        if (erroMarca) throw new Error(erroMarca.message);
        return { itens: linhas.length, detalhes: { competencia, caminho } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}
