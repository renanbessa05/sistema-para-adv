import { expect, test } from "@playwright/test";

test("a tela da assistente exige sessão", async ({ page }) => {
  await page.goto("/assistente");
  await expect(page).toHaveURL(/\/login\?voltar=%2Fassistente/);
});

test("a rota de chat recusa sem sessão", async ({ request }) => {
  const r = await request.post("/api/assistente/00000000-0000-4000-8000-000000000000", { data: { texto: "oi" }, maxRedirects: 0 });
  expect([401, 302, 307]).toContain(r.status());
});
