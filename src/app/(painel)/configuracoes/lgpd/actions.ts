"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { validarConfiguracaoPolitica } from "@/lib/lgpd/retencao";
import { validarSolicitacao } from "@/lib/lgpd/solicitacoes";
import { anonimizarTitular, configurarPolitica, registrarSolicitacao, responderSolicitacao } from "@/server/lgpd";

const DESTINO = "/configuracoes/lgpd";

function volta(tipo: "erro" | "ok", mensagem: string): never {
  revalidatePath(DESTINO);
  redirect(`${DESTINO}?${tipo}=${encodeURIComponent(mensagem)}`);
}

/** Todas as ações exigem sócio. A RPC e as policies repetem a checagem com MFA. */
async function exigirSocio() {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") volta("erro", "Só o sócio altera a LGPD do escritório.");
  return sessao;
}

export async function registrarPedidoTitular(fd: FormData) {
  const sessao = await exigirSocio();
  const clienteId = String(fd.get("cliente_id") ?? "") || null;
  const titularNome = String(fd.get("titular_nome") ?? "");
  const tipo = String(fd.get("tipo") ?? "");
  const prazo = String(fd.get("prazo") ?? "");
  const motivo = validarSolicitacao({ tipo, titularNome, prazo });
  if (motivo) volta("erro", motivo);
  try {
    await registrarSolicitacao(await criarClienteServidor(), sessao.escritorioId, { titularClienteId: clienteId, titularNome, tipo, prazo, usuarioId: sessao.usuarioId });
  } catch (e) {
    volta("erro", e instanceof Error ? e.message : "Falha ao registrar o pedido.");
  }
  volta("ok", "Pedido registrado. Prazo informado: confirme com a advogada (a confirmar).");
}

export async function responderPedidoTitular(fd: FormData) {
  await exigirSocio();
  const id = String(fd.get("id") ?? "");
  const resposta = String(fd.get("resposta") ?? "").trim();
  const status = fd.get("status") === "indeferida" ? "indeferida" : "respondida";
  if (!/^[0-9a-f-]{36}$/i.test(id)) volta("erro", "Pedido inválido.");
  if (resposta.length < 5) volta("erro", "Escreva a resposta enviada ao titular.");
  try {
    await responderSolicitacao(await criarClienteServidor(), id, status, resposta);
  } catch (e) {
    volta("erro", e instanceof Error ? e.message : "Falha ao registrar a resposta.");
  }
  volta("ok", "Resposta registrada.");
}

export async function configurarRetencao(fd: FormData) {
  await exigirSocio();
  const tipo = String(fd.get("tipo_dado") ?? "");
  const prazoBruto = String(fd.get("prazo_meses") ?? "").trim();
  const prazoMeses = prazoBruto === "" ? null : Number(prazoBruto);
  const ativar = fd.get("ativar") === "1";
  const confirmacao = String(fd.get("confirmacao") ?? "");
  const motivo = validarConfiguracaoPolitica({ tipo, prazoMeses, ativar, confirmacao });
  if (motivo) volta("erro", motivo);
  try {
    await configurarPolitica(await criarClienteServidor(), tipo, prazoMeses, ativar, confirmacao);
  } catch (e) {
    volta("erro", e instanceof Error ? e.message : "Falha ao salvar a política.");
  }
  volta("ok", ativar ? "Descarte ativado e confirmado. O job só age no próximo domingo, 01h (Cuiabá)." : "Política salva. Nenhum dado foi apagado.");
}

/** Irreversível: exige o nome digitado (checado aqui e na RPC) e a caixa de ciência marcada. */
export async function anonimizarTitularAcao(fd: FormData) {
  await exigirSocio();
  const clienteId = String(fd.get("cliente_id") ?? "");
  const confirmacao = String(fd.get("confirmacao_nome") ?? "");
  const ciencia = fd.get("ciencia") === "1";
  if (!/^[0-9a-f-]{36}$/i.test(clienteId)) volta("erro", "Escolha o titular.");
  if (!ciencia) volta("erro", "Marque a caixa de ciência: a anonimização não tem volta.");
  if (confirmacao.trim().length === 0) volta("erro", "Digite o nome completo do titular para confirmar.");
  let mensagem: string;
  try {
    const r = await anonimizarTitular(await criarClienteServidor(), clienteId, confirmacao);
    mensagem = `Titular anonimizado. Partes de processos ajustadas: ${r.partes_anonimizadas}. Documentos a revisar no armazenamento: ${r.documentos_para_revisao}.`;
  } catch (e) {
    volta("erro", e instanceof Error ? e.message : "Falha ao anonimizar.");
  }
  volta("ok", mensagem);
}
