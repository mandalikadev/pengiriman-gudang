import { expect, test, type Page } from "@playwright/test";

import { tanggalWib } from "../../src/app/admin/impor/format";
import { geserHari, namaHari } from "../../src/domain/kalender";
import { buatPenggunaUji, sandiUji } from "../../src/server/auth/uji-bantu";
import { db } from "../../src/server/db";
import { hubunganTokoGudang, jadwalToko } from "../../src/server/db/schema";
import { tugaskanOperator } from "../../src/server/gudang/penugasan";
import { buatTokoUji, idGudangUji } from "../../src/server/gudang/uji-bantu";

// T98 — DESIGN §6 ▶ Keputusan (2026-10-13, pemilik): halaman operator dibuka dari sidebar, di halaman sendiri. Operator
// yang berhak di satu gudang langsung masuk ke form gudang itu. T112: halaman Salin jadwal operator dihapus. T113: isinya
// pengiriman di luar jadwal.

async function operatorJadwal(namaGudang: string) {
  const idGudang = await idGudangUji(namaGudang);
  const toko = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: toko.id, gudangId: idGudang });
  const operator = await buatPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang, hakTindakan: ["kelola-usulan-jadwal"] });
  return { idGudang, toko, operator };
}

async function masuk(page: Page, email: string) {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill(sandiUji);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/masuk/);
}

/** Tanggal kirim di luar jadwal yang valid: besok (WIB), atau lusa bila besok Senin (hari kirim rutin toko uji). */
function tanggalDiLuarJadwal() {
  const besok = geserHari(tanggalWib(new Date()), 1);
  return namaHari(besok) === "Senin" ? geserHari(besok, 1) : besok;
}

/** Toko uji berhak operator punya jadwal tetap mingguan Senin (H). */
async function jadwalSenin(idToko: number) {
  const admin = await buatPenggunaUji("admin");
  await db.insert(jadwalToko).values({ tokoId: idToko, pola: "mingguan", hariKirim: [{ hari: "Senin", persiapanHari: 0 }], dibuatOleh: admin.id });
}

async function isiForm(page: Page, namaToko: string, tanggal: string) {
  await page.getByRole("combobox", { name: "Toko" }).click();
  await page.getByRole("option", { name: namaToko }).click();
  await page.getByRole("combobox", { name: "Jenis" }).click();
  await page.getByRole("option", { name: /^Tambahan/ }).click();
  await page.getByLabel("Tanggal kirim").fill(tanggal);
  await page.getByRole("combobox", { name: "Persiapan" }).click();
  await page.getByRole("option", { name: "H", exact: true }).click();
  await page.getByLabel("Alasan", { exact: true }).fill("permintaan mendesak");
}

