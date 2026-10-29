import { describe, expect, it } from "vitest";
import { criarEventoAgenda, montarEventoAgenda, URL_AGENDA } from "../agenda";
import { trocarCodigo, urlAutorizacao, URL_TOKEN } from "../oauth";

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

describe("Google Agenda", () => {
  it("monta o evento com duração padrão de 60 minutos e local quando houver", () => {
    const inicio = new Date("2026-11-03T18:30:00Z");
    const e = montarEventoAgenda({ tipo: "instrução", inicio, processo: "0001234-56.2025.8.11.0041", modalidade: "virtual", localOuLink: "https://meet.example/abc", tz: "America/Cuiaba" });
    expect(e.start).toEqual({ dateTime: "2026-11-03T18:30:00.000Z", timeZone: "America/Cuiaba" });
    expect(e.end.dateTime).toBe("2026-11-03T19:30:00.000Z");
    expect(e.location).toBe("https://meet.example/abc");
    expect(e.summary).toContain("instrução");
  });

  it("sem local, o evento não traz o campo; duração pode ser informada", () => {
    const e = montarEventoAgenda({ tipo: "una", inicio: new Date("2026-11-03T18:30:00Z"), duracaoMin: 90, processo: "x", modalidade: "presencial", localOuLink: null, tz: "America/Cuiaba" });
    expect(e.location).toBeUndefined();
    expect(e.end.dateTime).toBe("2026-11-03T20:00:00.000Z");
  });

  it("cria o evento e devolve o id do Google", async () => {
    let url = "";
    let auth = "";
    const f = (async (u: string | URL | Request, init?: RequestInit) => {
      url = String(u);
      auth = (init?.headers as Record<string, string>).Authorization;
      return resposta({ id: "evt_1" });
    }) as typeof fetch;
    const id = await criarEventoAgenda(f, "tok", "primary", montarEventoAgenda({ tipo: "una", inicio: new Date(0), processo: "p", modalidade: "virtual", localOuLink: null, tz: "UTC" }));
    expect(id).toBe("evt_1");
    expect(url).toBe(`${URL_AGENDA}/calendars/primary/events`);
    expect(auth).toBe("Bearer tok");
  });

  it("recusa resposta de erro e resposta sem id", async () => {
    const e = montarEventoAgenda({ tipo: "una", inicio: new Date(0), processo: "p", modalidade: "virtual", localOuLink: null, tz: "UTC" });
    await expect(criarEventoAgenda((async () => resposta({}, 403)) as typeof fetch, "t", "c", e)).rejects.toThrow(/403/);
    await expect(criarEventoAgenda((async () => resposta({})) as typeof fetch, "t", "c", e)).rejects.toThrow(/sem|id do evento/);
  });
});

describe("Google OAuth", () => {
  it("monta a URL de consentimento com escopos, acesso offline e state", () => {
    const url = new URL(urlAutorizacao({ clientId: "cid", redirectUri: "https://app/cb", state: "st" }));
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("scope")).toContain("calendar.events");
    expect(url.searchParams.get("scope")).toContain("drive.file");
  });

  it("troca o código por token e calcula a validade", async () => {
    const agora = new Date("2026-11-03T12:00:00Z");
    let corpoEnviado = "";
    const f = (async (u: string | URL | Request, init?: RequestInit) => {
      expect(String(u)).toBe(URL_TOKEN);
      corpoEnviado = String(init?.body);
      return resposta({ access_token: "at", refresh_token: "rt", expires_in: 3600 });
    }) as typeof fetch;
    const t = await trocarCodigo(f, { clientId: "c", clientSecret: "s", redirectUri: "r", code: "x", agora });
    expect(t).toEqual({ accessToken: "at", refreshToken: "rt", expiraEm: new Date("2026-11-03T13:00:00Z") });
    expect(new URLSearchParams(corpoEnviado).get("grant_type")).toBe("authorization_code");
  });

  it("sem refresh_token devolve null; erro e resposta incompleta são recusados", async () => {
    const semRefresh = (async () => resposta({ access_token: "at", expires_in: 60 })) as typeof fetch;
    expect((await trocarCodigo(semRefresh, { clientId: "c", clientSecret: "s", redirectUri: "r", code: "x" })).refreshToken).toBeNull();
    await expect(trocarCodigo((async () => resposta({}, 400)) as typeof fetch, { clientId: "c", clientSecret: "s", redirectUri: "r", code: "x" })).rejects.toThrow(/400/);
    await expect(trocarCodigo((async () => resposta({ access_token: "at" })) as typeof fetch, { clientId: "c", clientSecret: "s", redirectUri: "r", code: "x" })).rejects.toThrow(/sem access_token/);
  });
});
