import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/server/db";
import { impor, user } from "../../src/server/db/schema";
import { aktifkanImpor } from "../../src/server/impor/impor";
import { buatWorkbookUji, imporUji, sheetPenjualanUji, tahunUjiBebas } from "../../src/server/impor/uji-bantu";
import { EMAIL_ADMIN_E2E, SANDI_ADMIN_E2E } from "./siapkan";

// T122 (DESIGN §11.8): filter Ringkasan di layar < 640 px lewat tombol "Filter (n)", cincin fokus chip produk, dan
// Kalender (grid tidak melebar di 1024–1440 px; di layar < 1024 px memilih tanggal menggulir ke Detail tanggal).

async function masuk(page: Page) {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(EMAIL_ADMIN_E2E);
  await page.getByLabel("Kata sandi").fill(SANDI_ADMIN_E2E);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/masuk/);
}

/** Satu impor aktif (diproses worker) berisi satu produk di toko PMS. */
async function imporAktif(tahun: number, kode: string) {
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, EMAIL_ADMIN_E2E));
  const namaSheet = "MARET (S)";
  const isi = buatWorkbookUji({
    [namaSheet]: sheetPenjualanUji({
      toko: "PMS",
      bulan: 3,
      hari: [1, 2, 3, 4, 5, 6, 7],
      produk: [{ kode, nama: "15ML GLITTER - E2E", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER", kuantitas: [1, 2, 3, 4, 5, 6, 7] }],
    }),
  });
  const id = await imporUji({ isi, namaSheet, tahunImpor: tahun, bulanImpor: 3, idPengguna: admin.id, proses: false });
  await expect
    .poll(async () => (await db.select({ status: impor.status }).from(impor).where(eq(impor.id, id)))[0]?.status, { timeout: 60_000 })
    .toBe("siap-ditinjau");
  expect(await aktifkanImpor(id, admin.id)).toEqual({ keadaan: "berhasil" });
}

/** Posisi vertikal di halaman (bukan di viewport). */
async function kotakHalaman(page: Page, selektor: string) {
  const kotak = (await page.locator(selektor).first().boundingBox())!;
  const gulir = await page.evaluate(() => window.scrollY);
  return { atas: kotak.y + gulir, bawah: kotak.y + kotak.height + gulir };
}

test("Ringkasan 375 px: tombol Filter (n) membuka panel; tabel langsung setelah kartu. Chip produk bercincin fokus", async ({ page }) => {
  const tahun = await tahunUjiBebas();
  const kode = `E2E${randomUUID().slice(0, 8).toUpperCase()}-GOR`;
  await imporAktif(tahun, kode);

  await masuk(page);
  await page.setViewportSize({ width: 375, height: 812 });
  const url = `/ringkasan?bulan=${tahun}-03&produk=${kode}`;
  const baris = page.locator(`tr[data-baris="PMS|${kode}"]`);
  await page.goto(url);
  await expect(async () => {
    await page.reload();
    await expect(baris).toBeVisible({ timeout: 1_000 });
    await expect(page.locator('[data-status-cache="terbaru"]')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 90_000 });

  // Form filter tidak tampil sebagai kartu; tombol "Filter (n)" dengan n = pilihan filter yang diterapkan (1 produk).
  const tombolFilter = page.getByRole("button", { name: "Filter (1)" });
  await expect(tombolFilter).toBeVisible();
  await expect(page.locator("[data-kartu-pilihan-ringkasan]")).toBeHidden();

  // Tabel berada tepat setelah kartu jumlah: tidak ada form filter panjang di antaranya.
  const kartu = await kotakHalaman(page, "[data-kartu-jumlah-ringkasan]");
  const tabel = await kotakHalaman(page, 'table[aria-label="Ringkasan per produk dan toko"]');
  expect(tabel.atas).toBeGreaterThan(kartu.bawah);
  expect(tabel.atas - kartu.bawah).toBeLessThan(64);
  // Layar pertama yang dimulai dari kartu jumlah sudah memuat awal tabel.
  await page.locator("[data-kartu-jumlah-ringkasan]").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(page.locator('table[aria-label="Ringkasan per produk dan toko"]')).toBeInViewport();

  // Panel filter: layar penuh, berisi form yang sama; Tutup mengembalikan fokus ke tombol.
  await tombolFilter.click();
  const panel = page.getByRole("dialog", { name: "Filter Ringkasan" });
  await expect(panel).toBeVisible();
  const kotakPanel = (await panel.boundingBox())!;
  expect(kotakPanel.width).toBeGreaterThanOrEqual(374);
  await expect(panel.getByRole("checkbox", { name: `Maret ${tahun}` })).toBeChecked();
  await expect(panel.getByRole("button", { name: "Terapkan" })).toBeVisible();
  await panel.getByRole("button", { name: "Tutup" }).click();
  await expect(panel).toHaveCount(0);
  await expect(tombolFilter).toBeFocused();

  // Layar lebar: kartu filter tampil, tombol tidak. Checkbox chip produk bercincin fokus saat difokus keyboard.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(tombolFilter).toBeHidden();
  const kartuPilihan = page.locator("[data-kartu-pilihan-ringkasan]");
  await expect(kartuPilihan).toBeVisible();
  await kartuPilihan.getByRole("searchbox", { name: "Cari kode atau nama produk" }).fill(kode.slice(0, 8).toLowerCase());
  // Produk terpilih (dari URL) berada sebelum hasil cari; Tab dari kotak cari memfokus checkbox pertamanya.
  await page.keyboard.press("Tab");
  const centang = kartuPilihan.getByRole("checkbox", { name: new RegExp(kode) });
  await expect(centang).toBeFocused();
  const bayangan = await centang.evaluate((el) => getComputedStyle(el.closest("label")!).boxShadow);
  expect(bayangan).not.toBe("none");
});

test("Kalender: grid tidak melebar keluar kolomnya di 1024–1440 px; di 375 px memilih tanggal menggulir ke Detail tanggal", async ({ page }) => {
  await masuk(page);

  for (const lebar of [1024, 1280, 1440]) {
    await page.setViewportSize({ width: lebar, height: 900 });
    await page.goto("/kalender?bulan=2026-05&tanggal=2026-05-20");
    await expect(page.locator('[data-detail-tanggal="2026-05-20"]')).toBeVisible();
    const wadahTabel = page.locator('[data-slot="table-container"]').first();
    const kisi = (await wadahTabel.boundingBox())!;
    const detail = (await page.locator("#detail-tanggal").boundingBox())!;
    const grid = (await page.locator("#detail-tanggal").locator("xpath=..").boundingBox())!;
    const isi = (await page.locator("main").boundingBox())!;
    // Kisi berada di kolomnya (tidak menimpa Detail tanggal) dan grid tidak melebar keluar wadah halaman.
    expect(kisi.x + kisi.width, `lebar ${lebar}`).toBeLessThanOrEqual(detail.x);
    expect(detail.x + detail.width, `lebar ${lebar}`).toBeLessThanOrEqual(grid.x + grid.width + 1);
    expect(grid.x + grid.width, `lebar ${lebar}`).toBeLessThanOrEqual(isi.x + isi.width + 1);
    expect(detail.x + detail.width, `lebar ${lebar}`).toBeLessThanOrEqual(lebar);
    // Tabel kisi muat di kolomnya: tidak lebih lebar dari wadahnya (tanpa gulir horizontal).
    const lebarKisi = await wadahTabel.evaluate((el) => ({ isi: el.scrollWidth, wadah: el.clientWidth }));
    expect(lebarKisi.isi, `lebar ${lebar}`).toBeLessThanOrEqual(lebarKisi.wadah);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `lebar ${lebar}`).toBe(true);
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/kalender?bulan=2026-05");
  await expect(page.getByText("Pilih tanggal pada kalender untuk melihat detailnya.")).toBeVisible();
  await page.locator('td[data-tanggal="2026-05-20"] a').click();
  await expect(page).toHaveURL(/tanggal=2026-05-20/);
  const detail = page.locator('[data-detail-tanggal="2026-05-20"]');
  await expect(detail).toBeVisible();
  await expect(detail).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});
