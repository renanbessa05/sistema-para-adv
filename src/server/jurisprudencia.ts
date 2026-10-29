import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { comoVetorSql, criarClienteVoyage, type ClienteEmbeddings } from "@/lib/embeddings/voyage";
import { dividirEmChunks } from "@/lib/jurisprudencia/chunks";
import { ErroImportacao, parsearImportacao } from "@/lib/jurisprudencia/importar";
import { obterSegredo } from "./integracoes";
import type { Sessao } from "./sessao";

/**
 * Jurisprudência (lote 7): base global em ref.jurisprudencia (chunks com tsvector e, com pgvector e chave Voyage,
 * embedding). A busca usa o cliente do usuário, então a leitura passa pela RLS e pelo papel. Importação e embeddings
 * usam a service role, só depois de confirmar o papel de quem pediu.
 */
export class ErroJurisprudencia extends Error {}

export interface ResultadoBusca {
  jurisprudencia_id: string;
  referencia: string;
  trecho: string;
  pontuacao: number;
}

/** Cliente de embeddings do escritório, ou null quando não há chave (busca segue só por texto). */
export async function clienteEmbeddingsDoEscritorio(escritorioId: string): Promise<ClienteEmbeddings | null> {
  const admin = criarClienteAdmin();
  const segredo = await obterSegredo(admin, escritorioId, "embeddings");
  if (!segredo.valor) return null;
  return criarClienteVoyage({ chave: segredo.valor, modelo: segredo.config.modelo });
}

/** Busca híbrida quando há embeddings; cai para só texto se a chave faltar, a Voyage falhar ou o pgvector não existir. */
export async function buscarJurisprudencia(supabase: SupabaseClient, sessao: Sessao, consulta: string, limite = 8): Promise<ResultadoBusca[]> {
  const texto = consulta.trim();
  if (texto.length < 3) throw new ErroJurisprudencia("Consulta curta demais.");
  const embeddings = await clienteEmbeddingsDoEscritorio(sessao.escritorioId).catch(() => null);
  if (embeddings) {
    try {
      const [vetor] = await embeddings.gerar([texto], "query");
      const { data, error } = await supabase.rpc("buscar_jurisprudencia", { p_consulta: texto, p_embedding: comoVetorSql(vetor), p_limite: limite });
      if (!error && data) return data as ResultadoBusca[];
    } catch (e) {
      console.warn(`[jurisprudencia] busca híbrida indisponível, usando texto: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const { data, error } = await supabase.rpc("buscar_jurisprudencia_texto", { p_consulta: texto, p_limite: limite });
  if (error) throw new ErroJurisprudencia(error.message);
  return (data ?? []) as ResultadoBusca[];
}

export async function importarJurisprudencia(sessao: Sessao, formato: "csv" | "json", conteudo: string): Promise<{ registros: number; trechos: number }> {
  if (!["socio", "advogado"].includes(sessao.papel)) throw new ErroJurisprudencia("Apenas advogado ou sócio importa jurisprudência.");
  let registros: ReturnType<typeof parsearImportacao>;
  try {
    registros = parsearImportacao(formato, conteudo);
  } catch (e) {
    if (e instanceof ErroImportacao) throw new ErroJurisprudencia(e.message);
    throw e;
  }
  const admin = criarClienteAdmin();
  const ref = admin.schema("ref");
  let trechos = 0;
  for (const r of registros) {
    const { data, error } = await ref
      .from("jurisprudencia")
      .upsert(
        { tribunal: r.tribunal, tipo: r.tipo, referencia_citacao: r.referencia, orgao: r.orgao, data_julgamento: r.data, ementa: r.ementa, fonte: "importacao" },
        { onConflict: "tribunal,referencia_citacao" },
      )
      .select("id")
      .single();
    if (error) throw new ErroJurisprudencia(error.message);
    const id = data.id as string;
    // Reimportar troca o texto: os trechos antigos saem e o job gera os embeddings de novo.
    await ref.from("jurisprudencia_chunks").delete().eq("jurisprudencia_id", id);
    const chunks = dividirEmChunks(r.ementa).map((texto, i) => ({ jurisprudencia_id: id, ordem: i + 1, texto }));
    const { error: erroChunks } = await ref.from("jurisprudencia_chunks").insert(chunks);
    if (erroChunks) throw new ErroJurisprudencia(erroChunks.message);
    trechos += chunks.length;
  }
  return { registros: registros.length, trechos };
}

/**
 * Job gerar-embeddings: pega um lote de trechos sem embedding e grava os vetores. Chunks são globais, então um
 * escritório com chave basta; o primeiro que tiver chave processa o lote. Sem pgvector, a coluna não existe e o job
 * devolve sem erro.
 */
export async function gerarEmbeddingsPendentes(limite = 64): Promise<{ gerados: number; motivo?: string }> {
  const admin = criarClienteAdmin();
  const ref = admin.schema("ref");
  const { data: escritorios, error: erroEsc } = await admin.from("escritorios").select("id").order("criado_em");
  if (erroEsc) throw new ErroJurisprudencia(erroEsc.message);
  for (const esc of escritorios ?? []) {
    const cliente = await clienteEmbeddingsDoEscritorio(esc.id as string);
    if (!cliente) continue;
    const { data: pendentes, error } = await ref.from("jurisprudencia_chunks").select("id, texto").is("embedding", null).order("id").limit(limite);
    if (error) return { gerados: 0, motivo: "pgvector indisponível neste banco" };
    if (!pendentes?.length) return { gerados: 0, motivo: "nada pendente" };
    const vetores = await cliente.gerar(pendentes.map((p) => p.texto as string), "document");
    for (let i = 0; i < pendentes.length; i++) {
      const { error: erroUpd } = await ref.from("jurisprudencia_chunks").update({ embedding: comoVetorSql(vetores[i]) }).eq("id", pendentes[i].id);
      if (erroUpd) throw new ErroJurisprudencia(erroUpd.message);
    }
    return { gerados: pendentes.length };
  }
  return { gerados: 0, motivo: "nenhum escritório com chave Voyage" };
}
