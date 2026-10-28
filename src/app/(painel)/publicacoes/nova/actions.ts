"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { extrairDigitosCnj, validarDigitosCnj } from "@/lib/cnj/numero-cnj";
import type { ClassificacaoPublicacao } from "@/lib/ia/schemas/classificacao";
import { TIPOS_PUBLICACAO } from "@/lib/ia/schemas/classificacao";
import { exigirSessao } from "@/server/sessao";
import { sugerirPrazo } from "@/server/prazos";
import { mensagemErroBanco } from "@/server/publicacoes";

const DataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

const Schema = z
  .object({
    fonte: z.enum(["pje_manual", "email_manual"]),
    processo_id: z.union([z.uuid(), z.literal("")]).default(""),
    numero_cnj: z.string().trim().max(40).default(""),
    tipo_data: z.enum(["disponibilizacao", "ciencia"]),
    data: DataISO,
    tipo: z.enum(TIPOS_PUBLICACAO),
    orgao: z.string().trim().max(200).default(""),
    texto: z.string().trim().max(50_000).default(""),
    gera_prazo: z.boolean(),
    ato_id: z.union([z.uuid(), z.literal("")]).default(""),
    ato_descricao: z.string().trim().max(120).default(""),
    dias: z.coerce.number().int().positive().max(3650).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.gera_prazo) {
      if (!v.processo_id && !v.numero_cnj) ctx.addIssue({ code: "custom", message: "Para sugerir prazo, informe o processo.", path: ["processo_id"] });
      if (v.tipo_data !== "disponibilizacao") ctx.addIssue({ code: "custom", message: "Para sugerir prazo, informe a data de disponibilização (o motor conta a partir dela).", path: ["tipo_data"] });
      if (!v.ato_id && !v.ato_descricao) ctx.addIssue({ code: "custom", message: "Informe o ato a praticar.", path: ["ato_descricao"] });
      if (!v.ato_id && !v.dias) ctx.addIssue({ code: "custom", message: "Informe a quantidade de dias.", path: ["dias"] });
    }
  });

function voltarComErro(msg: string): never {
  redirect(`/publicacoes/nova?erro=${encodeURIComponent(msg)}`);
}

/**
 * Lançamento manual (PJe, e-mail). Insere com o cliente do usuário (policy: sócio, advogado, administrativo; status 'nova').
 * Depois tenta as transições pela RPC (classificada → vinculada/sem_processo → com_prazo_sugerido/sem_prazo) e,
 * se "gera prazo", cria o prazo sugerido com `sugerirPrazo` (service role, filtrado pelo escritório da sessão).
 */
