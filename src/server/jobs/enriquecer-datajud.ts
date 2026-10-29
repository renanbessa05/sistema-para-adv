import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteDatajud, ErroDatajud } from "@/lib/datajud";
import { envServidor } from "@/lib/config/env";
import { competenciaAposDatajud } from "@/server/processos";
import { executarJob, listarEscritoriosAtivos } from "./registro";

/**
 * Enriquece processos pelo DataJud (classe, órgão, comarca por IBGE, competência deduzida, sigilo, movimentos novos).
 * Lotes pequenos, os mais desatualizados primeiro; respeita 120 req/min do CNJ.
 */
export async function enriquecerDatajud(admin: SupabaseClient, opcoes: { lote?: number; escritorioId?: string; processoIds?: string[] } = {}) {
  const env = envServidor();
  if (!env.DATAJUD_API_KEY) return [{ ok: false, erro: "DATAJUD_API_KEY ausente", itens: 0 }];
  const datajud = criarClienteDatajud({ baseUrl: env.DATAJUD_BASE_URL, apiKey: env.DATAJUD_API_KEY });
  const escritorios = (await listarEscritoriosAtivos(admin)).filter((e) => !opcoes.escritorioId || e.id === opcoes.escritorioId);
  const resumo: Record<string, unknown>[] = [];

  for (const escritorio of escritorios) {
    const r = await executarJob(
      admin,
      "enriquecer-datajud",
      async () => {
        let consulta = admin
          .from("processos")
          .select("id, numero_cnj, tribunal_id, comarca_id, competencia, datajud_ultima_atualizacao")
          .eq("escritorio_id", escritorio.id)
          .in("status", ["ativo", "suspenso"])
          .eq("datajud_indisponivel", false)
          .order("datajud_ultima_sincronizacao", { ascending: true, nullsFirst: true })
          .limit(opcoes.lote ?? 50);
        if (opcoes.processoIds?.length) consulta = consulta.in("id", opcoes.processoIds);
        const { data: processos, error } = await consulta;
        if (error) throw new Error(error.message);

        let atualizados = 0;
        let movimentosNovos = 0;
        let indisponiveis = 0;
        const erros: string[] = [];

        for (const p of processos ?? []) {
          try {
            const encontrados = await datajud.buscarPorNumero(String(p.numero_cnj));
            const agora = new Date().toISOString();
            if (!encontrados || encontrados.length === 0) {
              indisponiveis += 1;
              await admin.from("processos").update({ datajud_ultima_sincronizacao: agora, datajud_indisponivel: true }).eq("id", p.id);
              continue;
            }
            // Prefere o 1º grau para dados cadastrais; movimentos de todos os graus entram.
            const principal = encontrados.find((x) => x.grau === "G1") ?? encontrados[0];
            let comarcaId = p.comarca_id as string | null;
            if (!comarcaId && principal.codigo_municipio_ibge) {
              const { data: comarca } = await admin.schema("ref").from("comarcas").select("id").eq("codigo_ibge", String(principal.codigo_municipio_ibge)).maybeSingle();
              comarcaId = (comarca?.id as string | undefined) ?? null;
            }
            await admin
              .from("processos")
              .update({
                classe_codigo: principal.classe_codigo ?? undefined,
                classe_nome: principal.classe_nome ?? undefined,
                orgao_julgador_codigo: principal.orgao_julgador_codigo != null ? String(principal.orgao_julgador_codigo) : undefined,
                orgao_julgador_nome: principal.orgao_julgador_nome ?? undefined,
                grau: principal.grau ?? undefined,
                data_ajuizamento: principal.data_ajuizamento ?? undefined,
                nivel_sigilo: principal.nivel_sigilo ?? undefined,
                comarca_id: comarcaId,
                // Deduzida do grau, órgão e classe (decisão 1.4.10); não apaga ajuste manual da equipe.
                competencia: competenciaAposDatajud(p.competencia as string | null, principal.competencia),
                datajud_ultima_sincronizacao: agora,
                datajud_ultima_atualizacao: principal.ultima_atualizacao ?? undefined,
                datajud_indisponivel: false,
              })
              .eq("id", p.id);

            for (const proc of encontrados) {
              for (const mov of proc.movimentos) {
                const idExterno = `${proc.grau ?? "G1"}:${mov.codigo ?? "0"}:${mov.data_hora ?? ""}:${(mov.nome ?? "").slice(0, 40)}`;
                const { error: erroMov } = await admin.from("movimentacoes").upsert(
                  { escritorio_id: escritorio.id, processo_id: p.id, origem: "datajud", codigo_tpu: mov.codigo, nome: mov.nome ?? "movimento", complemento: mov.complementos?.map((c) => c.nome ?? c.valor).filter(Boolean).join("; ") || null, data: mov.data_hora ?? agora, id_externo: idExterno, payload: mov },
                  { onConflict: "processo_id,origem,id_externo", ignoreDuplicates: true },
                );
                if (!erroMov) movimentosNovos += 1;
              }
            }
            atualizados += 1;
          } catch (e) {
            if (e instanceof ErroDatajud && e.chaveInvalida) throw new Error("Chave pública do DataJud inválida ou trocada pelo CNJ: atualize DATAJUD_API_KEY");
            erros.push(`${p.numero_cnj}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        return { itens: atualizados, detalhes: { consultados: processos?.length ?? 0, atualizados, indisponiveis, movimentosUpsert: movimentosNovos, erros } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}
