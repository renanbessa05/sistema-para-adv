"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { enriquecerDatajud } from "@/server/jobs/enriquecer-datajud";
import { tentarDecomporCnj } from "@/lib/cnj";
import { lerValorMonetario, podeEditarProcesso, podeImportarCarteira, podeMarcarSigilo } from "@/server/processos";
import { importarCarteira, parseCarteiraCsv, type LinhaCarteira, type RelatorioImportacao, type ResultadoParse } from "@/server/importar-carteira";
import { listarMembros } from "@/server/equipe";

function texto(fd: FormData, nome: string): string {
  const v = fd.get(nome);
  return typeof v === "string" ? v.trim() : "";
}
function opcional(fd: FormData, nome: string): string | null {
  return texto(fd, nome) || null;
}
function falhar(destino: string, mensagem: string): never {
  redirect(`${destino}${destino.includes("?") ? "&" : "?"}erro=${encodeURIComponent(mensagem)}`);
}
function concluir(destino: string, mensagem: string): never {
  redirect(`${destino}${destino.includes("?") ? "&" : "?"}ok=${encodeURIComponent(mensagem)}`);
}
const uuid = z.string().uuid();
const uuidOpcional = z.string().uuid().nullable();

/** Enriquecimento pelo DataJud: service role filtrado pelo escritório da sessão. Falha não derruba o cadastro. */
async function enriquecer(escritorioId: string, processoIds: string[]): Promise<string | null> {
  if (processoIds.length === 0) return null;
  try {
    const admin = criarClienteAdmin();
    const resumo = await enriquecerDatajud(admin, { escritorioId, processoIds, lote: processoIds.length });
    const primeiro = resumo[0] as { ok?: boolean; erro?: string } | undefined;
    if (primeiro && primeiro.ok === false) return primeiro.erro ?? "DataJud indisponível";
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const esquemaNovo = z.object({
  numero_cnj: z.string().min(1, "Informe o número CNJ"),
  cliente_id: uuidOpcional,
  cliente_nome: z.string().nullable(),
  cliente_tipo: z.enum(["fisica", "juridica"]).default("fisica"),
  cliente_documento: z.string().nullable(),
  polo_cliente: z.enum(["ativo", "passivo", "terceiro", "outro"]),
  parte_contraria: z.string().nullable(),
  comarca_id: uuidOpcional,
  responsavel_id: uuidOpcional,
  colaboradores: z.array(z.string().uuid()),
  sigiloso: z.boolean(),
  observacoes: z.string().nullable(),
});

export async function criarProcesso(fd: FormData) {
  const sessao = await exigirSessao();
  if (!podeEditarProcesso(sessao.papel)) falhar("/processos/novo", "Seu papel não cadastra processo.");
  const bruto = {
    numero_cnj: texto(fd, "numero_cnj"),
    cliente_id: opcional(fd, "cliente_id"),
    cliente_nome: opcional(fd, "cliente_nome"),
    cliente_tipo: texto(fd, "cliente_tipo") || "fisica",
    cliente_documento: opcional(fd, "cliente_documento"),
    polo_cliente: texto(fd, "polo_cliente") || "ativo",
    parte_contraria: opcional(fd, "parte_contraria"),
    comarca_id: opcional(fd, "comarca_id"),
    responsavel_id: opcional(fd, "responsavel_id"),
    colaboradores: fd.getAll("colaboradores").filter((c): c is string => typeof c === "string" && c !== ""),
    sigiloso: fd.get("sigiloso") === "on",
    observacoes: opcional(fd, "observacoes"),
  };
  const lido = esquemaNovo.safeParse(bruto);
  const voltar = `/processos/novo?cnj=${encodeURIComponent(bruto.numero_cnj)}`;
  if (!lido.success) falhar(voltar, lido.error.issues[0]?.message ?? "Dados inválidos");
  const dados = lido.data;

  const cnj = tentarDecomporCnj(dados.numero_cnj);
  if (!cnj) falhar(voltar, "Número CNJ inválido: confira os 20 dígitos e o dígito verificador.");
  if (!dados.cliente_id && !dados.cliente_nome) falhar(voltar, "Escolha um cliente ou informe o nome de um cliente novo.");

  const supabase = await criarClienteServidor();

  const { data: existente } = await supabase.from("processos").select("id").eq("escritorio_id", sessao.escritorioId).eq("numero_cnj", cnj.digitos).maybeSingle();
  if (existente) redirect(`/processos/${existente.id}?ok=${encodeURIComponent("Este processo já estava na carteira.")}`);

  let tribunalId: string | null = null;
  if (cnj.tribunalSigla) {
    const { data: tribunal } = await supabase.schema("ref").from("tribunais").select("id").eq("sigla", cnj.tribunalSigla).maybeSingle();
    tribunalId = (tribunal?.id as string | undefined) ?? null;
  }

  let clienteId = dados.cliente_id;
  let clienteNome = dados.cliente_nome ?? "";
  if (clienteId) {
    const { data: cliente } = await supabase.from("clientes").select("id, nome").eq("id", clienteId).maybeSingle();
    if (!cliente) falhar(voltar, "Cliente não encontrado.");
    clienteNome = cliente.nome as string;
  } else {
    const documento = dados.cliente_documento?.replace(/\D/g, "") || null;
    const { data: novo, error } = await supabase
      .from("clientes")
      .insert({ escritorio_id: sessao.escritorioId, nome: clienteNome, tipo_pessoa: dados.cliente_tipo, cpf_cnpj: documento, criado_por: sessao.usuarioId })
      .select("id")
      .single();
    if (error || !novo) falhar(voltar, `Não foi possível criar o cliente: ${error?.message ?? "erro"}`);
    clienteId = novo.id as string;
  }

  const { data: processo, error: erroProcesso } = await supabase
    .from("processos")
    .insert({
      escritorio_id: sessao.escritorioId,
      numero_cnj: cnj.digitos,
      tribunal_id: tribunalId,
      comarca_id: dados.comarca_id,
      responsavel_id: dados.responsavel_id,
      observacoes: dados.observacoes,
      criado_por: sessao.usuarioId,
    })
    .select("id")
    .single();
  if (erroProcesso || !processo) falhar(voltar, `Não foi possível cadastrar o processo: ${erroProcesso?.message ?? "erro"}`);
  const processoId = processo.id as string;

  const partes: { escritorio_id: string; processo_id: string; nome: string; polo: string; cliente_id: string | null; eh_cliente: boolean; documento: string | null; origem: string }[] = [
    { escritorio_id: sessao.escritorioId, processo_id: processoId, nome: clienteNome, polo: dados.polo_cliente, cliente_id: clienteId, eh_cliente: true, documento: dados.cliente_documento?.replace(/\D/g, "") || null, origem: "manual" },
  ];
  if (dados.parte_contraria) {
    const poloContrario = dados.polo_cliente === "ativo" ? "passivo" : dados.polo_cliente === "passivo" ? "ativo" : "outro";
    partes.push({ escritorio_id: sessao.escritorioId, processo_id: processoId, nome: dados.parte_contraria, polo: poloContrario, cliente_id: null, eh_cliente: false, documento: null, origem: "manual" });
  }
  await supabase.from("processo_partes").insert(partes);

  const colaboradores = dados.colaboradores.filter((c) => c !== dados.responsavel_id);
  if (colaboradores.length) {
    await supabase.from("processo_colaboradores").insert(colaboradores.map((usuario_id) => ({ escritorio_id: sessao.escritorioId, processo_id: processoId, usuario_id })));
  }

  let aviso: string | null = null;
  if (dados.sigiloso && podeMarcarSigilo(sessao.papel)) {
    const { error } = await supabase.rpc("marcar_sigilo", { p_processo_id: processoId, p_sigiloso: true });
    if (error) aviso = `Processo criado, mas o sigilo não foi marcado: ${error.message}`;
  }

  const erroDatajud = await enriquecer(sessao.escritorioId, [processoId]);
  revalidatePath("/processos");
  revalidatePath("/processos/kanban");
  if (aviso) falhar(`/processos/${processoId}`, aviso);
  if (erroDatajud) redirect(`/processos/${processoId}?ok=${encodeURIComponent("Processo cadastrado.")}&aviso=${encodeURIComponent(`DataJud: ${erroDatajud}`)}`);
  concluir(`/processos/${processoId}`, "Processo cadastrado e enviado ao DataJud.");
}

const esquemaEdicao = z.object({
  comarca_id: uuidOpcional,
  competencia: z.enum(["vara_comum", "juizado_especial", "segundo_grau", "outra"]),
  sistema: z.enum(["pje", "projudi", "eproc", "esaj", "outro"]),
  orgao_julgador_nome: z.string().nullable(),
  classe_nome: z.string().nullable(),
  grau: z.string().nullable(),
  data_ajuizamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  valor_causa: z.number().nullable(),
  status: z.enum(["ativo", "suspenso", "arquivado", "baixado"]),
  observacoes: z.string().nullable(),
});

export async function atualizarProcesso(processoId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const destino = `/processos/${processoId}`;
  if (!podeEditarProcesso(sessao.papel)) falhar(destino, "Seu papel não edita processo.");
  const lido = esquemaEdicao.safeParse({
    comarca_id: opcional(fd, "comarca_id"),
    competencia: texto(fd, "competencia") || "vara_comum",
    sistema: texto(fd, "sistema") || "pje",
    orgao_julgador_nome: opcional(fd, "orgao_julgador_nome"),
    classe_nome: opcional(fd, "classe_nome"),
    grau: opcional(fd, "grau"),
    data_ajuizamento: opcional(fd, "data_ajuizamento"),
    valor_causa: lerValorMonetario(opcional(fd, "valor_causa")),
    status: texto(fd, "status") || "ativo",
    observacoes: opcional(fd, "observacoes"),
  });
  if (!lido.success) falhar(destino, `Dados inválidos: ${lido.error.issues[0]?.path.join(".")}`);
  const supabase = await criarClienteServidor();
  // A competência escolhida na tela é ajuste manual (inclusive "vara comum"): o DataJud deixa de sobrescrevê-la
  const { error } = await supabase.from("processos").update({ ...lido.data, competencia_manual: true }).eq("id", processoId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(destino, `Não foi possível salvar: ${error.message}`);
  revalidatePath(destino);
  revalidatePath("/processos");
  concluir(destino, "Dados salvos.");
}

export async function alterarSigilo(processoId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const destino = `/processos/${processoId}`;
  if (!podeMarcarSigilo(sessao.papel)) falhar(destino, "Só advogado ou sócio altera o sigilo.");
  const sigiloso = texto(fd, "sigiloso") === "1";
  const nivel = Number(texto(fd, "nivel")) || null;
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("marcar_sigilo", { p_processo_id: processoId, p_sigiloso: sigiloso, p_nivel: sigiloso ? nivel : null });
  if (error) falhar(destino, `Não foi possível alterar o sigilo: ${error.message}`);
  revalidatePath(destino);
  revalidatePath("/processos");
  concluir(destino, sigiloso ? "Processo marcado como sigiloso." : "Sigilo removido.");
}

export async function alterarResponsavel(processoId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const destino = `/processos/${processoId}`;
  if (sessao.papel !== "socio" && sessao.papel !== "advogado") falhar(destino, "Só advogado ou sócio troca o responsável.");
  const lido = uuidOpcional.safeParse(opcional(fd, "responsavel_id"));
  if (!lido.success) falhar(destino, "Responsável inválido.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("processos").update({ responsavel_id: lido.data }).eq("id", processoId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(destino, `Não foi possível trocar o responsável: ${error.message}`);
  revalidatePath(destino);
  revalidatePath("/processos");
  concluir(destino, "Responsável atualizado.");
}

export async function adicionarParte(processoId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const destino = `/processos/${processoId}`;
  if (!podeEditarProcesso(sessao.papel)) falhar(destino, "Seu papel não edita processo.");
  const lido = z
    .object({ nome: z.string().min(1, "Informe o nome da parte"), polo: z.enum(["ativo", "passivo", "terceiro", "outro"]), cliente_id: uuidOpcional, documento: z.string().nullable() })
    .safeParse({ nome: texto(fd, "nome"), polo: texto(fd, "polo") || "outro", cliente_id: opcional(fd, "cliente_id"), documento: opcional(fd, "documento") });
  if (!lido.success) falhar(destino, lido.error.issues[0]?.message ?? "Dados inválidos");
  const supabase = await criarClienteServidor();
  let nome = lido.data.nome;
  if (lido.data.cliente_id) {
    const { data: cliente } = await supabase.from("clientes").select("nome").eq("id", lido.data.cliente_id).maybeSingle();
    if (cliente?.nome && !nome) nome = cliente.nome as string;
  }
  const { error } = await supabase.from("processo_partes").insert({
    escritorio_id: sessao.escritorioId,
    processo_id: processoId,
    nome,
    polo: lido.data.polo,
    cliente_id: lido.data.cliente_id,
    eh_cliente: Boolean(lido.data.cliente_id),
    documento: lido.data.documento?.replace(/\D/g, "") || null,
    origem: "manual",
  });
  if (error) falhar(destino, `Não foi possível adicionar a parte: ${error.message}`);
  revalidatePath(destino);
  concluir(destino, "Parte adicionada.");
}

export async function removerParte(processoId: string, parteId: string) {
  const sessao = await exigirSessao();
  const destino = `/processos/${processoId}`;
  if (!podeEditarProcesso(sessao.papel)) falhar(destino, "Seu papel não edita processo.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("processo_partes").delete().eq("id", parteId).eq("processo_id", processoId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(destino, `Não foi possível remover a parte: ${error.message}`);
  revalidatePath(destino);
  concluir(destino, "Parte removida.");
}

export async function adicionarColaborador(processoId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const destino = `/processos/${processoId}`;
  if (!podeEditarProcesso(sessao.papel)) falhar(destino, "Seu papel não edita processo.");
  const lido = uuid.safeParse(texto(fd, "usuario_id"));
  if (!lido.success) falhar(destino, "Escolha um membro da equipe.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("processo_colaboradores").upsert({ escritorio_id: sessao.escritorioId, processo_id: processoId, usuario_id: lido.data }, { onConflict: "processo_id,usuario_id", ignoreDuplicates: true });
  if (error) falhar(destino, `Não foi possível adicionar o colaborador: ${error.message}`);
  revalidatePath(destino);
  concluir(destino, "Colaborador adicionado.");
}

export async function removerColaborador(processoId: string, usuarioId: string) {
  const sessao = await exigirSessao();
  const destino = `/processos/${processoId}`;
  if (!podeEditarProcesso(sessao.papel)) falhar(destino, "Seu papel não edita processo.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("processo_colaboradores").delete().eq("processo_id", processoId).eq("usuario_id", usuarioId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(destino, `Não foi possível remover o colaborador: ${error.message}`);
  revalidatePath(destino);
  concluir(destino, "Colaborador removido.");
}

/** Mover de fase (detalhe e kanban): grava fase_id e quem confirmou. `voltar` é a página que chamou. */
export async function moverFase(processoId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const voltar = texto(fd, "voltar").startsWith("/") ? texto(fd, "voltar") : `/processos/${processoId}`;
  if (!podeEditarProcesso(sessao.papel)) falhar(voltar, "Seu papel não move processo de fase.");
  const lido = uuidOpcional.safeParse(opcional(fd, "fase_id"));
  if (!lido.success) falhar(voltar, "Fase inválida.");
  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("processos")
    .update({ fase_id: lido.data, fase_confirmada_por: sessao.usuarioId, fase_confirmada_em: new Date().toISOString() })
    .eq("id", processoId)
    .eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(voltar, `Não foi possível mover de fase: ${error.message}`);
  revalidatePath(`/processos/${processoId}`);
  revalidatePath("/processos/kanban");
  redirect(voltar);
}

export async function atualizarPeloDatajud(processoId: string) {
  const sessao = await exigirSessao();
  const destino = `/processos/${processoId}`;
  const supabase = await criarClienteServidor();
  // Garante que o processo é do escritório da sessão antes de usar a service role
  const { data: processo } = await supabase.from("processos").select("id").eq("id", processoId).eq("escritorio_id", sessao.escritorioId).maybeSingle();
  if (!processo) falhar(destino, "Processo não encontrado.");
  const erro = await enriquecer(sessao.escritorioId, [processoId]);
  revalidatePath(destino);
  if (erro) falhar(destino, `DataJud: ${erro}`);
  concluir(destino, "Dados atualizados pelo DataJud.");
}

// ---------- Importação de carteira (useActionState) ----------

export type EstadoImportacao =
  | { etapa: "inicio"; erro?: string }
  | { etapa: "previa"; parse: ResultadoParse; nomeArquivo: string }
  | { etapa: "concluida"; relatorio: RelatorioImportacao; erroDatajud: string | null };

/** Um único reducer para o useActionState do formulário: a etapa vem no campo oculto `etapa`. */
export async function acaoImportacao(anterior: EstadoImportacao, fd: FormData): Promise<EstadoImportacao> {
  const etapa = fd.get("etapa");
  if (etapa === "confirmar") return confirmarImportacao(anterior, fd);
  if (etapa === "reiniciar") return { etapa: "inicio" };
  return previsualizarCarteira(anterior, fd);
}

export async function previsualizarCarteira(_anterior: EstadoImportacao, fd: FormData): Promise<EstadoImportacao> {
  const sessao = await exigirSessao();
  if (!podeImportarCarteira(sessao.papel)) return { etapa: "inicio", erro: "Seu papel não importa carteira." };
  const arquivo = fd.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { etapa: "inicio", erro: "Escolha um arquivo CSV." };
  if (arquivo.size > 5 * 1024 * 1024) return { etapa: "inicio", erro: "Arquivo acima de 5 MB. Divida a carteira em partes." };
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let textoCsv = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (textoCsv.includes("�")) textoCsv = new TextDecoder("windows-1252").decode(bytes);
  const parse = parseCarteiraCsv(textoCsv);
  return { etapa: "previa", parse, nomeArquivo: arquivo.name };
}

export async function confirmarImportacao(anterior: EstadoImportacao, fd: FormData): Promise<EstadoImportacao> {
  const sessao = await exigirSessao();
  if (!podeImportarCarteira(sessao.papel)) return { etapa: "inicio", erro: "Seu papel não importa carteira." };
  if (anterior.etapa !== "previa") return { etapa: "inicio", erro: "Envie o arquivo novamente." };
  const selecionadas = new Set(fd.getAll("linha").filter((v): v is string => typeof v === "string"));
  const linhas: LinhaCarteira[] = anterior.parse.validas.filter((l) => selecionadas.has(String(l.linha)));
  if (linhas.length === 0) return { etapa: "inicio", erro: "Nenhuma linha selecionada para importar." };

  const supabase = await criarClienteServidor();
  const membros = await listarMembros(supabase, sessao.escritorioId);
  const { data: tribunais } = await supabase.schema("ref").from("tribunais").select("id, sigla");
  const tribunalIdPorSigla = new Map<string, string>((tribunais ?? []).map((t) => [String(t.sigla), String(t.id)]));
  const { data: comarcas } = await supabase.schema("ref").from("comarcas").select("id, nome").eq("ativa", true);

  const relatorio = await importarCarteira(supabase, linhas, {
    sessao,
    membros,
    comarcas: (comarcas ?? []).map((c) => ({ id: String(c.id), nome: String(c.nome) })),
    tribunalIdPorSigla,
  });
  relatorio.rejeitadas = [...anterior.parse.rejeitadas, ...relatorio.rejeitadas];
  const erroDatajud = await enriquecer(sessao.escritorioId, relatorio.processoIds);
  revalidatePath("/processos");
  revalidatePath("/processos/kanban");
  revalidatePath("/clientes");
  return { etapa: "concluida", relatorio, erroDatajud };
}
