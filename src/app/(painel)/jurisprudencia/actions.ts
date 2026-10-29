"use server";

import { redirect } from "next/navigation";
import { exigirSessao } from "@/server/sessao";
import { ErroJurisprudencia, importarJurisprudencia } from "@/server/jurisprudencia";

export async function importarJurisprudenciaAction(fd: FormData) {
  const sessao = await exigirSessao();
  const formato = fd.get("formato") === "json" ? "json" : "csv";
  const bruto = fd.get("conteudo");
  const conteudo = typeof bruto === "string" ? bruto : "";
  let mensagem: string;
  try {
    const r = await importarJurisprudencia(sessao, formato, conteudo);
    mensagem = `${r.registros} registro(s) importado(s), ${r.trechos} trecho(s) para busca. Os embeddings entram no próximo ciclo do job.`;
  } catch (e) {
    redirect(`/jurisprudencia/importar?erro=${encodeURIComponent(e instanceof ErroJurisprudencia ? e.message : "Falha ao importar.")}`);
  }
  redirect(`/jurisprudencia/importar?ok=${encodeURIComponent(mensagem)}`);
}
