import { criarClienteAdmin } from "@/lib/supabase/admin";
import { ROTINAS_MONITORADAS, avaliarRotinas, type UltimaExecucaoRotina } from "@/lib/operacao/rotinas";

export const metadata = { title: "Status do sistema" };
export const dynamic = "force-dynamic";

/**
 * Página pública: só saúde agregada (banco e rotinas, somando todos os escritórios).
 * Não mostra nome de escritório, processo, cliente nem contagem por tenant.
 */
export default async function PaginaStatusPublico() {
  const admin = criarClienteAdmin();
  const agora = new Date();

  let bancoOk = true;
  try {
    const { error } = await admin.schema("ref").from("tribunais").select("sigla").limit(1);
    if (error) bancoOk = false;
  } catch {
    bancoOk = false;
  }

  const ultimas: UltimaExecucaoRotina[] = await Promise.all(
    ROTINAS_MONITORADAS.map(async (rotina) => {
      const { data } = await admin.from("jobs_execucoes").select("iniciado_em").eq("job", rotina).order("iniciado_em", { ascending: false }).limit(1);
      const iniciado = (data?.[0]?.iniciado_em as string | undefined) ?? null;
      return { rotina, ultimoInicio: iniciado ? new Date(iniciado) : null };
    }),
  );
  const alertas = avaliarRotinas(ultimas, agora);
  const rotinasEmDia = ROTINAS_MONITORADAS.length - alertas.length;
  const operando = bancoOk && alertas.length === 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-marca-900">Status do sistema</h1>
        <p className="text-sm text-neutral-600">Saúde geral, sem dados de clientes ou processos.</p>
      </header>

      <section className={`rounded-md border px-4 py-3 text-sm ${operando ? "border-green-300 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
        {operando ? "Sistema operando normalmente." : "Sistema com alguma instabilidade. A equipe já foi avisada pelos canais internos."}
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between border-b py-2">
          <span>Banco de dados</span>
          <span className={bancoOk ? "text-green-700" : "text-red-700"}>{bancoOk ? "operando" : "indisponível"}</span>
        </div>
        <div className="flex justify-between border-b py-2">
          <span>Rotinas automáticas em dia</span>
          <span>
            {rotinasEmDia} de {ROTINAS_MONITORADAS.length}
          </span>
        </div>
      </section>

      <p className="text-xs text-neutral-500">Atualizado em {agora.toISOString().slice(0, 16).replace("T", " ")} UTC.</p>
    </main>
  );
}
