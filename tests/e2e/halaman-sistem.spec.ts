import { expect, test, type Page } from "@playwright/test";

import { buatPenggunaUji, sandiUji } from "../../src/server/auth/uji-bantu";
import { EMAIL_ADMIN_E2E, SANDI_ADMIN_E2E } from "./siapkan";

// T120 (DESIGN §11.7, ADR-0010): URL tidak dikenal dan halaman tanpa hak menampilkan halaman "Halaman tidak ditemukan"
// berbahasa Indonesia, bertema terang, di dalam kerangka aplikasi (sidebar tetap), dengan tautan ke Beranda.

async function masuk(page: Page, email: string, sandi: string) {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill(sandi);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/masuk/);
}

async function harapkanHalamanTidakDitemukan(page: Page, url: string) {
  // Kode HTTP tidak diperiksa: dengan kerangka memuat (loading.tsx) halaman di-stream, sehingga notFound() di dalam
  // halaman menghasilkan 200 + meta noindex (perilaku Next.js), bukan 404.
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1, name: "Halaman tidak ditemukan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kembali ke Beranda" })).toHaveAttribute("href", "/");
  // Kerangka aplikasi tetap: tombol Keluar di sidebar.
  await expect(page.getByRole("button", { name: "Keluar" }).first()).toBeAttached();
  // Tema terang: latar halaman token `background` (#FDFCF8), teks token `foreground` (#2C2C24).
  const warna = await page.evaluate(() => {
    const gaya = getComputedStyle(document.body);
    return { latar: gaya.backgroundColor, teks: gaya.color };
  });
  expect(warna).toEqual({ latar: "rgb(253, 252, 248)", teks: "rgb(44, 44, 36)" });
}

test("URL tidak dikenal → halaman tidak ditemukan Indonesia, terang, dengan tautan ke Beranda", async ({ page }) => {
  await masuk(page, EMAIL_ADMIN_E2E, SANDI_ADMIN_E2E);
  await harapkanHalamanTidakDitemukan(page, "/halaman-yang-tidak-ada");
  await harapkanHalamanTidakDitemukan(page, "/admin/impor/999999999");

  await page.getByRole("link", { name: "Kembali ke Beranda" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("halaman tanpa hak (viewer membuka halaman admin) → halaman tidak ditemukan yang sama", async ({ page }) => {
  const viewer = await buatPenggunaUji("viewer");
  await masuk(page, viewer.email, sandiUji);
  await harapkanHalamanTidakDitemukan(page, "/admin/impor");
});
