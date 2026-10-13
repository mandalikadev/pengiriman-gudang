import { expect, test, type Page } from "@playwright/test";

import { buatPenggunaUji, sandiUji } from "../../src/server/auth/uji-bantu";
import { db } from "../../src/server/db";
import { hubunganTokoGudang } from "../../src/server/db/schema";
import { tugaskanOperator } from "../../src/server/gudang/penugasan";
import { buatTokoUji, idGudangUji } from "../../src/server/gudang/uji-bantu";

// T98 — DESIGN §6 ▶ Keputusan (2026-10-13, pemilik): Atur/Usulkan jadwal toko dibuka dari sidebar, di halaman sendiri.
// Operator yang berhak di satu gudang langsung masuk ke form gudang itu. T112: halaman Salin jadwal operator dihapus.

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

test("Atur jadwal toko (Pusat) dari sidebar: simpan → jadwal aktif tampil di tabel", async ({ page }) => {
  const { idGudang, toko, operator } = await operatorJadwal("Pusat");
  await masuk(page, operator.email);

  const navigasi = page.getByRole("navigation", { name: "Navigasi utama" });
  await navigasi.getByRole("button", { name: "Pekerjaan rutin" }).click();
  await navigasi.getByRole("link", { name: "Usulkan jadwal toko" }).click();
  await expect(page).toHaveURL(new RegExp(`/usulan-jadwal/${idGudang}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Atur jadwal toko — Pusat");

  await page.getByRole("combobox", { name: "Toko" }).click();
  await page.getByRole("option", { name: toko.nama }).click();
  await page.getByRole("checkbox", { name: "Senin" }).check();
  await page.getByRole("button", { name: "Simpan jadwal" }).click();

  await expect(page.locator(`tr[data-jadwal-toko="${toko.id}"]`)).toContainText("Senin (H)");
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
