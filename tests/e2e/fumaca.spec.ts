import { expect, test } from "@playwright/test";

test("saúde responde com o estado do banco", async ({ request }) => {
  const r = await request.get("/api/health");
  expect([200, 503]).toContain(r.status());
  const corpo = await r.json();
  expect(corpo).toHaveProperty("db");
});

test("rotas de rotina exigem o segredo do cron", async ({ request }) => {
  const r = await request.get("/api/jobs/captar-djen");
  expect(r.status()).toBe(401);
});

test("página de login abre e tem o formulário", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Assistente Jurídica" })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByRole("button", { name: /Receber link/ })).toBeVisible();
});

test("painel sem sessão redireciona para o login", async ({ page }) => {
  await page.goto("/hoje");
  await expect(page).toHaveURL(/\/login\?voltar=%2Fhoje/);
});
