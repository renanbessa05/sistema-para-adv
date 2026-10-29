"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { atualizarDadosDocumentos, calcular, cancelarContrato, confirmarValor, criarRascunho, diagnosticar, enviarParaAprovacao, ErroContrato, gerarDocumentos, marcarParcela, registrarAssinatura } from "@/server/contratos";

function texto(fd: FormData, nome: string): string {
  const v = fd.get(nome);
  return typeof v === "string" ? v.trim() : "";
}
function numero(fd: FormData, nome: string): number | null {
  const t = texto(fd, nome).replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function falhar(destino: string, e: unknown): never {
  const msg = e instanceof ErroContrato || e instanceof Error ? e.message : String(e);
  redirect(`${destino}?erro=${encodeURIComponent(msg)}`);
}
function concluir(destino: string, msg: string): never {
  redirect(`${destino}?ok=${encodeURIComponent(msg)}`);
}

export async function novoContratoAction(fd: FormData) {
  const sessao = await exigirSessao();
  const campos = z
    .object({ cliente_id: z.uuid(), processo_id: z.uuid().optional().or(z.literal("")), demanda_em_curso: z.enum(["sim", "nao"]), via: z.enum(["judicial", "extrajudicial"]), polo: z.string().min(2).max(60), relato: z.string().min(20).max(20000) })
    .safeParse({ cliente_id: texto(fd, "cliente_id"), processo_id: texto(fd, "processo_id"), demanda_em_curso: texto(fd, "demanda_em_curso"), via: texto(fd, "via"), polo: texto(fd, "polo"), relato: texto(fd, "relato") });
  if (!campos.success) redirect(`/contratos/novo?erro=${encodeURIComponent("Preencha cliente, polo e um relato com pelo menos 20 caracteres.")}`);
  let id: string;
  try {
    id = await criarRascunho(sessao, { clienteId: campos.data.cliente_id, processoId: campos.data.processo_id || null, demandaEmCurso: campos.data.demanda_em_curso === "sim", via: campos.data.via, polo: campos.data.polo, relato: campos.data.relato });
    await diagnosticar(sessao, id);
  } catch (e) {
    if (typeof id! === "string") redirect(`/contratos/${id!}?erro=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
    falhar("/contratos/novo", e);
  }
  revalidatePath("/contratos");
  redirect(`/contratos/${id}`);
}

export async function rediagnosticarAction(contratoId: string) {
  const sessao = await exigirSessao();
  try {
    await diagnosticar(sessao, contratoId);
  } catch (e) {
    falhar(`/contratos/${contratoId}`, e);
  }
  revalidatePath(`/contratos/${contratoId}`);
  concluir(`/contratos/${contratoId}`, "Diagnóstico refeito.");
}

export async function recalcularAction(contratoId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const rubricas = fd.getAll("rubricas").map(String).filter(Boolean);
  const complexidade = texto(fd, "complexidade") as "baixa" | "media" | "alta";
  try {
    await calcular(sessao, contratoId, { rubricas: rubricas.length ? rubricas : undefined, proveito: numero(fd, "proveito"), complexidade: ["baixa", "media", "alta"].includes(complexidade) ? complexidade : undefined, cautelarSatisfativa: fd.get("cautelar_satisfativa") === "on", parcelas: numero(fd, "parcelas") });
  } catch (e) {
    falhar(`/contratos/${contratoId}`, e);
  }
  revalidatePath(`/contratos/${contratoId}`);
  concluir(`/contratos/${contratoId}`, "Cálculo refeito.");
}

export async function confirmarValorAction(contratoId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const modalidade = texto(fd, "modalidade") as "fixo" | "exito" | "misto" | "fixo_parcelado";
  if (!["fixo", "exito", "misto", "fixo_parcelado"].includes(modalidade)) falhar(`/contratos/${contratoId}`, new ErroContrato("Escolha a modalidade."));
  let alertas: string[] = [];
  try {
    const r = await confirmarValor(sessao, contratoId, { modalidade, valorFixo: numero(fd, "valor_fixo"), percentual: numero(fd, "percentual"), parcelas: numero(fd, "parcelas"), primeiraParcelaEm: texto(fd, "primeira_parcela_em") || null, diaVencimento: numero(fd, "dia_vencimento"), forcar: fd.get("forcar") === "on" });
    alertas = r.alertas;
  } catch (e) {
    falhar(`/contratos/${contratoId}`, e);
  }
  revalidatePath(`/contratos/${contratoId}`);
  concluir(`/contratos/${contratoId}`, alertas.length ? `Valor e modalidade confirmados. Atenção: ${alertas.join(", ")}.` : "Valor e modalidade confirmados. Agora complete a qualificação e gere os documentos.");
}

export async function salvarDadosDocumentosAction(contratoId: string, fd: FormData) {
  const sessao = await exigirSessao();
  try {
    await atualizarDadosDocumentos(sessao, contratoId, {
      qualificacao: {
        nacionalidade: texto(fd, "nacionalidade") || undefined,
        estadoCivil: texto(fd, "estado_civil") || undefined,
        profissao: texto(fd, "profissao") || undefined,
        representante: texto(fd, "representante") || undefined,
        representanteQualificacao: texto(fd, "representante_qualificacao") || undefined,
        instrumentoRepresentacao: texto(fd, "instrumento_representacao") || undefined,
        orgaos_do_caso: texto(fd, "orgaos_do_caso") || undefined,
        fato_essencial: texto(fd, "fato_essencial") || undefined,
      },
      gratuidade: fd.get("gratuidade") === "on",
      poderes: fd.getAll("poderes").map(String),
      contatosProcuracao: (texto(fd, "contatos_procuracao") as "cliente" | "escritorio" | "nenhum") || "escritorio",
      foroComarca: texto(fd, "foro_comarca") || null,
      juizo: texto(fd, "juizo") || null,
      parteContraria: texto(fd, "parte_contraria") || null,
    });
    const { pendentes } = await gerarDocumentos(sessao, contratoId);
    revalidatePath(`/contratos/${contratoId}`);
    concluir(`/contratos/${contratoId}`, pendentes.length ? `Documentos gerados com ${pendentes.length} lacuna(s): ${pendentes.slice(0, 4).join(", ")}${pendentes.length > 4 ? "…" : ""}. Preencha e gere de novo antes de enviar para aprovação.` : "Documentos gerados sem lacunas.");
  } catch (e) {
    falhar(`/contratos/${contratoId}`, e);
  }
}

export async function enviarAprovacaoAction(contratoId: string) {
  await exigirSessao();
  try {
    await enviarParaAprovacao(contratoId);
  } catch (e) {
    falhar(`/contratos/${contratoId}`, e);
  }
  revalidatePath(`/contratos/${contratoId}`);
  revalidatePath("/aprovacoes");
  concluir(`/contratos/${contratoId}`, "Enviado para aprovação.");
}

export async function registrarAssinaturaAction(contratoId: string, fd: FormData) {
  await exigirSessao();
  try {
    await registrarAssinatura(contratoId, texto(fd, "assinado_em") || new Date().toISOString().slice(0, 10));
  } catch (e) {
    falhar(`/contratos/${contratoId}`, e);
  }
  revalidatePath(`/contratos/${contratoId}`);
  concluir(`/contratos/${contratoId}`, "Assinatura registrada.");
}

export async function marcarParcelaAction(contratoId: string, parcelaId: string, fd: FormData) {
  await exigirSessao();
  const status = texto(fd, "status") as "paga" | "pendente" | "cancelada";
  try {
    await marcarParcela(parcelaId, status, texto(fd, "paga_em") || null, texto(fd, "observacao") || null);
  } catch (e) {
    falhar(`/contratos/${contratoId}`, e);
  }
  revalidatePath(`/contratos/${contratoId}`);
  concluir(`/contratos/${contratoId}`, "Parcela atualizada.");
}

export async function cancelarContratoAction(contratoId: string, fd: FormData) {
  await exigirSessao();
  try {
    await cancelarContrato(contratoId, texto(fd, "motivo") || "sem motivo informado");
  } catch (e) {
    falhar(`/contratos/${contratoId}`, e);
  }
  revalidatePath("/contratos");
  concluir(`/contratos/${contratoId}`, "Contrato cancelado.");
}
