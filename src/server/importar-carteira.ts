import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tentarDecomporCnj } from "@/lib/cnj";
import { localizarMembro, type Membro } from "./equipe";
import type { Sessao } from "./sessao";

/**
 * Importação de carteira por CSV.
 * `parseCarteiraCsv` é pura (texto → linhas válidas e rejeitadas) e coberta por teste.
 * `importarCarteira` grava com o cliente do usuário (RLS) e dispara o enriquecimento pelo DataJud.
 */

export const COLUNAS_CSV = ["numero_cnj", "cliente", "cpf_cnpj", "polo", "parte_contraria", "comarca", "responsavel", "colaboradores", "sigiloso", "observacoes"] as const;
type ColunaCsv = (typeof COLUNAS_CSV)[number];

export type PoloCsv = "ativo" | "passivo" | "terceiro" | "outro";

export interface LinhaCarteira {
  linha: number;
  numero_cnj: string; // 20 dígitos
  numero_cnj_mascara: string;
  tribunal_sigla: string | null;
  cliente: string;
  cpf_cnpj: string | null; // só dígitos (11 ou 14)
  polo: PoloCsv;
  parte_contraria: string | null;
  comarca: string | null;
  responsavel: string | null;
  colaboradores: string[];
  sigiloso: boolean;
  observacoes: string | null;
}

export interface LinhaRejeitada {
  linha: number;
  numero_cnj: string | null;
  motivo: string;
}

export interface ResultadoParse {
  separador: ";" | ",";
  colunas: string[];
  validas: LinhaCarteira[];
  rejeitadas: LinhaRejeitada[];
}

const POLOS: Record<string, PoloCsv> = {
  ativo: "ativo",
  autor: "ativo",
  autora: "ativo",
  requerente: "ativo",
  exequente: "ativo",
  reclamante: "ativo",
  passivo: "passivo",
  reu: "passivo",
  re: "passivo",
  requerido: "passivo",
  requerida: "passivo",
  executado: "passivo",
  executada: "passivo",
  reclamado: "passivo",
  terceiro: "terceiro",
  outro: "outro",
};

function normalizarChave(texto: string): string {
  return texto
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s-]+/g, "_");
}

