import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extrairPaginas } from "@/lib/documentos/pdf";
import { baixarBytes } from "../documentos";
import { executarJob } from "./registro";

/**
 * Drena a fila `extracao_documentos`: baixa o PDF (ou texto) do Storage, extrai o texto por página e grava em
 * documento_paginas. Lotes pequenos para caber no tempo da função. PDF sem texto (digitalizado) fica marcado em
 * `extracao_erro = 'sem_texto'`; a IA ainda consegue lê-lo como imagem pelo bloco `document`.
 * O lote é lido uma vez e agrupado por escritório; cada escritório tem a sua execução em jobs_execucoes.
 */
export async function extrairTextoPendentes(admin: SupabaseClient, opcoes: { lote?: number } = {}) {
  const { data: itens, error } = await admin.rpc("fila_ler", { p_fila: "extracao_documentos", p_quantidade: opcoes.lote ?? 3, p_visibilidade_segundos: 240 });
  if (error) throw new Error(`fila_ler: ${error.message}`);
  const porEscritorio = new Map<string, { id: number; payload: { documento_id?: string } }[]>();
  for (const i of (itens ?? []) as { id: number; escritorio_id: string; payload: { documento_id?: string } }[]) {
    porEscritorio.set(i.escritorio_id, [...(porEscritorio.get(i.escritorio_id) ?? []), i]);
  }

  const resumo: Record<string, unknown>[] = [];
  for (const [escritorioId, meus] of porEscritorio) {
    const r = await executarJob(
      admin,
      "extrair-texto",
      async () => {
        let processados = 0;
        const erros: string[] = [];
        for (const item of meus) {
          const documentoId = item.payload?.documento_id;
          try {
            if (!documentoId) throw new Error("payload sem documento_id");
            const { data: doc } = await admin.from("documentos").select("id, bucket, caminho, mime").eq("id", documentoId).eq("escritorio_id", escritorioId).maybeSingle();
            if (!doc) throw new Error(`documento ${documentoId} não encontrado`);
            const bytes = await baixarBytes(admin, { bucket: doc.bucket as string, caminho: doc.caminho as string });
            let paginas: { numero: number; texto: string }[];
            let semTexto = false;
            if ((doc.mime as string) === "application/pdf") {
              const r = await extrairPaginas(bytes);
              paginas = r.paginas;
              semTexto = r.semTexto;
            } else {
              paginas = [{ numero: 1, texto: Buffer.from(bytes).toString("utf8") }];
            }
            await admin.from("documento_paginas").delete().eq("documento_id", documentoId);
            for (let i = 0; i < paginas.length; i += 200) {
              const fatia = paginas.slice(i, i + 200).map((p) => ({ escritorio_id: escritorioId, documento_id: documentoId, numero: p.numero, texto: p.texto }));
              const { error: erroInsert } = await admin.from("documento_paginas").insert(fatia);
              if (erroInsert) throw new Error(erroInsert.message);
            }
            await admin.from("documentos").update({ paginas: paginas.length, texto_extraido_em: new Date().toISOString(), extracao_erro: semTexto ? "sem_texto" : null }).eq("id", documentoId);
            await admin.rpc("fila_concluir", { p_id: item.id });
            processados += 1;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            erros.push(`${documentoId ?? "?"}: ${msg}`);
            if (documentoId) await admin.from("documentos").update({ extracao_erro: msg.slice(0, 500) }).eq("id", documentoId);
            await admin.rpc("fila_falhar", { p_id: item.id, p_erro: msg.slice(0, 500), p_atraso_segundos: 300 });
          }
        }
        return { itens: processados, detalhes: { lidos: meus.length, erros } };
      },
      escritorioId,
    );
    resumo.push({ escritorio: escritorioId, ...r });
  }
  return resumo;
}
