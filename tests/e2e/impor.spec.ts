import { randomInt, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { buatWorkbookUji, sheetPenjualanUji } from "../../src/server/impor/uji-bantu";
import { EMAIL_ADMIN_E2E, SANDI_ADMIN_E2E } from "./siapkan";

test("alur bahagia: admin mengunggah workbook kecil, meninjau, lalu mengaktifkan impor", async ({ page }) => {
  const tahun = randomInt(3000, 9000);
  const kode = `E2E${randomUUID().slice(0, 8).toUpperCase()}-GOR`;
  const workbook = buatWorkbookUji({
    "JUNI (S)": sheetPenjualanUji({
      toko: "PMS",
      bulan: 6,
      hari: [1, 2],
      produk: [{ kode, nama: "15ML GLITTER - E2E", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER", kuantitas: [3, 0] }],
    }),
    "MP PUSAT (S)": [["SALES"]],
  });

  await page.goto("/masuk");
  await page.getByLabel("Email").fill(EMAIL_ADMIN_E2E);
  await page.getByLabel("Kata sandi").fill(SANDI_ADMIN_E2E);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/masuk/);

  await page.goto("/admin/impor");
  await page.getByLabel("File Excel").setInputFiles({
    name: "penjualan-e2e.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: workbook,
  });
  await expect(page.getByRole("radio", { name: /MP PUSAT \(S\)/ })).toBeDisabled();
  await expect(page.getByText("di luar cakupan saat ini")).toBeVisible();
  await page.getByRole("radio", { name: "JUNI (S)" }).check();
  await page.getByLabel("Tahun impor").fill(String(tahun));
  await page.getByRole("combobox", { name: "Bulan impor" }).click();
  await page.getByRole("option", { name: "Juni" }).click();
  await page.getByRole("button", { name: "Unggah dan proses" }).click();

  await expect(page).toHaveURL(/\/admin\/impor\/\d+$/, { timeout: 30_000 });
  // Worker memproses di latar; halaman memuat ulang statusnya sendiri.
  await expect(page.locator('[data-status-impor="siap-ditinjau"]').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(`Juni ${tahun}`)).toBeVisible();

  const ringkasan = page.getByRole("table", { name: "Ringkasan per toko" });
  await expect(ringkasan.getByRole("cell", { name: "PMS", exact: true })).toBeVisible();
  await expect(page.getByText("0 error, 0 peringatan.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Produk baru" }).getByRole("cell", { name: kode })).toBeVisible();

  await page.getByRole("button", { name: "Aktifkan" }).click();
  await expect(page.getByText("Impor ini sekarang aktif.")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-status-impor="aktif"]').first()).toBeVisible();
});
