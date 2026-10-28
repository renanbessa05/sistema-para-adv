import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adicionarDias, hojeNoFuso } from "@/lib/prazos";
import { envServidor } from "@/lib/config/env";
import { enviarEmail } from "../email";
import { carregarContexto, enfileirarEvento } from "../notificacoes";
import { executarJob, listarEscritoriosAtivos } from "./registro";

/** 9h: se não houve captação com sucesso hoje, avisa os sócios por e-mail e WhatsApp. */
export async function captacaoVigilante(admin: SupabaseClient, opcoes: { agora?: Date } = {}) {
  const resumo = [];
  for (const escritorio of await listarEscritoriosAtivos(admin)) {
    const r = await executarJob(
      admin,
      "captacao-vigilante",
      async () => {
        const ctx = await carregarContexto(admin, escritorio.id);
        const hoje = hojeNoFuso(ctx.timezone, opcoes.agora);
        const { data: ok } = await admin.from("captacoes").select("id").eq("escritorio_id", escritorio.id).in("status", ["ok", "parcial"]).gte("iniciada_em", `${hoje}T00:00:00-04:00`).limit(1);
        if (ok && ok.length) return { itens: 0, detalhes: { captacaoHoje: true } };
        const texto = `🚨 A captação do DJEN não rodou com sucesso hoje (${hoje}). Confira as rotinas em ${envServidor().APP_URL}/admin/status e, enquanto isso, verifique o PJe e os e-mails.`;
        const n = await enfileirarEvento(admin, ctx, { evento: "captacao_falhou", objeto: { tipo: "captacao", id: hoje }, variaveis: { "1": "captação do DJEN", "2": "0", "3": "sistema", "4": `${envServidor().APP_URL}/admin/status`, texto, assunto: "Captação do DJEN não rodou hoje", html: `<p>${texto}</p>` }, agora: opcoes.agora });
        return { itens: n, detalhes: { captacaoHoje: false } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}

/** 18h: CSV dos prazos dos próximos 60 dias no bucket `exportacoes` + e-mail aos sócios (plano B se o sistema cair). */
export async function exportarPrazos(admin: SupabaseClient, opcoes: { agora?: Date } = {}) {
  const resumo = [];
  for (const escritorio of await listarEscritoriosAtivos(admin)) {
    const r = await executarJob(
      admin,
      "exportar-prazos",
      async () => {
        const ctx = await carregarContexto(admin, escritorio.id);
        const hoje = hojeNoFuso(ctx.timezone, opcoes.agora);
        const { data: prazos, error } = await admin
          .from("prazos")
          .select("ato_descricao, status, data_final, data_interna, data_publicacao, responsavel_id, processos(numero_cnj_mascara)")
          .eq("escritorio_id", escritorio.id)
          .in("status", ["sugerido", "confirmado", "prorrogado", "suspenso", "vencido"])
          .gte("data_final", adicionarDias(hoje, -7))
          .lte("data_final", adicionarDias(hoje, 60))
          .order("data_final");
        if (error) throw new Error(error.message);
        const nomes = new Map(ctx.membros.map((m) => [m.id, m.nome]));
        const celula = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const linhas = [["processo", "ato", "status", "data_final", "data_interna", "data_publicacao", "responsavel"].join(";")];
        for (const p of prazos ?? []) {
          const proc = p.processos as unknown as { numero_cnj_mascara: string | null } | null;
          linhas.push([proc?.numero_cnj_mascara ?? "", p.ato_descricao, p.status, p.data_final, p.data_interna, p.data_publicacao, nomes.get(p.responsavel_id as string) ?? ""].map(celula).join(";"));
        }
        const csv = "﻿" + linhas.join("\r\n");
        const caminho = `${escritorio.id}/prazos-${hoje}.csv`;
        const { data: buckets } = await admin.storage.listBuckets();
        if (!buckets?.some((b) => b.name === "exportacoes")) await admin.storage.createBucket("exportacoes", { public: false });
        const { error: erroUpload } = await admin.storage.from("exportacoes").upload(caminho, Buffer.from(csv, "utf8"), { contentType: "text/csv; charset=utf-8", upsert: true });
        if (erroUpload) throw new Error(`upload: ${erroUpload.message}`);
        await admin.from("exportacoes").insert({ escritorio_id: escritorio.id, tipo: "prazos_csv", caminho_storage: caminho, linhas: linhas.length - 1 });
        const socios = ctx.membros.filter((m) => m.ativo && m.papel === "socio").map((m) => ctx.emails.get(m.id)).filter((e): e is string => Boolean(e));
        if (socios.length) {
          await enviarEmail({ para: socios, assunto: `Prazos exportados · ${hoje}`, html: `<p>Segue o CSV diário com ${linhas.length - 1} prazos dos próximos 60 dias. Guarde como plano B caso o sistema fique fora do ar.</p>`, anexos: [{ nome: `prazos-${hoje}.csv`, conteudoBase64: Buffer.from(csv, "utf8").toString("base64") }] });
        }
        return { itens: linhas.length - 1, detalhes: { caminho, emailsEnviados: socios.length } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}
