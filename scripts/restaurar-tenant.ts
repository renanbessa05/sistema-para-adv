/**
 * Restauração manual de um escritório a partir de backups/<escritorio>/ (bucket privado `exportacoes`).
 *
 *   pnpm exec tsx --env-file=.env.local scripts/restaurar-tenant.ts --escritorio <uuid> [--backup <caminho>]
 *
 * Padrão: --dry-run. Só lê o backup (URL assinada de 300 s), valida o pacote e compara as contagens com o banco.
 * Não grava nada. Não roda sozinho: é executado por uma pessoa do suporte, no runbook docs/runbooks/restauracao-por-tenant.md.
 * A restauração real NÃO está implementada neste lote (a confirmar): --executar é recusado.
 */
import { createClient } from "@supabase/supabase-js";
import { TABELAS_BACKUP, validarPacoteBackup } from "../src/lib/operacao/backup";

function lerArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const chave = a.slice(2);
    const proximo = argv[i + 1];
    if (proximo === undefined || proximo.startsWith("--")) {
      args[chave] = true;
    } else {
      args[chave] = proximo;
      i += 1;
    }
  }
  return args;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const args = lerArgs(process.argv.slice(2));
  const escritorio = typeof args.escritorio === "string" ? args.escritorio : "";
  if (!UUID.test(escritorio)) {
    console.error("Informe --escritorio <uuid do escritório>.");
    process.exit(1);
  }
  if (args.executar) {
    console.error("Restauração real não está implementada neste lote (a confirmar). Use apenas o dry-run e siga o runbook.");
    process.exit(2);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !chave) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
    process.exit(1);
  }
  const admin = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });

  let consulta = admin.from("backups_tenant").select("caminho_storage, gerado_em, tamanho_bytes").eq("escritorio_id", escritorio).eq("status", "ok");
  if (typeof args.backup === "string") consulta = consulta.eq("caminho_storage", args.backup);
  const { data: registros, error: erroRegistro } = await consulta.order("gerado_em", { ascending: false }).limit(1);
  if (erroRegistro) throw new Error(erroRegistro.message);
  const registro = registros?.[0];
  if (!registro) {
    console.error("Nenhum backup ok encontrado para este escritório.");
    process.exit(1);
  }
  console.log(`Backup: ${registro.caminho_storage} (gerado em ${registro.gerado_em}, ${registro.tamanho_bytes} bytes)`);

  const { data: assinada, error: erroAssinatura } = await admin.storage.from("exportacoes").createSignedUrl(registro.caminho_storage, 300);
  if (erroAssinatura || !assinada) throw new Error(`URL assinada: ${erroAssinatura?.message ?? "sem URL"}`);
  const resposta = await fetch(assinada.signedUrl);
  if (!resposta.ok) throw new Error(`download falhou: HTTP ${resposta.status}`);
  const validacao = validarPacoteBackup(await resposta.text(), escritorio);
  if (!validacao.ok) {
    console.error(`Pacote inválido: ${validacao.motivo}`);
    process.exit(1);
  }

  console.log("\nTabela                 backup   banco agora");
  for (const tabela of TABELAS_BACKUP) {
    const noBackup = validacao.pacote.tabelas[tabela]?.length ?? 0;
    const { count, error } = await admin.from(tabela).select("id", { count: "exact", head: true }).eq("escritorio_id", escritorio);
    const agora = error ? `erro: ${error.message}` : String(count ?? 0);
    console.log(`${tabela.padEnd(22)} ${String(noBackup).padStart(7)}   ${agora}`);
  }
  console.log("\nDry-run: nada foi gravado. Restauração real não implementada neste lote (a confirmar).");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
