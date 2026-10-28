"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { podeEditarProcesso } from "@/server/processos";

function texto(fd: FormData, nome: string): string {
  const v = fd.get(nome);
  return typeof v === "string" ? v.trim() : "";
}
function opcional(fd: FormData, nome: string): string | null {
  return texto(fd, nome) || null;
}
function falhar(destino: string, mensagem: string): never {
  redirect(`${destino}?erro=${encodeURIComponent(mensagem)}`);
}

const esquema = z.object({
  tipo_pessoa: z.enum(["fisica", "juridica"]),
  nome: z.string().min(2, "Informe o nome"),
  cpf_cnpj: z
    .string()
    .nullable()
    .refine((v) => v === null || v.length === 11 || v.length === 14, "CPF precisa ter 11 dígitos e CNPJ, 14"),
  email: z.string().email("E-mail inválido").nullable(),
  telefone_e164: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, "Telefone no formato internacional, ex.: +5565999990000")
    .nullable(),
  endereco: z.object({ logradouro: z.string().nullable(), numero: z.string().nullable(), complemento: z.string().nullable(), bairro: z.string().nullable(), cidade: z.string().nullable(), uf: z.string().nullable(), cep: z.string().nullable() }),
  observacoes: z.string().nullable(),
  ativo: z.boolean(),
});

function lerFormulario(fd: FormData) {
  const telefone = texto(fd, "telefone_e164").replace(/[^\d+]/g, "");
  return esquema.safeParse({
    tipo_pessoa: texto(fd, "tipo_pessoa") || "fisica",
    nome: texto(fd, "nome"),
    cpf_cnpj: texto(fd, "cpf_cnpj").replace(/\D/g, "") || null,
    email: opcional(fd, "email")?.toLowerCase() ?? null,
    telefone_e164: telefone ? (telefone.startsWith("+") ? telefone : `+55${telefone}`) : null,
    endereco: {
      logradouro: opcional(fd, "logradouro"),
      numero: opcional(fd, "numero"),
      complemento: opcional(fd, "complemento"),
      bairro: opcional(fd, "bairro"),
      cidade: opcional(fd, "cidade"),
      uf: opcional(fd, "uf")?.toUpperCase().slice(0, 2) ?? null,
      cep: texto(fd, "cep").replace(/\D/g, "") || null,
    },
    observacoes: opcional(fd, "observacoes"),
    ativo: fd.get("ativo") !== "0",
  });
}

export async function criarCliente(fd: FormData) {
  const sessao = await exigirSessao();
  if (!podeEditarProcesso(sessao.papel)) falhar("/clientes", "Seu papel não cadastra cliente.");
  const lido = lerFormulario(fd);
  if (!lido.success) falhar("/clientes/novo", lido.error.issues[0]?.message ?? "Dados inválidos");
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("clientes")
    .insert({ escritorio_id: sessao.escritorioId, ...lido.data, criado_por: sessao.usuarioId })
    .select("id")
    .single();
  if (error || !data) falhar("/clientes/novo", /clientes_documento_unq|duplicate/i.test(error?.message ?? "") ? "Já existe cliente com este CPF/CNPJ." : `Não foi possível salvar: ${error?.message ?? "erro"}`);
  revalidatePath("/clientes");
  const voltar = texto(fd, "voltar");
  if (voltar.startsWith("/processos/novo")) redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}cliente=${data.id}`);
  redirect(`/clientes/${data.id}?ok=${encodeURIComponent("Cliente cadastrado.")}`);
}

export async function atualizarCliente(clienteId: string, fd: FormData) {
  const sessao = await exigirSessao();
  const destino = `/clientes/${clienteId}`;
  if (!podeEditarProcesso(sessao.papel)) falhar(destino, "Seu papel não edita cliente.");
  const lido = lerFormulario(fd);
  if (!lido.success) falhar(destino, lido.error.issues[0]?.message ?? "Dados inválidos");
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("clientes").update(lido.data).eq("id", clienteId).eq("escritorio_id", sessao.escritorioId);
  if (error) falhar(destino, /clientes_documento_unq|duplicate/i.test(error.message) ? "Já existe outro cliente com este CPF/CNPJ." : `Não foi possível salvar: ${error.message}`);
  revalidatePath(destino);
  revalidatePath("/clientes");
  redirect(`${destino}?ok=${encodeURIComponent("Dados salvos.")}`);
}
