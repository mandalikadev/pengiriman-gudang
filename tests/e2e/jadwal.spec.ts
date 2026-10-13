import { expect, test, type Page } from "@playwright/test";

import { buatPenggunaUji, sandiUji } from "../../src/server/auth/uji-bantu";
import { db } from "../../src/server/db";
import { hubunganTokoGudang } from "../../src/server/db/schema";
import { tugaskanOperator } from "../../src/server/gudang/penugasan";
import { buatTokoUji, idGudangUji } from "../../src/server/gudang/uji-bantu";

// T98 — DESIGN §6 ▶ Keputusan (2026-10-13, pemilik): Atur/Usulkan jadwal toko dan Salin jadwal dibuka dari sidebar,
// di halaman sendiri. Operator yang berhak di satu gudang langsung masuk ke form gudang itu.

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

test("Salin jadwal (gudang selain Pusat) dari sidebar: kirim usulan → hasil per toko dan status usulan tampil", async ({ page }) => {
  const { idGudang, toko, operator } = await operatorJadwal("Gudang Cibubur");
  await masuk(page, operator.email);

  const navigasi = page.getByRole("navigation", { name: "Navigasi utama" });
  await navigasi.getByRole("button", { name: "Pekerjaan rutin" }).click();
  await navigasi.getByRole("link", { name: "Salin jadwal ke beberapa toko" }).click();
  await expect(page).toHaveURL(new RegExp(`/salin-jadwal/${idGudang}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Salin jadwal ke beberapa toko — Gudang Cibubur");

  await page.getByRole("checkbox", { name: toko.nama }).check();
  await page.getByRole("checkbox", { name: "Senin" }).check();
  await page.getByRole("button", { name: "Kirim usulan ke toko terpilih" }).click();

  await expect(page.getByText("1 dari 1 toko berhasil.")).toBeVisible();
  await expect(page.locator(`tr[data-jadwal-toko="${toko.id}"]`)).toContainText("Menunggu persetujuan");
});
