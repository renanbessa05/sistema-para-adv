import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toFile } from "@anthropic-ai/sdk";
import Anthropic from "@anthropic-ai/sdk";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { envServidor } from "@/lib/config/env";
import { sha256Hex } from "@/lib/documentos/hash";
import { cabeNaApi, extensaoDoMime, mimeAceito, nomeSeguro, TAMANHO_MAX_UPLOAD_BYTES } from "@/lib/documentos/limites";
import { montarTrecho, type PaginaExtraida } from "@/lib/documentos/pdf";
import type { DocumentoEntrada } from "@/lib/ia/cliente";
import type { Sessao } from "./sessao";

/**
 * Documentos no Storage privado `documentos` com metadados em public.documentos.
 * Caminho: <escritorio_id>/<processo_id|cliente_id|geral>/<uuid>.<ext>. O arquivo sobe pela service role depois de a
 * sessão ser validada; a linha é inserida com o cliente do usuário (RLS decide quem pode). Leitura por URL assinada
 * curta, sempre registrada em auditoria_acessos pela RPC documento_registrar_acesso.
 */

export const BUCKET_DOCUMENTOS = "documentos";

export const ROTULO_TIPO_DOCUMENTO: Record<string, string> = {
  contrato: "Contrato",
  procuracao: "Procuração",
  declaracao: "Declaração",
  peca: "Peça",
  autos: "Autos",
  anexo: "Anexo",
  exportacao: "Exportação",
  memoria_calculo: "Memória de cálculo",
  outro: "Outro",
};

export interface Documento {
  id: string;
  escritorio_id: string;
  processo_id: string | null;
  cliente_id: string | null;
  tipo: string;
  nome: string;
  bucket: string;
  caminho: string;
  mime: string;
  tamanho: number;
  hash_sha256: string;
  origem: string;
  paginas: number | null;
  texto_extraido_em: string | null;
  extracao_erro: string | null;
  anthropic_file_id: string | null;
  anthropic_file_expira_em: string | null;
  criado_por: string | null;
  criado_em: string;
}

const COLUNAS = "id, escritorio_id, processo_id, cliente_id, tipo, nome, bucket, caminho, mime, tamanho, hash_sha256, origem, paginas, texto_extraido_em, extracao_erro, anthropic_file_id, anthropic_file_expira_em, criado_por, criado_em";

export class ErroDocumento extends Error {}

export async function listarDocumentos(supabase: SupabaseClient, filtro: { processoId?: string; clienteId?: string; limite?: number }): Promise<Documento[]> {
  let q = supabase.from("documentos").select(COLUNAS).order("criado_em", { ascending: false }).limit(filtro.limite ?? 200);
  if (filtro.processoId) q = q.eq("processo_id", filtro.processoId);
  if (filtro.clienteId) q = q.eq("cliente_id", filtro.clienteId);
  const { data, error } = await q;
  if (error) throw new ErroDocumento(error.message);
  return (data ?? []) as unknown as Documento[];
}

export async function obterDocumento(supabase: SupabaseClient, id: string): Promise<Documento | null> {
  const { data } = await supabase.from("documentos").select(COLUNAS).eq("id", id).maybeSingle();
  return (data as unknown as Documento | null) ?? null;
}

/**
 * Envia um arquivo: valida tipo e tamanho, calcula o hash, sobe ao Storage (service role) e registra a linha com o
 * cliente do usuário. PDF entra na fila `extracao_documentos` para o texto ser extraído pela rotina.
 */
