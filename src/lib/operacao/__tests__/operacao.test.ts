import { describe, expect, it } from "vitest";
import { TAMANHO_MINIMO_BACKUP_BYTES, avaliarTamanhoBackup, caminhoBackup, montarPacoteBackup, validarPacoteBackup } from "../backup";
import { avaliarRotinas, limiteHorasRotina, ROTINAS_MONITORADAS } from "../rotinas";
import { sanitizarEventoSentry, sentryAtivo } from "../sentry";

const ESC = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";
const AGORA = new Date("2026-10-29T06:00:00Z");

describe("backup por tenant", () => {
  it("caminho fica em backups/<escritorio>/ e sem dois-pontos", () => {
    const c = caminhoBackup(ESC, AGORA);
    expect(c).toBe(`backups/${ESC}/2026-10-29T06-00-00-000Z.json`);
    expect(c).not.toContain(":");
  });

  it("monta o pacote com contagens e valida o round-trip", () => {
    const { conteudo, contagens, totalLinhas } = montarPacoteBackup({
      escritorioId: ESC,
      geradoEm: AGORA,
      tabelas: { prazos: [{ id: "p1", escritorio_id: ESC }], clientes: [] },
    });
    expect(contagens).toEqual({ prazos: 1, clientes: 0 });
    expect(totalLinhas).toBe(1);
    const v = validarPacoteBackup(conteudo, ESC);
    expect(v.ok).toBe(true);
  });

  it("recusa pacote de outro escritório, linha alheia e JSON inválido", () => {
    const outro = montarPacoteBackup({ escritorioId: OUTRO, geradoEm: AGORA, tabelas: {} }).conteudo;
    expect(validarPacoteBackup(outro, ESC)).toMatchObject({ ok: false, motivo: "pacote pertence a outro escritório" });
    const linhaAlheia = montarPacoteBackup({ escritorioId: ESC, geradoEm: AGORA, tabelas: { prazos: [{ escritorio_id: OUTRO }] } }).conteudo;
    expect(validarPacoteBackup(linhaAlheia, ESC)).toMatchObject({ ok: false });
    expect(validarPacoteBackup("não é json", ESC)).toMatchObject({ ok: false, motivo: "arquivo não é JSON válido" });
    expect(validarPacoteBackup("null", ESC)).toMatchObject({ ok: false });
  });

  it("recusa versão desconhecida e tabela que não é lista", () => {
    expect(validarPacoteBackup(JSON.stringify({ versao: 9, escritorio_id: ESC, tabelas: {} }))).toMatchObject({ ok: false });
    expect(validarPacoteBackup(JSON.stringify({ versao: 1, escritorio_id: ESC, tabelas: { prazos: {} } }))).toMatchObject({ ok: false });
    expect(validarPacoteBackup(JSON.stringify({ versao: 1, escritorio_id: ESC, tabelas: { prazos: [1] } }))).toMatchObject({ ok: false });
    expect(validarPacoteBackup(JSON.stringify({ versao: 1, tabelas: {} }))).toMatchObject({ ok: false, motivo: "pacote sem escritorio_id" });
  });

  it("avalia tamanho: abaixo do mínimo falha; queda a menos da metade falha", () => {
    expect(avaliarTamanhoBackup(TAMANHO_MINIMO_BACKUP_BYTES - 1, null).ok).toBe(false);
    expect(avaliarTamanhoBackup(1000, 3000).ok).toBe(false);
    expect(avaliarTamanhoBackup(1600, 3000).ok).toBe(true);
    expect(avaliarTamanhoBackup(500, null).ok).toBe(true);
  });
});

describe("alerta de rotina sem execução", () => {
  const h = (horas: number) => new Date(AGORA.getTime() - horas * 3_600_000);

  it("diária: alerta depois de 24 h; weekly tem 8 dias; dias úteis têm 96 h", () => {
    expect(limiteHorasRotina("backup-tenant")).toBe(24);
    expect(limiteHorasRotina("verificar-backup")).toBe(192);
    expect(limiteHorasRotina("captar-djen")).toBe(96);
    const alertas = avaliarRotinas(
      [
        { rotina: "backup-tenant", ultimoInicio: h(23) },
        { rotina: "backup-tenant-x", ultimoInicio: h(25) },
        { rotina: "captar-djen", ultimoInicio: h(60) },
        { rotina: "verificar-backup", ultimoInicio: h(100) },
        { rotina: "marcar-vencidos", ultimoInicio: null },
      ],
      AGORA,
    );
    expect(alertas.map((a) => [a.rotina, a.motivo])).toEqual([
      ["backup-tenant-x", "atrasada"],
      ["marcar-vencidos", "nunca_executou"],
    ]);
  });

  it("a lista monitorada inclui as rotinas de backup", () => {
    expect(ROTINAS_MONITORADAS).toContain("backup-tenant");
    expect(ROTINAS_MONITORADAS).toContain("verificar-backup");
  });
});

describe("sanitização do Sentry", () => {
  it("sem DSN a integração fica desligada", () => {
    expect(sentryAtivo(undefined)).toBe(false);
    expect(sentryAtivo("  ")).toBe(false);
    expect(sentryAtivo("https://chave@o0.ingest.sentry.io/1")).toBe(true);
    expect(sanitizarEventoSentry({ level: "error" }, undefined)).toBeNull();
  });

  it("remove request, usuário, extra, breadcrumbs e mensagem; mantém só o tipo do erro", () => {
    const limpo = sanitizarEventoSentry(
      {
        level: "error",
        message: "Processo 0001234-56.2026.8.11.0001 do cliente Fulano",
        request: { url: "/processos/abc", data: "corpo" },
        user: { email: "cliente@exemplo.com" },
        extra: { texto: "conteúdo" },
        breadcrumbs: [{ message: "x" }],
        contexts: { ctx: {} },
        exception: { values: [{ type: "TypeError", value: "Fulano de Tal", stacktrace: {} }] },
      },
      "https://chave@o0.ingest.sentry.io/1",
    );
    expect(limpo).not.toBeNull();
    const texto = JSON.stringify(limpo);
    expect(texto).not.toContain("Fulano");
    expect(texto).not.toContain("cliente@exemplo.com");
    expect(texto).not.toContain("0001234");
    expect(limpo?.exception).toEqual({ values: [{ type: "TypeError" }] });
  });
});
