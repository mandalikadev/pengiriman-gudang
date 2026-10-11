import { randomInt, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/server/db";
import { impor, user } from "../../src/server/db/schema";
import { aktifkanImpor } from "../../src/server/impor/impor";
import { buatWorkbookUji, imporUji, sheetPenjualanUji } from "../../src/server/impor/uji-bantu";
import { EMAIL_ADMIN_E2E, SANDI_ADMIN_E2E } from "./siapkan";

/** Impor satu sheet lewat lapisan server; worker memprosesnya, lalu impor diaktifkan (worker menghitung cache). */
async function imporAktif(
  idAdmin: string,
  namaSheet: string,
  tahun: number,
  bulan: number,
  kode: string,
  kuantitas: number[],
  { kategori = "15ML GLITTER/LEATHER", lain = [] }: { kategori?: string; lain?: { kode: string; kategori: string; kuantitas: number[] }[] } = {},
) {
  const isi = buatWorkbookUji({
    [namaSheet]: sheetPenjualanUji({
      toko: "PMS",
      bulan,
      hari: kuantitas.map((_, i) => i + 1),
      produk: [
        { kode, nama: "15ML GLITTER - E2E", ukuran: "15ML", kategori, kuantitas },
        ...lain.map((p) => ({ ...p, nama: "15ML GLITTER - E2E", ukuran: "15ML" })),
      ],
    }),
  });
  const id = await imporUji({ isi, namaSheet, tahunImpor: tahun, bulanImpor: bulan, idPengguna: idAdmin, proses: false });
  await expect
    .poll(async () => (await db.select({ status: impor.status }).from(impor).where(eq(impor.id, id)))[0]?.status, { timeout: 60_000 })
    .toBe("siap-ditinjau");
  expect(await aktifkanImpor(id, idAdmin)).toEqual({ keadaan: "berhasil" });
}

const KATEGORI_HARI = ["Senin–Kamis", "Jumat", "Sabtu", "Minggu"] as const;

/** Angka 4 kartu jumlah Ringkasan (T80), urut kategori hari. */
async function angkaKartu(page: import("@playwright/test").Page) {
  return Promise.all(
    KATEGORI_HARI.map(async (kategori) => Number(await page.locator(`[data-kartu-kategori="${kategori}"]`).getAttribute("data-jumlah"))),
  );
}

/** Rata-rata Ringkasan satu baris tabel per kategori hari; tidak tersedia = 0 (tidak menambah jumlah kartu). */
async function nilaiBaris(baris: import("@playwright/test").Locator) {
  return Promise.all(
    KATEGORI_HARI.map(async (kategori) => Number((await baris.locator(`td[data-kategori="${kategori}"]`).getAttribute("data-nilai")) ?? 0)),
  );
}

async function masuk(page: import("@playwright/test").Page) {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(EMAIL_ADMIN_E2E);
  await page.getByLabel("Kata sandi").fill(SANDI_ADMIN_E2E);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/masuk/);
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

  // Sidebar (T78): satu tautan per halaman, tanpa duplikat menu tarik. Kelompok Laporan dibuka dulu (T81).
  const navigasi = page.getByRole("navigation", { name: "Navigasi utama" });
  const laporan = navigasi.getByRole("button", { name: "Laporan" });
  if ((await laporan.getAttribute("aria-expanded")) !== "true") await laporan.click();
  await expect(laporan).toHaveAttribute("aria-expanded", "true");
  await navigasi.getByRole("link", { name: "Ringkasan" }).click();
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
  // T80: tahun acak → satu-satunya baris pada periode ini; kartu = Rata-rata Ringkasan baris itu.
  await expect(page.getByText("Baris 1–1 dari 1")).toBeVisible();
  const kartuMaretJuni = await angkaKartu(page);
  expect(kartuMaretJuni).toEqual(await nilaiBaris(baris));

  // Mengubah pilihan tanpa Terapkan tidak mengubah hasil, periode, kartu, maupun URL.
  const url = page.url();
  await page.getByRole("checkbox", { name: `Juni ${tahun}` }).uncheck();
  await expect(page.getByText("1 bulan dipilih.")).toBeVisible();
  await expect(periode).toContainText(`Juni ${tahun} (2 bulan)`);
  await expect(totalMentah).toHaveText("42");
  expect(await angkaKartu(page)).toEqual(kartuMaretJuni);
  expect(page.url()).toBe(url);

  // Setelah Terapkan, hasil dan kartu mengikuti pilihan baru.
  await page.getByRole("button", { name: "Terapkan" }).click();
  await expect(periode).toContainText(`Periode aktif: Maret ${tahun} (1 bulan)`);
  await expect(totalMentah).toHaveText("28");
  const kartuMaret = await angkaKartu(page);
  expect(kartuMaret).toEqual(await nilaiBaris(baris));
  // Jumat, Sabtu, dan Minggu Maret bernilai berbeda-beda (1–7), Juni semuanya 2: kartu pasti berubah.
  expect(kartuMaret).not.toEqual(kartuMaretJuni);
});

