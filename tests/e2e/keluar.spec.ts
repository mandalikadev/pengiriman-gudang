import { expect, test } from "@playwright/test";

import { EMAIL_ADMIN_E2E, SANDI_ADMIN_E2E } from "./siapkan";

test("keluar: sesi berakhir dan halaman yang diproteksi diarahkan ke halaman masuk", async ({ page, context }) => {
  await page.goto("/masuk");
  await expect(page.getByRole("button", { name: "Keluar" })).toHaveCount(0);

  await page.getByLabel("Email").fill(EMAIL_ADMIN_E2E);
  await page.getByLabel("Kata sandi").fill(SANDI_ADMIN_E2E);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/masuk/);
  const cookieSesi = (await context.cookies()).filter((c) => c.name.includes("session_token"));
  expect(cookieSesi.length).toBeGreaterThan(0);

  // Dengan keyboard: fokus ke tombol, lalu Enter.
  const tombolKeluar = page.getByRole("button", { name: "Keluar" });
  await tombolKeluar.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/masuk$/);
  await expect(page.getByRole("button", { name: "Keluar" })).toHaveCount(0);

  await page.goto("/admin/impor");
  await expect(page).toHaveURL(/\/masuk$/);

  // Cookie sesi lama dipasang lagi: server sudah mencabut sesinya, jadi tetap diarahkan ke halaman masuk.
  await context.addCookies(cookieSesi);
  await page.goto("/admin/impor");
  await expect(page).toHaveURL(/\/masuk$/);
});
