"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/server/sessao";
import { criarClienteServidor } from "@/lib/supabase/server";

const DESTINO = "/configuracoes/atendimento";
const HORARIO = /^\d{2}:\d{2}$/;

/** Salva envio, horário e dias do atendimento ao cliente. Só o sócio altera; o banco também exige a regra. */
export async function salvarRegrasAtendimento(fd: FormData) {
  const sessao = await exigirSessao();
  if (sessao.papel !== "socio") redirect(`${DESTINO}?erro=${encodeURIComponent("Só o sócio altera o atendimento ao cliente.")}`);

  const envio = fd.get("envio_ativo") === "on";
  const inicio = String(fd.get("horario_inicio") ?? "").trim();
  const fim = String(fd.get("horario_fim") ?? "").trim();
  const dias = [...new Set(fd.getAll("dias").map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort();

  if (inicio && !HORARIO.test(inicio)) redirect(`${DESTINO}?erro=${encodeURIComponent("Horário de início inválido.")}`);
  if (fim && !HORARIO.test(fim)) redirect(`${DESTINO}?erro=${encodeURIComponent("Horário de fim inválido.")}`);
  if ((inicio === "") !== (fim === "")) redirect(`${DESTINO}?erro=${encodeURIComponent("Informe início e fim, ou deixe os dois vazios.")}`);
  if (inicio && fim && inicio >= fim) redirect(`${DESTINO}?erro=${encodeURIComponent("O horário de início deve ser antes do fim.")}`);
  if (envio && (!inicio || dias.length === 0)) redirect(`${DESTINO}?erro=${encodeURIComponent("Para ligar o envio, informe horário e pelo menos um dia.")}`);

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("regras_atendimento").upsert(
    {
      escritorio_id: sessao.escritorioId,
      envio_ativo: envio,
      horario_inicio: inicio || null,
      horario_fim: fim || null,
      dias_semana: dias.length ? dias : null,
      atualizado_por: sessao.usuarioId,
    },
    { onConflict: "escritorio_id" },
  );
  if (error) redirect(`${DESTINO}?erro=${encodeURIComponent(`Não foi possível salvar: ${error.message}`)}`);
  revalidatePath(DESTINO);
  redirect(`${DESTINO}?ok=${encodeURIComponent(envio ? "Configuração salva. O envio ao cliente está LIGADO: cada resposta livre continua exigindo aprovação." : "Configuração salva. O envio ao cliente está desligado.")}`);
}
