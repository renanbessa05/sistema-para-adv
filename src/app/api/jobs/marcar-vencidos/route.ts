import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { hojeNoFuso } from "@/lib/prazos";
import { autorizarCron } from "@/server/jobs/protecao";
import { executarJob, listarEscritoriosAtivos } from "@/server/jobs/registro";


/** 0h05 de Cuiabá: prazos confirmados ou prorrogados com data final anterior a hoje viram `vencido`. */
export async function GET(request: Request) {
  const negado = autorizarCron(request);
  if (negado) return negado;
  const admin = criarClienteAdmin();
  const resultado = [];
  for (const escritorio of await listarEscritoriosAtivos(admin)) {
    const r = await executarJob(
      admin,
      "marcar-vencidos",
      async () => {
        const hoje = hojeNoFuso(escritorio.timezone);
        const { data, error } = await admin.rpc("marcar_prazos_vencidos", { p_hoje: hoje });
        if (error) throw new Error(error.message);
        return { itens: Number(data ?? 0), detalhes: { hoje } };
      },
      escritorio.id,
    );
    resultado.push({ escritorio: escritorio.nome, ...r });
  }
  return NextResponse.json({ rotina: "marcar-vencidos", escritorios: resultado });
}
