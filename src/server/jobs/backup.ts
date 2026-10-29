import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TABELAS_BACKUP, avaliarTamanhoBackup, caminhoBackup, montarPacoteBackup } from "@/lib/operacao/backup";
import { executarJob, listarEscritoriosAtivos } from "./registro";

const BUCKET = "exportacoes";
const PAGINA = 1000;
const HORAS_ATE_BACKUP_VENCIDO = 36;

/** Lê todas as linhas de um escritório, em páginas (o PostgREST corta em 1000 por consulta). */
async function lerTabelaDoEscritorio(admin: SupabaseClient, tabela: string, escritorioId: string): Promise<Record<string, unknown>[]> {
  const linhas: Record<string, unknown>[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await admin.from(tabela).select("*").eq("escritorio_id", escritorioId).order("id").range(de, de + PAGINA - 1);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    const lote = (data ?? []) as Record<string, unknown>[];
    linhas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return linhas;
}

/**
 * 06 UTC: snapshot das tabelas de negócio de cada escritório em backups/<escritorio>/ (bucket privado `exportacoes`).
 * Não apaga nada. O arquivo nunca sai do Supabase: a leitura é por URL assinada de curta duração (scripts/restaurar-tenant.ts).
 */
export async function backupTenant(admin: SupabaseClient, opcoes: { agora?: Date } = {}) {
  const resumo = [];
  for (const escritorio of await listarEscritoriosAtivos(admin)) {
    const r = await executarJob(
      admin,
      "backup-tenant",
      async () => {
        const geradoEm = opcoes.agora ?? new Date();
        const tabelas: Record<string, Record<string, unknown>[]> = {};
        for (const tabela of TABELAS_BACKUP) {
          tabelas[tabela] = await lerTabelaDoEscritorio(admin, tabela, escritorio.id);
        }
        const { conteudo, contagens, totalLinhas } = montarPacoteBackup({ escritorioId: escritorio.id, geradoEm, tabelas });
        const caminho = caminhoBackup(escritorio.id, geradoEm);
        const bytes = Buffer.from(conteudo, "utf8");
        const { error: erroUpload } = await admin.storage.from(BUCKET).upload(caminho, bytes, { contentType: "application/json; charset=utf-8", upsert: false });
        if (erroUpload) throw new Error(`upload: ${erroUpload.message}`);
        const { error: erroRegistro } = await admin.from("backups_tenant").insert({
          escritorio_id: escritorio.id,
          gerado_em: geradoEm.toISOString(),
          caminho_storage: caminho,
          tamanho_bytes: bytes.byteLength,
          contagens,
          status: "ok",
        });
        if (erroRegistro) throw new Error(`registro: ${erroRegistro.message}`);
        return { itens: totalLinhas, detalhes: { caminho, tamanhoBytes: bytes.byteLength, tabelas: Object.keys(contagens).length } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}

/**
 * Segunda 07 UTC: o último backup ok existe, é recente, está no Storage e tem tamanho razoável.
 * Falha (ok=false) aparece em jobs_execucoes e em /admin/status.
 */
export async function verificarBackup(admin: SupabaseClient, opcoes: { agora?: Date } = {}) {
  const agora = opcoes.agora ?? new Date();
  const resumo = [];
  for (const escritorio of await listarEscritoriosAtivos(admin)) {
    const r = await executarJob(
      admin,
      "verificar-backup",
      async () => {
        const { data: ultimos, error } = await admin
          .from("backups_tenant")
          .select("gerado_em, caminho_storage, tamanho_bytes, status")
          .eq("escritorio_id", escritorio.id)
          .order("gerado_em", { ascending: false })
          .limit(2);
        if (error) throw new Error(error.message);
        const [ultimo, anterior] = (ultimos ?? []) as { gerado_em: string; caminho_storage: string; tamanho_bytes: number; status: string }[];
        if (!ultimo) throw new Error("nenhum backup registrado");
        if (ultimo.status !== "ok") throw new Error("último backup terminou com erro");
        const idadeHoras = (agora.getTime() - new Date(ultimo.gerado_em).getTime()) / 3_600_000;
        if (idadeHoras > HORAS_ATE_BACKUP_VENCIDO) throw new Error(`último backup tem ${Math.floor(idadeHoras)} h`);
        const pasta = ultimo.caminho_storage.slice(0, ultimo.caminho_storage.lastIndexOf("/"));
        const nome = ultimo.caminho_storage.slice(ultimo.caminho_storage.lastIndexOf("/") + 1);
        const { data: arquivos, error: erroLista } = await admin.storage.from(BUCKET).list(pasta, { search: nome, limit: 5 });
        if (erroLista) throw new Error(`storage: ${erroLista.message}`);
        if (!arquivos?.some((a) => a.name === nome)) throw new Error("arquivo do último backup não está no Storage");
        const tamanho = avaliarTamanhoBackup(Number(ultimo.tamanho_bytes), anterior?.status === "ok" ? Number(anterior.tamanho_bytes) : null);
        if (!tamanho.ok) throw new Error(tamanho.motivo);
        return { itens: 1, detalhes: { caminho: ultimo.caminho_storage, tamanhoBytes: Number(ultimo.tamanho_bytes) } };
      },
      escritorio.id,
    );
    resumo.push({ escritorio: escritorio.nome, ...r });
  }
  return resumo;
}
