import type { SupabaseClient } from "@supabase/supabase-js";

export type Linha = Record<string, unknown>;

/**
 * Admin falso para testar jobs sem banco: filtros eq/in/lt/lte/not-in, embeds já materializados na linha,
 * inserts/updates/upserts registrados. Só o que os jobs usam; não é um Postgres.
 */
export function criarAdminFalso(banco: Record<string, Linha[]>) {
  const escritas = { inserts: [] as { tabela: string; linha: Linha }[], updates: [] as { tabela: string; patch: Linha }[], upserts: [] as { tabela: string; linha: Linha }[] };
  let seq = 1;

  const consulta = (tabela: string) => {
    const filtros: ((l: Linha) => boolean)[] = [];
    let patch: Linha | null = null;
    let inserir: Linha | null = null;
    let upsert: Linha | null = null;
    const resolver = () => {
      if (inserir) {
        const nova = { id: `id-${seq++}`, ...inserir };
        (banco[tabela] ??= []).push(nova);
        escritas.inserts.push({ tabela, linha: nova });
        return { data: nova, error: null, count: null };
      }
      if (upsert) {
        escritas.upserts.push({ tabela, linha: upsert });
        return { data: null, error: null, count: null };
      }
      const linhas = (banco[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
      if (patch) {
        for (const l of linhas) Object.assign(l, patch);
        escritas.updates.push({ tabela, patch });
        return { data: null, error: null, count: null };
      }
      return { data: linhas, error: null, count: linhas.length };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      order: () => q,
      limit: () => q,
      gte: () => q,
      is: () => q,
      eq: (c: string, v: unknown) => {
        filtros.push((l) => l[c] === v);
        return q;
      },
      in: (c: string, valores: unknown[]) => {
        filtros.push((l) => valores.includes(l[c]));
        return q;
      },
      lt: (c: string, v: string) => {
        filtros.push((l) => l[c] != null && String(l[c]) < v);
        return q;
      },
      lte: (c: string, v: string) => {
        filtros.push((l) => l[c] != null && String(l[c]) <= v);
        return q;
      },
      not: (c: string, op: string, v: string) => {
        if (op === "in") {
          const lista = v.replace(/^\(|\)$/g, "").split(",");
          filtros.push((l) => !lista.includes(String(l[c])));
        } else if (op === "is") {
          filtros.push((l) => l[c] != null);
        }
        return q;
      },
      insert: (linha: Linha) => {
        inserir = linha;
        return q;
      },
      upsert: (linha: Linha) => {
        upsert = linha;
        return q;
      },
      update: (p: Linha) => {
        patch = p;
        return q;
      },
      maybeSingle: async () => {
        const r = resolver();
        return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data };
      },
      single: async () => {
        const r = resolver();
        return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data };
      },
      then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, ko),
    };
    return q;
  };

  const admin = { from: (tabela: string) => consulta(tabela), schema: () => ({ from: (tabela: string) => consulta(tabela) }) };
  return { admin: admin as unknown as SupabaseClient, banco, escritas };
}