/** Divide uma linha CSV respeitando aspas duplas (e aspas escapadas como ""). */
export function dividirLinhaCsv(linha: string, separador: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let entreAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (entreAspas) {
      if (ch === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        atual += ch;
      }
    } else if (ch === '"') {
      entreAspas = true;
    } else if (ch === separador) {
      campos.push(atual);
      atual = "";
    } else {
      atual += ch;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

/** Detecta o separador pela primeira linha: o que aparecer mais vezes fora de aspas. */
export function detectarSeparador(cabecalho: string): ";" | "," {
  let pv = 0;
  let vg = 0;
  let entreAspas = false;
  for (const ch of cabecalho) {
    if (ch === '"') entreAspas = !entreAspas;
    else if (!entreAspas && ch === ";") pv++;
    else if (!entreAspas && ch === ",") vg++;
  }
  return vg > pv ? "," : ";";
}

function lerBooleano(texto: string | undefined): boolean | null {
  const t = normalizarChave(texto ?? "");
  if (!t) return false;
  if (["s", "sim", "y", "yes", "true", "1", "x"].includes(t)) return true;
  if (["n", "nao", "no", "false", "0"].includes(t)) return false;
  return null;
}

/**
 * Converte o texto do CSV em linhas válidas e rejeitadas (com motivo).
 * Colunas obrigatórias: numero_cnj e cliente. Número CNJ repetido no arquivo é rejeitado na segunda ocorrência.
 */
export function parseCarteiraCsv(texto: string): ResultadoParse {
  const linhas = texto
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "");
  if (linhas.length === 0) return { separador: ";", colunas: [], validas: [], rejeitadas: [{ linha: 0, numero_cnj: null, motivo: "Arquivo vazio" }] };

  const separador = detectarSeparador(linhas[0]);
  const colunas = dividirLinhaCsv(linhas[0], separador).map(normalizarChave);
  const indice = new Map<ColunaCsv, number>();
  for (const c of COLUNAS_CSV) {
    const i = colunas.indexOf(c);
    if (i >= 0) indice.set(c, i);
  }
  if (!indice.has("numero_cnj") || !indice.has("cliente")) {
    return { separador, colunas, validas: [], rejeitadas: [{ linha: 1, numero_cnj: null, motivo: `Cabeçalho precisa ter as colunas numero_cnj e cliente (encontradas: ${colunas.join(", ") || "nenhuma"})` }] };
  }

  const validas: LinhaCarteira[] = [];
  const rejeitadas: LinhaRejeitada[] = [];
  const vistos = new Set<string>();

  for (let n = 1; n < linhas.length; n++) {
    const numeroLinha = n + 1;
    const campos = dividirLinhaCsv(linhas[n], separador);
    const ler = (c: ColunaCsv): string => {
      const i = indice.get(c);
      return i === undefined ? "" : (campos[i] ?? "").trim();
    };

    const numeroTexto = ler("numero_cnj");
    const cnj = tentarDecomporCnj(numeroTexto);
    if (!cnj) {
      rejeitadas.push({ linha: numeroLinha, numero_cnj: numeroTexto || null, motivo: numeroTexto ? "Número CNJ inválido (formato ou dígito verificador)" : "Número CNJ ausente" });
      continue;
    }
    if (vistos.has(cnj.digitos)) {
      rejeitadas.push({ linha: numeroLinha, numero_cnj: cnj.mascara, motivo: "Número CNJ repetido no arquivo" });
      continue;
    }

    const cliente = ler("cliente");
    if (!cliente) {
      rejeitadas.push({ linha: numeroLinha, numero_cnj: cnj.mascara, motivo: "Cliente ausente" });
      continue;
    }

    const docDigitos = ler("cpf_cnpj").replace(/\D/g, "");
    if (docDigitos && docDigitos.length !== 11 && docDigitos.length !== 14) {
      rejeitadas.push({ linha: numeroLinha, numero_cnj: cnj.mascara, motivo: `CPF/CNPJ com ${docDigitos.length} dígitos (esperado 11 ou 14)` });
      continue;
    }

    const poloTexto = normalizarChave(ler("polo"));
    const polo = poloTexto ? POLOS[poloTexto] : "ativo";
    if (!polo) {
      rejeitadas.push({ linha: numeroLinha, numero_cnj: cnj.mascara, motivo: `Polo desconhecido: "${ler("polo")}" (use ativo, passivo, terceiro ou outro)` });
      continue;
    }

    const sigiloso = lerBooleano(ler("sigiloso"));
    if (sigiloso === null) {
      rejeitadas.push({ linha: numeroLinha, numero_cnj: cnj.mascara, motivo: `Sigiloso deve ser s ou n (veio "${ler("sigiloso")}")` });
      continue;
    }

    const colaboradores = ler("colaboradores")
      .split(/[|;,/]+/)
      .map((c) => c.trim())
      .filter(Boolean);

    vistos.add(cnj.digitos);
    validas.push({
      linha: numeroLinha,
      numero_cnj: cnj.digitos,
      numero_cnj_mascara: cnj.mascara,
      tribunal_sigla: cnj.tribunalSigla,
      cliente,
      cpf_cnpj: docDigitos || null,
      polo,
      parte_contraria: ler("parte_contraria") || null,
      comarca: ler("comarca") || null,
      responsavel: ler("responsavel") || null,
      colaboradores,
      sigiloso,
      observacoes: ler("observacoes") || null,
    });
  }

  return { separador, colunas, validas, rejeitadas };
}

export interface RelatorioImportacao {
  processosCriados: number;
  clientesCriados: number;
  processoIds: string[];
  rejeitadas: LinhaRejeitada[];
  avisos: string[];
}

interface ContextoImportacao {
  sessao: Sessao;
  membros: Membro[];
  comarcas: { id: string; nome: string }[];
  tribunalIdPorSigla: Map<string, string>;
}

function chaveNome(texto: string): string {
  return normalizarChave(texto).replace(/_/g, " ");
}

/**
 * Grava clientes, processos, partes e colaboradores com o cliente do usuário (as policies exigem
 * sócio, advogado ou administrativo). Processo já existente (UNIQUE escritorio_id, numero_cnj) vira rejeição.
 */
export async function importarCarteira(supabase: SupabaseClient, linhas: LinhaCarteira[], ctx: ContextoImportacao): Promise<RelatorioImportacao> {
  const { sessao } = ctx;
  const relatorio: RelatorioImportacao = { processosCriados: 0, clientesCriados: 0, processoIds: [], rejeitadas: [], avisos: [] };
  if (linhas.length === 0) return relatorio;

  // Processos já cadastrados
  const { data: existentes } = await supabase.from("processos").select("numero_cnj").eq("escritorio_id", sessao.escritorioId).in("numero_cnj", linhas.map((l) => l.numero_cnj));
  const jaExistem = new Set((existentes ?? []).map((p) => String(p.numero_cnj)));

  // Clientes já cadastrados (por documento e por nome)
  const { data: clientesAtuais } = await supabase.from("clientes").select("id, nome, cpf_cnpj").eq("escritorio_id", sessao.escritorioId);
  const clientePorDoc = new Map<string, string>();
  const clientePorNome = new Map<string, string>();
  for (const c of clientesAtuais ?? []) {
    if (c.cpf_cnpj) clientePorDoc.set(String(c.cpf_cnpj).replace(/\D/g, ""), c.id as string);
    clientePorNome.set(chaveNome(String(c.nome)), c.id as string);
  }
  const comarcaPorNome = new Map(ctx.comarcas.map((c) => [chaveNome(c.nome), c.id]));
  const podeSigilo = sessao.papel === "socio" || sessao.papel === "advogado";
  let avisouSigilo = false;

  for (const linha of linhas) {
    if (jaExistem.has(linha.numero_cnj)) {
      relatorio.rejeitadas.push({ linha: linha.linha, numero_cnj: linha.numero_cnj_mascara, motivo: "Processo já cadastrado na carteira" });
      continue;
    }

    // Cliente
    let clienteId = (linha.cpf_cnpj && clientePorDoc.get(linha.cpf_cnpj)) || clientePorNome.get(chaveNome(linha.cliente)) || null;
    if (!clienteId) {
      const { data: novo, error } = await supabase
        .from("clientes")
        .insert({ escritorio_id: sessao.escritorioId, nome: linha.cliente, cpf_cnpj: linha.cpf_cnpj, tipo_pessoa: linha.cpf_cnpj?.length === 14 ? "juridica" : "fisica", criado_por: sessao.usuarioId })
        .select("id")
        .single();
      if (error || !novo) {
        relatorio.rejeitadas.push({ linha: linha.linha, numero_cnj: linha.numero_cnj_mascara, motivo: `Não foi possível criar o cliente: ${error?.message ?? "erro desconhecido"}` });
        continue;
      }
      clienteId = novo.id as string;
      relatorio.clientesCriados += 1;
      if (linha.cpf_cnpj) clientePorDoc.set(linha.cpf_cnpj, clienteId);
      clientePorNome.set(chaveNome(linha.cliente), clienteId);
    }

    // Responsável e colaboradores
    let responsavelId: string | null = null;
    if (linha.responsavel) {
      const m = localizarMembro(ctx.membros, linha.responsavel);
      if (m?.usuario_id) responsavelId = m.usuario_id;
      else relatorio.avisos.push(`Linha ${linha.linha}: responsável "${linha.responsavel}" não encontrado na equipe; processo ficou sem responsável`);
    }
    const colaboradorIds = new Set<string>();
    for (const c of linha.colaboradores) {
      const m = localizarMembro(ctx.membros, c);
      if (m?.usuario_id && m.usuario_id !== responsavelId) colaboradorIds.add(m.usuario_id);
      else if (!m?.usuario_id) relatorio.avisos.push(`Linha ${linha.linha}: colaborador "${c}" não encontrado na equipe`);
    }

    // Comarca e tribunal
    let comarcaId: string | null = null;
    if (linha.comarca) {
      comarcaId = comarcaPorNome.get(chaveNome(linha.comarca)) ?? null;
      if (!comarcaId) relatorio.avisos.push(`Linha ${linha.linha}: comarca "${linha.comarca}" não encontrada; o DataJud pode preencher depois`);
    }
    const tribunalId = linha.tribunal_sigla ? (ctx.tribunalIdPorSigla.get(linha.tribunal_sigla) ?? null) : null;

    const { data: processo, error: erroProcesso } = await supabase
      .from("processos")
      .insert({
        escritorio_id: sessao.escritorioId,
        numero_cnj: linha.numero_cnj,
        tribunal_id: tribunalId,
        comarca_id: comarcaId,
        responsavel_id: responsavelId,
        observacoes: linha.observacoes,
        criado_por: sessao.usuarioId,
      })
      .select("id")
      .single();
    if (erroProcesso || !processo) {
      relatorio.rejeitadas.push({ linha: linha.linha, numero_cnj: linha.numero_cnj_mascara, motivo: `Não foi possível criar o processo: ${erroProcesso?.message ?? "erro desconhecido"}` });
      continue;
    }
    const processoId = processo.id as string;
    jaExistem.add(linha.numero_cnj);

    const partes: { escritorio_id: string; processo_id: string; nome: string; polo: PoloCsv; cliente_id: string | null; eh_cliente: boolean; documento: string | null; origem: string }[] = [
      { escritorio_id: sessao.escritorioId, processo_id: processoId, nome: linha.cliente, polo: linha.polo, cliente_id: clienteId, eh_cliente: true, documento: linha.cpf_cnpj, origem: "importacao" },
    ];
    if (linha.parte_contraria) {
      const poloContrario: PoloCsv = linha.polo === "ativo" ? "passivo" : linha.polo === "passivo" ? "ativo" : "outro";
      partes.push({ escritorio_id: sessao.escritorioId, processo_id: processoId, nome: linha.parte_contraria, polo: poloContrario, cliente_id: null, eh_cliente: false, documento: null, origem: "importacao" });
    }
    const { error: erroPartes } = await supabase.from("processo_partes").insert(partes);
    if (erroPartes) relatorio.avisos.push(`Linha ${linha.linha}: partes não gravadas (${erroPartes.message})`);

    if (colaboradorIds.size > 0) {
      const { error: erroColab } = await supabase.from("processo_colaboradores").insert([...colaboradorIds].map((usuario_id) => ({ escritorio_id: sessao.escritorioId, processo_id: processoId, usuario_id })));
      if (erroColab) relatorio.avisos.push(`Linha ${linha.linha}: colaboradores não gravados (${erroColab.message})`);
    }

    if (linha.sigiloso) {
      if (podeSigilo) {
        const { error: erroSigilo } = await supabase.rpc("marcar_sigilo", { p_processo_id: processoId, p_sigiloso: true });
        if (erroSigilo) relatorio.avisos.push(`Linha ${linha.linha}: não foi possível marcar sigilo (${erroSigilo.message})`);
      } else if (!avisouSigilo) {
        relatorio.avisos.push("Só advogado ou sócio marca sigilo: as linhas com sigiloso=s foram importadas sem a marcação");
        avisouSigilo = true;
      }
    }

    relatorio.processosCriados += 1;
    relatorio.processoIds.push(processoId);
  }

  return relatorio;
}
