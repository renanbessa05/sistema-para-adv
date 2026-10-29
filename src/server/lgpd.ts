import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { montarPacoteTitular, nomeDoPacote, type DadosTitular } from "@/lib/lgpd/exportar";

export const BUCKET_EXPORTACOES = "exportacoes";
/** Link de download da exportação: curto, porque é um bearer link para dados pessoais. */
export const SEGUNDOS_LINK_EXPORTACAO = 300;

function erroSupabase(contexto: string, error: { message: string } | null): never {
  throw new Error(`${contexto}: ${error?.message ?? "erro desconhecido"}`);
}

/** Lê e grava com o cliente do usuário: RLS e MFA valem. Quem não é sócio com segundo fator recebe erro. */
export async function registrarSolicitacao(
  supabase: SupabaseClient,
  escritorioId: string,
  dados: { titularClienteId: string | null; titularNome: string; tipo: string; prazo: string; usuarioId: string },
): Promise<void> {
  const { error } = await supabase.from("lgpd_solicitacoes").insert({
    escritorio_id: escritorioId,
    titular_cliente_id: dados.titularClienteId,
    titular_nome: dados.titularNome.trim(),
    tipo: dados.tipo,
    prazo: dados.prazo,
    registrado_por: dados.usuarioId,
  });
  if (error) erroSupabase("Não foi possível registrar o pedido", error);
}

export async function responderSolicitacao(supabase: SupabaseClient, id: string, status: "respondida" | "indeferida", resposta: string): Promise<void> {
  const { error } = await supabase
    .from("lgpd_solicitacoes")
    .update({ status, resposta: resposta.trim(), respondida_em: new Date().toISOString() })
    .eq("id", id);
  if (error) erroSupabase("Não foi possível registrar a resposta", error);
}

export async function configurarPolitica(supabase: SupabaseClient, tipo: string, prazoMeses: number | null, ativar: boolean, confirmacao: string): Promise<void> {
  const { error } = await supabase.rpc("lgpd_configurar_politica", { p_tipo: tipo, p_prazo_meses: prazoMeses, p_ativar: ativar, p_confirmacao: confirmacao });
  if (error) erroSupabase("Não foi possível salvar a política", error);
}

/** Irreversível. A RPC confere sócio, MFA e o nome digitado. Devolve a contagem para revisão manual de documentos. */
export async function anonimizarTitular(supabase: SupabaseClient, clienteId: string, confirmacao: string): Promise<{ partes_anonimizadas: number; documentos_para_revisao: number }> {
  const { data, error } = await supabase.rpc("lgpd_anonimizar_titular", { p_cliente_id: clienteId, p_confirmacao: confirmacao });
  if (error) erroSupabase("Não foi possível anonimizar o titular", error);
  return data as { partes_anonimizadas: number; documentos_para_revisao: number };
}

/**
 * Exportação do titular: lê com o cliente do sócio (RLS e MFA), monta o ZIP, grava em exportacoes/<escritorio>/lgpd/
 * com a service role e devolve um link assinado de 5 minutos. Registra a ação em lgpd_auditoria.
 */
export async function gerarExportacaoTitular(
  supabase: SupabaseClient,
  escritorioId: string,
  usuarioId: string,
  clienteId: string,
  agora: Date = new Date(),
): Promise<{ url: string; arquivos: number }> {
  const { data: cliente, error: erroCliente } = await supabase
    .from("clientes")
    .select("id, nome, tipo_pessoa, cpf_cnpj, email, telefone_e164, endereco, observacoes, criado_em")
    .eq("id", clienteId)
    .maybeSingle();
  if (erroCliente) erroSupabase("Não foi possível ler o titular", erroCliente);
  if (!cliente) throw new Error("Titular não encontrado");

  const { data: partes, error: erroPartes } = await supabase
    .from("processo_partes")
    .select("nome, polo, processo:processos(id, numero_cnj_mascara)")
    .eq("cliente_id", clienteId);
  if (erroPartes) erroSupabase("Não foi possível ler os processos", erroPartes);

  const { data: documentos, error: erroDocs } = await supabase
    .from("documentos")
    .select("id, nome, tipo, mime, tamanho, criado_em")
    .eq("cliente_id", clienteId);
  if (erroDocs) erroSupabase("Não foi possível ler os documentos", erroDocs);

  const dados: DadosTitular = {
    cliente: { ...(cliente as DadosTitular["cliente"]) },
    processos: ((partes ?? []) as unknown as { nome: string; polo: string; processo: { id: string; numero_cnj_mascara: string } | null }[])
      .filter((p) => p.processo)
      .map((p) => ({ processo_id: p.processo!.id, numero_cnj: p.processo!.numero_cnj_mascara, polo: p.polo, nome_na_parte: p.nome })),
    documentos: (documentos ?? []) as DadosTitular["documentos"],
  };

  const arquivos = montarPacoteTitular(dados, agora.toISOString());
  const zip = new JSZip();
  for (const a of arquivos) zip.file(a.nome, a.conteudo);
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  const admin = criarClienteAdmin();
  const dataIso = agora.toISOString().slice(0, 10);
  const caminho = `${escritorioId}/lgpd/${crypto.randomUUID()}-${nomeDoPacote(clienteId, dataIso)}`;
  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET_EXPORTACOES)) await admin.storage.createBucket(BUCKET_EXPORTACOES, { public: false });
  const { error: erroUpload } = await admin.storage.from(BUCKET_EXPORTACOES).upload(caminho, buffer, { contentType: "application/zip", upsert: false });
  if (erroUpload) erroSupabase("Não foi possível gravar a exportação", erroUpload);

  const { data: assinado, error: erroAssinatura } = await admin.storage.from(BUCKET_EXPORTACOES).createSignedUrl(caminho, SEGUNDOS_LINK_EXPORTACAO, { download: nomeDoPacote(clienteId, dataIso) });
  if (erroAssinatura || !assinado) erroSupabase("Não foi possível assinar o link", erroAssinatura);

  const { error: erroAuditoria } = await admin.from("lgpd_auditoria").insert({
    escritorio_id: escritorioId,
    usuario_id: usuarioId,
    acao: "exportar_titular",
    alvo_tipo: "cliente",
    alvo_id: clienteId,
    detalhes: { caminho, arquivos: arquivos.length, processos: dados.processos.length, documentos: dados.documentos.length },
  });
  if (erroAuditoria) erroSupabase("Exportação gravada, mas a auditoria falhou", erroAuditoria);

  return { url: assinado.signedUrl, arquivos: arquivos.length };
}
