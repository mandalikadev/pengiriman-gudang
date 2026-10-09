import { randomInt, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/server/db";
import { impor, user } from "../../src/server/db/schema";
import { aktifkanImpor } from "../../src/server/impor/impor";
import { buatWorkbookUji, imporUji, sheetPenjualanUji } from "../../src/server/impor/uji-bantu";
import { EMAIL_ADMIN_E2E, SANDI_ADMIN_E2E } from "./siapkan";

/** Impor satu sheet lewat lapisan server; worker memprosesnya, lalu impor diaktifkan (worker menghitung cache). */
async function imporAktif(idAdmin: string, namaSheet: string, tahun: number, bulan: number, kode: string, kuantitas: number[]) {
  const isi = buatWorkbookUji({
    [namaSheet]: sheetPenjualanUji({
      toko: "PMS",
      bulan,
      hari: kuantitas.map((_, i) => i + 1),
      produk: [{ kode, nama: "15ML GLITTER - E2E", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER", kuantitas }],
    }),
  });
  const id = await imporUji({ isi, namaSheet, tahunImpor: tahun, bulanImpor: bulan, idPengguna: idAdmin, proses: false });
  await expect
    .poll(async () => (await db.select({ status: impor.status }).from(impor).where(eq(impor.id, id)))[0]?.status, { timeout: 60_000 })
    .toBe("siap-ditinjau");
  expect(await aktifkanImpor(id, idAdmin)).toEqual({ keadaan: "berhasil" });
}

test("Ringkasan: pilih bulan → Terapkan → periode aktif tampil; mengubah pilihan tanpa Terapkan tidak mengubah hasil", async ({ page }) => {
  const tahun = randomInt(3000, 9000);
  const kode = `E2E${randomUUID().slice(0, 8).toUpperCase()}-GOR`;
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, EMAIL_ADMIN_E2E));
  await imporAktif(admin.id, "MARET (S)", tahun, 3, kode, [1, 2, 3, 4, 5, 6, 7]);
  await imporAktif(admin.id, "JUNI (S)", tahun, 6, kode, [2, 2, 2, 2, 2, 2, 2]);

  await page.goto("/masuk");
  await page.getByLabel("Email").fill(EMAIL_ADMIN_E2E);
  await page.getByLabel("Kata sandi").fill(SANDI_ADMIN_E2E);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/masuk/);

  await page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("link", { name: "Ringkasan" }).first().click();
  await expect(page).toHaveURL(/\/ringkasan$/);
  await expect(page.getByRole("heading", { name: "Ringkasan", level: 1 })).toBeVisible();

  // Worker menghitung cache di latar; bulan baru tersedia setelah perhitungan selesai.
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("checkbox", { name: `Maret ${tahun}` })).toBeVisible({ timeout: 1_000 });
    await expect(page.locator('[data-status-cache="terbaru"]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 90_000 });
  await expect(page.getByText("Belum ada periode yang diterapkan")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);

  // Maret dan Juni (tidak berurutan) → Terapkan.
  await page.getByRole("checkbox", { name: `Maret ${tahun}` }).check();
  await page.getByRole("checkbox", { name: `Juni ${tahun}` }).check();
  // Belum diterapkan: hasil belum berubah.
  await expect(page.getByText("Belum ada periode yang diterapkan")).toBeVisible();
  await page.getByRole("button", { name: "Terapkan" }).click();

  await expect(page).toHaveURL(new RegExp(`bulan=${tahun}-03&bulan=${tahun}-06`));
  const periode = page.getByRole("status", { name: "Periode aktif" });
  await expect(periode).toContainText(`Periode aktif: Maret ${tahun}, Juni ${tahun} (2 bulan)`);
  const baris = page.locator(`tr[data-baris="PMS|${kode}"]`);
  await expect(baris).toBeVisible();
  const totalMentah = baris.locator("[data-total-mentah]");
  await expect(totalMentah).toHaveText("42");

  // Mengubah pilihan tanpa Terapkan tidak mengubah hasil, periode, maupun URL.
  const url = page.url();
  await page.getByRole("checkbox", { name: `Juni ${tahun}` }).uncheck();
  await expect(page.getByText("1 bulan dipilih.")).toBeVisible();
  await expect(periode).toContainText(`Juni ${tahun} (2 bulan)`);
  await expect(totalMentah).toHaveText("42");
  expect(page.url()).toBe(url);

  // Setelah Terapkan, hasil mengikuti pilihan baru.
  await page.getByRole("button", { name: "Terapkan" }).click();
  await expect(periode).toContainText(`Periode aktif: Maret ${tahun} (1 bulan)`);
  await expect(totalMentah).toHaveText("28");
});