export async function lancarPublicacaoManual(fd: FormData) {
  const sessao = await exigirSessao();
  const bruto = {
    fonte: fd.get("fonte"),
    processo_id: fd.get("processo_id") ?? "",
    numero_cnj: fd.get("numero_cnj") ?? "",
    tipo_data: fd.get("tipo_data"),
    data: fd.get("data"),
    tipo: fd.get("tipo"),
    orgao: fd.get("orgao") ?? "",
    texto: fd.get("texto") ?? "",
    gera_prazo: fd.get("gera_prazo") === "on",
    ato_id: fd.get("ato_id") ?? "",
    ato_descricao: fd.get("ato_descricao") ?? "",
    dias: fd.get("dias") ? fd.get("dias") : undefined,
  };
  const parsed = Schema.safeParse(bruto);
  if (!parsed.success) voltarComErro(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const v = parsed.data;

  const supabase = await criarClienteServidor();

  // Processo: pelo select ou pelo número CNJ (só processos da carteira; RLS limita ao escritório)
  let processoId: string | null = v.processo_id || null;
  let digitos: string | null = null;
  if (v.numero_cnj) {
    digitos = extrairDigitosCnj(v.numero_cnj);
    if (!digitos || !validarDigitosCnj(digitos)) voltarComErro("Número CNJ inválido. Confira os 20 dígitos.");
  }
  if (!processoId && digitos) {
    const { data } = await supabase.from("processos").select("id").eq("numero_cnj", digitos).maybeSingle();
    processoId = (data?.id as string | undefined) ?? null;
  }
  if (processoId && !digitos) {
    const { data } = await supabase.from("processos").select("numero_cnj").eq("id", processoId).maybeSingle();
    digitos = (data?.numero_cnj as string | undefined) ?? null;
  }
  if (v.gera_prazo && !processoId) voltarComErro("Para sugerir prazo o processo precisa estar na carteira. Cadastre-o antes ou lance sem prazo.");

  // Ato: do cadastro (nome e dias) ou livre
  let ato: { id: string | null; nome: string; dias: number } | null = null;
  if (v.gera_prazo) {
    if (v.ato_id) {
      const { data } = await supabase.from("atos_prazo").select("id, nome, dias").eq("id", v.ato_id).maybeSingle();
      if (!data) voltarComErro("Ato não encontrado.");
      ato = { id: data.id as string, nome: data.nome as string, dias: v.dias ?? (data.dias as number) };
    } else {
      ato = { id: null, nome: v.ato_descricao, dias: v.dias as number };
    }
  }

  const resumo = v.gera_prazo && ato ? `Lançamento manual (${v.fonte === "pje_manual" ? "PJe" : "e-mail"}): ${ato.nome}, ${ato.dias} dia(s).` : `Lançamento manual (${v.fonte === "pje_manual" ? "PJe" : "e-mail"}).`;

  const { data: inserida, error } = await supabase
    .from("publicacoes")
    .insert({
      escritorio_id: sessao.escritorioId,
      fonte: v.fonte,
      numero_cnj: digitos,
      numero_processo_texto: v.numero_cnj || null,
      processo_id: processoId,
      vinculo_tipo: processoId ? "manual" : null,
      tipo: v.tipo,
      tipo_classificado_por: "humano",
      orgao: v.orgao || null,
      meio: v.fonte === "pje_manual" ? "PJe" : "e-mail",
      data_disponibilizacao: v.tipo_data === "disponibilizacao" ? v.data : null,
      data_publicacao: v.tipo_data === "ciencia" ? v.data : null,
      texto: v.texto || null,
      resumo_ia: resumo,
      status: "nova",
    })
    .select("id")
    .single();
  if (error || !inserida) voltarComErro(mensagemErroBanco(error, "Não foi possível gravar a publicação."));
  const publicacaoId = inserida.id as string;

  const avisos: string[] = [];

  // Prazo sugerido (service role, só com escritório da sessão)
  let prazoId: string | null = null;
  if (v.gera_prazo && processoId && ato) {
    const classificacao: ClassificacaoPublicacao = {
      tipo: v.tipo,
      gera_prazo: true,
      ato: ato.nome,
      dias_sugeridos: ato.dias,
      contagem: "dias_uteis",
      dobro: false,
      numero_cnj: digitos,
      partes: [],
      advogados_destinatarios: [],
      sugere_sigilo: false,
      resumo_simples: resumo,
      confianca: 1,
      observacoes: "lançamento manual pelo painel",
    };
    try {
      const admin = criarClienteAdmin();
      const sugerido = await sugerirPrazo(admin, { id: publicacaoId, escritorio_id: sessao.escritorioId, processo_id: processoId, data_disponibilizacao: v.data }, classificacao);
      if (sugerido) {
        prazoId = sugerido.prazoId;
        // sugerirPrazo grava origem 'publicacao_djen'; corrige para a fonte manual (sempre filtrando pelo escritório)
        await admin.from("prazos").update({ origem: v.fonte, criado_por: sessao.usuarioId, ato_id: ato.id ?? undefined }).eq("id", prazoId).eq("escritorio_id", sessao.escritorioId);
      } else {
        avisos.push("O motor não sugeriu prazo (faltou data de disponibilização).");
      }
    } catch (e) {
      avisos.push(`Publicação gravada, mas o prazo não foi sugerido: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Transições pela RPC: nova → classificada → vinculada | sem_processo → com_prazo_sugerido | sem_prazo.
  // Administrativo não pode classificar (a RPC recusa): a publicação fica em 'nova' para a rotina de classificação.
  if (sessao.papel === "socio" || sessao.papel === "advogado") {
    const passos: { para: string; dados: Record<string, unknown> }[] = [{ para: "classificada", dados: { tipo: v.tipo, tipo_classificado_por: "humano", resumo_ia: resumo } }];
    if (processoId) {
      passos.push({ para: "vinculada", dados: { processo_id: processoId, vinculo_tipo: "manual" } });
      if (prazoId) passos.push({ para: "com_prazo_sugerido", dados: { prazo_id: prazoId } });
      else if (!v.gera_prazo) passos.push({ para: "sem_prazo", dados: { motivo: "lançamento manual sem prazo" } });
    } else {
      passos.push({ para: "sem_processo", dados: {} });
    }
    for (const passo of passos) {
      const { error: erroRpc } = await supabase.rpc("transicionar_publicacao", { p_id: publicacaoId, p_para: passo.para, p_dados: passo.dados });
      if (erroRpc) {
        avisos.push(`Publicação gravada, mas parou em «${passo.para}»: ${mensagemErroBanco(erroRpc)}`);
        break;
      }
    }
  }

  revalidatePath("/publicacoes");
  revalidatePath("/prazos");
  revalidatePath("/hoje");
  const q = new URLSearchParams();
  if (avisos.length) q.set("erro", avisos.join(" "));
  else q.set("ok", prazoId ? "Publicação lançada e prazo sugerido para confirmação." : "Publicação lançada.");
  redirect(`/publicacoes/${publicacaoId}?${q.toString()}`);
}
