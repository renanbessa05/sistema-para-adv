import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { montarCnj } from "../../src/lib/cnj/numero-cnj";
import { subirBancoDeTeste, type BancoDeTeste } from "./harness";

/**
 * Migration 0025 (documentos e páginas), contra docs/regras/permissoes.md "Documentos":
 * 1. documento de outro escritório é invisível; estagiário não vê documento de processo sigiloso em que não atua;
 * 2. estagiário não envia documento; administrativo envia; só advogado/sócio remove;
 * 3. documento_registrar_acesso grava auditoria e recusa sigiloso para quem não pode ver;
 * 4. páginas seguem o sigilo do documento; busca por tsvector funciona em português.
 */
describe("documentos", () => {
  let db: BancoDeTeste;
  const escritorioA = "11111111-1111-4111-8111-111111111111";
  const escritorioB = "22222222-2222-4222-8222-222222222222";
  const socioA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const advogadoA = "abababab-abab-4bab-8bab-abababababab";
  const estagiarioA = "acacacac-acac-4cac-8cac-acacacacacac";
  const adminA = "aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae";
  const socioB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const comoSocioA = { sub: socioA, escritorio_id: escritorioA, papel: "socio" };
  const comoAdvogadoA = { sub: advogadoA, escritorio_id: escritorioA, papel: "advogado" };
  const comoEstagiarioA = { sub: estagiarioA, escritorio_id: escritorioA, papel: "estagiario" };
  const comoAdminA = { sub: adminA, escritorio_id: escritorioA, papel: "administrativo" };
  const comoSocioB = { sub: socioB, escritorio_id: escritorioB, papel: "socio" };

  let processoAberto: string;
  let processoSigiloso: string;
  let docAberto: string;
  let docSigiloso: string;

  const comoServiceRole = async <T>(fn: (c: Client) => Promise<T>): Promise<T> => {
    const c = db.client;
    await c.query("begin");
    try {
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
      await c.query("set local role service_role");
      const r = await fn(c);
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  };

  const inserirDocumento = (escritorio: string, processo: string | null, nome: string) =>
    comoServiceRole(async (c) => {
      const r = await c.query(
        `insert into public.documentos (escritorio_id, processo_id, tipo, nome, caminho, mime, tamanho, hash_sha256, origem)
         values ($1, $2, 'autos', $3, $4, 'application/pdf', 1234, md5($3), 'upload')
         returning id`,
        [escritorio, processo, nome, `${escritorio}/${processo ?? "geral"}/${crypto.randomUUID()}.pdf`],
      );
      return r.rows[0].id as string;
    });

  beforeAll(async () => {
    db = await subirBancoDeTeste();
    const c = db.client;
    for (const [id, email] of [
      [socioA, "socio.a@teste.local"],
      [advogadoA, "adv.a@teste.local"],
      [estagiarioA, "est.a@teste.local"],
      [adminA, "adm.a@teste.local"],
      [socioB, "socio.b@teste.local"],
    ]) {
      await c.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
    }
    await c.query("insert into public.escritorios (id, nome) values ($1, 'Escritório A'), ($2, 'Escritório B')", [escritorioA, escritorioB]);
    await c.query(
      `insert into public.escritorio_membros (escritorio_id, usuario_id, email_convite, papel, nome_completo, oab_numero, oab_uf, aceito_em)
       values ($1, $2, 'socio.a@teste.local', 'socio', 'Sócia A', '20817', 'MT', now()),
              ($1, $3, 'adv.a@teste.local', 'advogado', 'Advogado A', '30000', 'MT', now()),
              ($1, $4, 'est.a@teste.local', 'estagiario', 'Estagiário A', null, null, now()),
              ($1, $5, 'adm.a@teste.local', 'administrativo', 'Administrativo A', null, null, now()),
              ($6, $7, 'socio.b@teste.local', 'socio', 'Sócio B', '40000', 'MT', now())`,
      [escritorioA, socioA, advogadoA, estagiarioA, adminA, escritorioB, socioB],
    );
    const procs = await c.query(
      `insert into public.processos (escritorio_id, numero_cnj, responsavel_id, segredo_justica)
       values ($1, $2, $3, false), ($1, $4, $3, true)
       returning id, segredo_justica`,
      [escritorioA, montarCnj(100, 2025, 8, "11", "0041"), advogadoA, montarCnj(101, 2025, 8, "11", "0041")],
    );
    processoAberto = procs.rows.find((r) => !r.segredo_justica)!.id as string;
    processoSigiloso = procs.rows.find((r) => r.segredo_justica)!.id as string;
    docAberto = await inserirDocumento(escritorioA, processoAberto, "autos-abertos.pdf");
    docSigiloso = await inserirDocumento(escritorioA, processoSigiloso, "autos-sigilosos.pdf");
    await inserirDocumento(escritorioB, null, "do-escritorio-b.pdf");
    await comoServiceRole(async (c) => {
      await c.query("insert into public.documento_paginas (escritorio_id, documento_id, numero, texto) values ($1, $2, 1, 'A autora foi intimada para apresentar contestação no prazo legal'), ($1, $2, 2, 'Certidão de publicação'), ($1, $3, 1, 'texto sigiloso')", [escritorioA, docAberto, docSigiloso]);
    });
  }, 240_000);

  afterAll(async () => {
    await db?.parar();
  });

  it("isola por escritório e aplica o sigilo do processo ao documento e às páginas", async () => {
    const nomesSocioA = await db.comoUsuario(comoSocioA, async (c) => (await c.query("select nome from public.documentos order by nome")).rows.map((r) => r.nome));
    expect(nomesSocioA).toEqual(["autos-abertos.pdf", "autos-sigilosos.pdf"]);
    const nomesEstagiario = await db.comoUsuario(comoEstagiarioA, async (c) => (await c.query("select nome from public.documentos order by nome")).rows.map((r) => r.nome));
    expect(nomesEstagiario).toEqual(["autos-abertos.pdf"]);
    const paginasEstagiario = await db.comoUsuario(comoEstagiarioA, async (c) => (await c.query("select documento_id from public.documento_paginas")).rows.map((r) => r.documento_id));
    expect(paginasEstagiario.every((d) => d === docAberto)).toBe(true);
    const nomesB = await db.comoUsuario(comoSocioB, async (c) => (await c.query("select nome from public.documentos")).rows.map((r) => r.nome));
    expect(nomesB).toEqual(["do-escritorio-b.pdf"]);
  });

  it("estagiário não envia documento; administrativo envia; só advogado ou sócio remove", async () => {
    const inserir = (claims: Record<string, unknown>) =>
      db.comoUsuario(claims, async (c) => {
        const r = await c.query(
          `insert into public.documentos (escritorio_id, processo_id, tipo, nome, caminho, mime, tamanho, hash_sha256)
           values ($1, $2, 'anexo', 'novo.pdf', $3, 'application/pdf', 10, md5(random()::text)) returning id`,
          [escritorioA, processoAberto, `${escritorioA}/x/${crypto.randomUUID()}.pdf`],
        );
        return r.rows[0].id as string;
      });
    await expect(inserir(comoEstagiarioA)).rejects.toThrow(/row-level security/);
    const idAdmin = await inserir(comoAdminA);
    expect(idAdmin).toBeTruthy();
    const apagadosPeloAdmin = await db.comoUsuario(comoAdminA, async (c) => (await c.query("delete from public.documentos where id = $1", [idAdmin])).rowCount);
    expect(apagadosPeloAdmin).toBe(0);
    const apagadosPeloAdvogado = await db.comoUsuario(comoAdvogadoA, async (c) => (await c.query("delete from public.documentos where id = $1", [idAdmin])).rowCount);
    expect(apagadosPeloAdvogado).toBe(1);
  });

  it("registra o acesso em auditoria e recusa sigiloso para quem não pode ver", async () => {
    await db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.documento_registrar_acesso($1)", [docAberto]));
    await expect(db.comoUsuario(comoEstagiarioA, (c) => c.query("select public.documento_registrar_acesso($1)", [docSigiloso]))).rejects.toThrow(/sigiloso|não encontrado/);
    await db.comoUsuario(comoAdvogadoA, (c) => c.query("select public.documento_registrar_acesso($1)", [docSigiloso]));
    const auditoria = await comoServiceRole(async (c) => (await c.query("select usuario_id, objeto_id, acao::text as acao from public.auditoria_acessos where objeto_tipo = 'documento' order by criado_em")).rows);
    expect(auditoria).toEqual([
      expect.objectContaining({ usuario_id: estagiarioA, objeto_id: docAberto, acao: "baixou" }),
      expect.objectContaining({ usuario_id: advogadoA, objeto_id: docSigiloso, acao: "baixou" }),
    ]);
  });

  it("busca o texto das páginas em português", async () => {
    const achados = await db.comoUsuario(comoSocioA, async (c) =>
      (await c.query("select documento_id, numero from public.documento_paginas where tsv @@ plainto_tsquery('portuguese', 'contestação')")).rows,
    );
    expect(achados).toEqual([{ documento_id: docAberto, numero: 1 }]);
  });
});