test("Ringkasan: filter kategori produk dan produk berlaku setelah Terapkan, tersimpan di URL, dan bisa dikosongkan", async ({ page }) => {
  const tahun = randomInt(3000, 9000);
  const akhiran = randomUUID().slice(0, 8).toUpperCase();
  const [k1, k2] = [`E2EA${akhiran}-GOR`, `E2EB${akhiran}-GOR`];
  const kategoriX = `KAT X E2E ${akhiran}`;
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, EMAIL_ADMIN_E2E));
  await imporAktif(admin.id, "MARET (S)", tahun, 3, k1, [1, 1], {
    kategori: kategoriX,
    lain: [{ kode: k2, kategori: `KAT Y E2E ${akhiran}`, kuantitas: [2, 2] }],
  });

  await masuk(page);
  await page.goto(`/ringkasan?bulan=${tahun}-03`);
  const baris1 = page.locator(`tr[data-baris="PMS|${k1}"]`);
  const baris2 = page.locator(`tr[data-baris="PMS|${k2}"]`);
  await expect(async () => {
    await page.reload();
    await expect(baris2).toBeVisible({ timeout: 1_000 });
    await expect(page.locator('[data-status-cache="terbaru"]')).toBeVisible({ timeout: 1_000 });
    await expect(page.getByRole("checkbox", { name: kategoriX })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 90_000 });
  await expect(baris1).toBeVisible();

  // Mencentang kategori tanpa Terapkan tidak mengubah hasil maupun URL.
  const url = page.url();
  await page.getByRole("checkbox", { name: kategoriX }).check();
  await expect(baris2).toBeVisible();
  expect(page.url()).toBe(url);
  await expect(page.getByRole("status", { name: "Filter aktif" })).toContainText("semua toko, kategori produk, dan produk");

  await page.getByRole("button", { name: "Terapkan" }).click();
  await expect(page).toHaveURL(new RegExp(`kategoriProduk=${encodeURIComponent(kategoriX).replace(/%20/g, "\\+")}`));
  await expect(page.getByRole("status", { name: "Filter aktif" })).toContainText(`Kategori produk: ${kategoriX}`);
  await expect(baris1).toBeVisible();
  await expect(baris2).toHaveCount(0);

  // Kosongkan filter → semua baris kembali, periode tetap.
  await page.getByRole("link", { name: "Kosongkan filter" }).click();
  await expect(page).toHaveURL(new RegExp(`/ringkasan\\?bulan=${tahun}-03$`));
  await expect(baris2).toBeVisible();

  // Cari produk (teks biasa pada kode), centang, lalu Terapkan.
  await page.getByRole("searchbox", { name: "Cari kode atau nama produk" }).fill(`e2eb${akhiran}`.toLowerCase());
  await page.getByRole("checkbox", { name: k2 }).check();
  await expect(baris1).toBeVisible();
  await page.getByRole("button", { name: "Terapkan" }).click();
  await expect(page).toHaveURL(new RegExp(`produk=${k2}`));
  await expect(baris1).toHaveCount(0);
  await expect(baris2).toBeVisible();
});
