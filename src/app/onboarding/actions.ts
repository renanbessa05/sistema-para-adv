"use server";

import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { validarEscritorio, validarResponsavel } from "@/lib/planos/onboarding";

function volta(mensagem: string): never {
  redirect(`/onboarding?erro=${encodeURIComponent(mensagem)}`);
}

/** Cria o primeiro escritório de quem ainda não tem vínculo. A RPC recusa se o cadastro estiver desligado no banco. */
export async function criarEscritorio(fd: FormData) {
  const dados = {
    nome: String(fd.get("nome") ?? ""),
    razaoSocial: String(fd.get("razao_social") ?? ""),
    cnpj: String(fd.get("cnpj") ?? ""),
    nomeCompleto: String(fd.get("nome_completo") ?? ""),
    oabNumero: String(fd.get("oab_numero") ?? ""),
    oabUf: String(fd.get("oab_uf") ?? ""),
  };
  const erro = validarEscritorio(dados) ?? validarResponsavel(dados);
  if (erro) volta(erro);

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("criar_escritorio", {
    p_nome: dados.nome.trim(),
    p_nome_completo: dados.nomeCompleto.trim(),
    p_razao_social: dados.razaoSocial.trim() || null,
    p_cnpj: dados.cnpj.trim() || null,
    p_oab_numero: dados.oabNumero.trim() || null,
    p_oab_uf: dados.oabUf.trim().toUpperCase() || null,
  });
  if (error) volta(error.message);

  // Renova o JWT para o hook gravar escritorio_id e papel do novo vínculo.
  await supabase.auth.refreshSession();
  redirect("/hoje");
}