export async function enviarDocumento(
  sessao: Sessao,
  entrada: { arquivo: File; tipo: string; processoId?: string | null; clienteId?: string | null; origem?: "upload" | "gerado" },
): Promise<Documento> {
  const mime = entrada.arquivo.type || "application/octet-stream";
  if (!mimeAceito(mime)) throw new ErroDocumento(`Tipo de arquivo não aceito (${mime}). Envie PDF, DOCX, TXT, MD, PNG ou JPG.`);
  if (entrada.arquivo.size <= 0) throw new ErroDocumento("Arquivo vazio.");
  if (entrada.arquivo.size > TAMANHO_MAX_UPLOAD_BYTES) throw new ErroDocumento(`Arquivo acima de ${Math.round(TAMANHO_MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);

  const bytes = new Uint8Array(await entrada.arquivo.arrayBuffer());
  return gravarDocumento(sessao.escritorioId, sessao.usuarioId, {
    bytes,
    mime,
    nome: nomeSeguro(entrada.arquivo.name),
    tipo: entrada.tipo,
    processoId: entrada.processoId ?? null,
    clienteId: entrada.clienteId ?? null,
    origem: entrada.origem ?? "upload",
    inserirCom: await criarClienteServidor(),
  });
}

/**
 * Grava bytes já produzidos pelo sistema (.docx de contrato, PDF de cálculo) ou enviados por uma pessoa.
 * `inserirCom` é o cliente que insere a linha: o do usuário (RLS) nas telas, o admin nos jobs.
 */
export async function gravarDocumento(
  escritorioId: string,
  criadoPor: string | null,
  d: { bytes: Uint8Array; mime: string; nome: string; tipo: string; processoId: string | null; clienteId: string | null; origem: "upload" | "gerado" | "pje_extensao"; inserirCom: SupabaseClient },
): Promise<Documento> {
  const admin = criarClienteAdmin();
  const ext = extensaoDoMime(d.mime) ?? "bin";
  const pasta = d.processoId ?? d.clienteId ?? "geral";
  const caminho = `${escritorioId}/${pasta}/${crypto.randomUUID()}.${ext}`;
  const hash = sha256Hex(d.bytes);

  const { error: erroUpload } = await admin.storage.from(BUCKET_DOCUMENTOS).upload(caminho, d.bytes, { contentType: d.mime, upsert: false });
  if (erroUpload) throw new ErroDocumento(`Falha ao enviar o arquivo: ${erroUpload.message}`);

  const { data, error } = await d.inserirCom
    .from("documentos")
    .insert({ escritorio_id: escritorioId, processo_id: d.processoId, cliente_id: d.clienteId, tipo: d.tipo, nome: d.nome, bucket: BUCKET_DOCUMENTOS, caminho, mime: d.mime, tamanho: d.bytes.byteLength, hash_sha256: hash, origem: d.origem, criado_por: criadoPor })
    .select(COLUNAS)
    .single();
  if (error) {
    await admin.storage.from(BUCKET_DOCUMENTOS).remove([caminho]);
    throw new ErroDocumento(error.message.includes("row-level security") ? "Seu papel não pode enviar documentos." : error.message);
  }
  const doc = data as unknown as Documento;
  if (d.mime === "application/pdf" || d.mime.startsWith("text/")) {
    await admin.rpc("fila_enfileirar", { p_fila: "extracao_documentos", p_escritorio: escritorioId, p_payload: { documento_id: doc.id }, p_atraso_segundos: 0 });
  }
  return doc;
}

/** URL assinada de 60 s para download, com auditoria. Passa pelo RLS (a RPC falha se o papel não puder ver). */
export async function urlAssinada(supabase: SupabaseClient, id: string, segundos = 60): Promise<string> {
  const doc = await obterDocumento(supabase, id);
  if (!doc) throw new ErroDocumento("Documento não encontrado.");
  const { error: erroAuditoria } = await supabase.rpc("documento_registrar_acesso", { p_id: id, p_acao: "baixou" });
  if (erroAuditoria) throw new ErroDocumento(erroAuditoria.message);
  const admin = criarClienteAdmin();
  const { data, error } = await admin.storage.from(doc.bucket).createSignedUrl(doc.caminho, segundos, { download: doc.nome });
  if (error || !data) throw new ErroDocumento(`Falha ao gerar o link: ${error?.message ?? "sem URL"}`);
  return data.signedUrl;
}

export async function removerDocumento(supabase: SupabaseClient, id: string): Promise<void> {
  const doc = await obterDocumento(supabase, id);
  if (!doc) throw new ErroDocumento("Documento não encontrado.");
  const { error } = await supabase.from("documentos").delete().eq("id", id);
  if (error) throw new ErroDocumento(error.message.includes("row-level security") ? "Apenas advogado ou sócio remove documentos." : error.message);
  const admin = criarClienteAdmin();
  await admin.storage.from(doc.bucket).remove([doc.caminho]);
}

/** Páginas de texto extraído de um documento (respeita RLS do cliente passado). */
export async function lerPaginas(supabase: SupabaseClient, documentoId: string, de = 1, ate = 20): Promise<PaginaExtraida[]> {
  const { data, error } = await supabase.from("documento_paginas").select("numero, texto").eq("documento_id", documentoId).gte("numero", de).lte("numero", ate).order("numero");
  if (error) throw new ErroDocumento(error.message);
  return (data ?? []).map((p) => ({ numero: p.numero as number, texto: p.texto as string }));
}

export function trechoParaIa(paginas: PaginaExtraida[], de: number, ate: number): string {
  return montarTrecho(paginas, de, ate);
}

/** Bytes do arquivo no Storage (service role). */
export async function baixarBytes(admin: SupabaseClient, doc: Pick<Documento, "bucket" | "caminho">): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(doc.bucket).download(doc.caminho);
  if (error || !data) throw new ErroDocumento(`Falha ao baixar o arquivo: ${error?.message ?? "vazio"}`);
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Prepara o documento para ir à API: PDF que cabe nos limites vai inteiro (Files API quando houver chave, com o
 * file_id guardado por 24 h; senão base64); acima dos limites vai como texto das páginas extraídas.
 */
export async function anexarParaApi(admin: SupabaseClient, doc: Documento, opcoes: { de?: number; ate?: number } = {}): Promise<DocumentoEntrada> {
  const env = envServidor();
  const limites = { maxMb: env.IA_PDF_MAX_MB, maxPaginas: env.IA_PDF_MAX_PAGINAS };
  if (doc.mime === "application/pdf" && cabeNaApi(doc.tamanho, doc.paginas, limites)) {
    const valido = doc.anthropic_file_id && doc.anthropic_file_expira_em && new Date(doc.anthropic_file_expira_em) > new Date();
    if (valido) return { tipo: "arquivo", fileId: doc.anthropic_file_id as string, titulo: doc.nome, cache: true };
    const bytes = await baixarBytes(admin, doc);
    if (env.ANTHROPIC_API_KEY) {
      try {
        const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
        const arquivo = await anthropic.beta.files.upload({ file: await toFile(Buffer.from(bytes), doc.nome, { type: "application/pdf" }), expires_in_seconds: 24 * 3600 });
        await admin.from("documentos").update({ anthropic_file_id: arquivo.id, anthropic_file_expira_em: new Date(Date.now() + 23 * 3600_000).toISOString() }).eq("id", doc.id);
        return { tipo: "arquivo", fileId: arquivo.id, titulo: doc.nome, cache: true };
      } catch {
        // Files API indisponível: segue com base64
      }
    }
    return { tipo: "pdf_base64", dados: Buffer.from(bytes).toString("base64"), titulo: doc.nome, cache: true };
  }
  const paginas = await lerPaginas(admin, doc.id, opcoes.de ?? 1, opcoes.ate ?? (doc.paginas ?? 50));
  return { tipo: "texto", texto: montarTrecho(paginas, opcoes.de ?? 1, opcoes.ate ?? (doc.paginas ?? 50), 400_000), titulo: doc.nome, cache: true };
}
