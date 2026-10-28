"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

const DESTINO = "/configuracoes/escritorio";

const esquema = z.object({
  nome: z.string().min(2, "Informe o nome do escritório"),
  razao_social: z.string().nullable(),
  cnpj: z
    .string()
    .nullable()
    .refine((v) => v === null || v.length === 14, "CNPJ precisa ter 14 dígitos"),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Fuso horário inválido (use um nome IANA, ex.: America/Cuiaba)"),
  horario_resumo: z.string().regex(/^\d{2}:\d{2}$/, "Horário no formato HH:MM"),
  dias_seguranca_padrao: z.coerce.number().int().min(0, "Dias de segurança não podem ser negativos").max(30),
  semana_inclui_proxima_segunda: z.boolean(),
});

export async function salvarEscritorio(fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect(`${DESTINO}?erro=${encodeURIComponent("Só o sócio altera o escritório.")}`);
  const t = (n: string) => (typeof fd.get(n) === "string" ? String(fd.get(n)).trim() : "");
  const lido = esquema.safeParse({
    nome: t("nome"),
    razao_social: t("razao_social") || null,
    cnpj: t("cnpj").replace(/\D/g, "") || null,
    timezone: t("timezone") || "America/Cuiaba",
    horario_resumo: t("horario_resumo") || "07:30",
    dias_seguranca_padrao: t("dias_seguranca_padrao") || "2",
    semana_inclui_proxima_segunda: fd.get("semana_inclui_proxima_segunda") === "on",
  });
  if (!lido.success) redirect(`${DESTINO}?erro=${encodeURIComponent(lido.error.issues[0]?.message ?? "Dados inválidos")}`);
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("escritorios").update(lido.data).eq("id", sessao.escritorioId);
  if (error) redirect(`${DESTINO}?erro=${encodeURIComponent(/unique|duplicate/i.test(error.message) ? "Este CNPJ já está em uso por outro escritório." : `Não foi possível salvar: ${error.message}`)}`);
  revalidatePath(DESTINO);
  revalidatePath("/hoje");
  redirect(`${DESTINO}?ok=${encodeURIComponent("Configurações salvas.")}`);
}