// T113 — PRD A5 ▶ Revisi 2026-10-13: operator mengusulkan pengiriman di luar jadwal dari sidebar "Kirim di luar jadwal".
test("Pusat: Kirim di luar jadwal dari sidebar → Simpan → langsung Berlaku di riwayat", async ({ page }) => {
  const { idGudang, toko, operator } = await operatorJadwal("Pusat");
  await jadwalSenin(toko.id);
  await masuk(page, operator.email);

  const navigasi = page.getByRole("navigation", { name: "Navigasi utama" });
  await navigasi.getByRole("button", { name: "Pekerjaan rutin" }).click();
  await navigasi.getByRole("link", { name: "Kirim di luar jadwal" }).click();
  await expect(page).toHaveURL(new RegExp(`/usulan-jadwal/${idGudang}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Atur pengiriman di luar jadwal — Pusat");

  await isiForm(page, toko.nama, tanggalDiLuarJadwal());
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByText("Berhasil disimpan")).toBeVisible();

  const baris = page.getByRole("table", { name: "Riwayat pengiriman di luar jadwal" }).getByRole("row", { name: new RegExp(toko.nama) });
  await expect(baris).toContainText("Berlaku");
  await expect(baris).toContainText("Langsung berlaku (Pusat)");
});

test("Gudang selain Pusat: Kirim usulan → Menunggu; admin menyetujui di Persetujuan jadwal → Berlaku", async ({ page, browser }) => {
  const { toko, operator } = await operatorJadwal("Gudang Cibubur");
  await jadwalSenin(toko.id);
  await masuk(page, operator.email);
  await page.goto("/usulan-jadwal");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Usulkan pengiriman di luar jadwal — Gudang Cibubur");

  await isiForm(page, toko.nama, tanggalDiLuarJadwal());
  await page.getByRole("button", { name: "Kirim usulan" }).click();
  await expect(page.getByText("Berhasil disimpan")).toBeVisible();
  const riwayat = page.getByRole("table", { name: "Riwayat pengiriman di luar jadwal" });
  await expect(riwayat.getByRole("row", { name: new RegExp(toko.nama) })).toContainText("Menunggu");

  const konteksAdmin = await browser.newContext();
  const halamanAdmin = await konteksAdmin.newPage();
  const admin = await buatPenggunaUji("admin");
  await masuk(halamanAdmin, admin.email);
  await halamanAdmin.goto("/admin/jadwal");
  await halamanAdmin.getByRole("button", { name: `Setujui usulan pengiriman ${toko.nama}` }).click();
  // Setelah disetujui, usulan pindah dari "Usulan menunggu" ke riwayat keputusan.
  await expect(
    halamanAdmin.getByRole("table", { name: "Riwayat keputusan pengiriman di luar jadwal" }).getByRole("row", { name: new RegExp(toko.nama) }),
  ).toContainText("Berlaku");
  await konteksAdmin.close();

  await page.reload();
  await expect(riwayat.getByRole("row", { name: new RegExp(toko.nama) })).toContainText("Berlaku");
});

test("Halaman Salin jadwal operator sudah dihapus: /salin-jadwal → 404", async ({ page }) => {
  const { idGudang, operator } = await operatorJadwal("Gudang Cibubur");
  await masuk(page, operator.email);
  expect((await page.goto("/salin-jadwal"))?.status()).toBe(404);
  expect((await page.goto(`/salin-jadwal/${idGudang}`))?.status()).toBe(404);
});

// T112 — PRD A5 ▶ Revisi 2026-10-13: jadwal tetap diatur admin dari Data Master › Jadwal toko.
test("Admin: Jadwal toko dari sidebar → atur jadwal satu toko di panel, lalu salin ke toko lain", async ({ page }) => {
  const idGudang = await idGudangUji("Gudang Cibubur");
  const [a, b] = [await buatTokoUji(), await buatTokoUji()];
  await db.insert(hubunganTokoGudang).values([a, b].map((t) => ({ tokoId: t.id, gudangId: idGudang })));
  const admin = await buatPenggunaUji("admin");
  await masuk(page, admin.email);

  const navigasi = page.getByRole("navigation", { name: "Navigasi utama" });
  await navigasi.getByRole("button", { name: "Data Master" }).click();
  await navigasi.getByRole("link", { name: "Jadwal toko" }).click();
  await expect(page).toHaveURL(/\/admin\/jadwal-toko$/);
  await page.locator(`a[data-id-gudang="${idGudang}"]`).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jadwal toko — Gudang Cibubur");

  await page.getByRole("button", { name: `Atur jadwal ${a.nama}` }).click();
  const panel = page.getByRole("dialog", { name: `Jadwal tetap ${a.nama}` });
  await panel.getByRole("checkbox", { name: "Senin" }).check();
  await panel.getByRole("button", { name: "Simpan jadwal" }).click();
  await expect(panel.getByText("Berhasil disimpan")).toBeVisible();
  await expect(panel.locator("[data-riwayat-jadwal]")).toHaveCount(1);
  await panel.getByRole("button", { name: "Tutup" }).click();
  await expect(page.locator(`tr[data-jadwal-toko="${a.id}"]`)).toContainText("Senin (H)");

  await page.getByRole("button", { name: "Salin jadwal ke beberapa toko" }).click();
  const salin = page.getByRole("dialog", { name: "Salin jadwal ke beberapa toko" });
  await salin.getByRole("checkbox", { name: b.nama }).check();
  await salin.getByRole("checkbox", { name: "Kamis" }).check();
  await salin.getByRole("button", { name: "Terapkan ke toko terpilih" }).click();
  await expect(salin.getByText("1 dari 1 toko berhasil.")).toBeVisible();
  await salin.getByRole("button", { name: "Tutup" }).click();
  await expect(page.locator(`tr[data-jadwal-toko="${b.id}"]`)).toContainText("Kamis (H)");
});
