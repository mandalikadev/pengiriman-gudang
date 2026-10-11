import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

import type { KategoriDasar, NamaHari } from "../../src/domain/kalender";
import { parseTanggalBisnis } from "../../src/domain/kalender";
import { buatPenggunaUji, sandiUji } from "../../src/server/auth/uji-bantu";
import { db } from "../../src/server/db";
import { aliasNamaStok, draftRencana, hubunganTokoGudang, jadwalToko, produk, user } from "../../src/server/db/schema";
import { hitungDraftRencana } from "../../src/server/gudang/draft-rencana";
import { tugaskanOperator } from "../../src/server/gudang/penugasan";
import { tetapkanPeriodeSumber } from "../../src/server/gudang/periode-sumber";
import { buatTokoUji, idGudangUji } from "../../src/server/gudang/uji-bantu";
import { kodeProdukUji, tahunUji, type ProdukUji } from "../../src/server/impor/uji-bantu";
import { hitungUlangCacheLaporan } from "../../src/server/laporan/cache";
import { aktifkanImporJuniUji, kuantitasJuniMenurutHari } from "../../src/server/laporan/uji-bantu";
import { buatKeluargaUji, publikasikanRankingUji } from "../../src/server/ranking/uji-bantu";
import { EMAIL_ADMIN_E2E } from "./siapkan";

// T59: operator dengan hak input-stok mengisi stok akhir di draft rencana → simpan → jumlah kirim tampil.
// T73: draft tampil sebagai ringkasan per toko; baris dan isian stok tampil setelah toko dibuka.
// T83: operator mengunggah file stok satu toko → isian terisi (belum disimpan) → simpan → jumlah kirim tampil.
// Contoh PRD A6 / golden `jumlah-kirim.json`: kebutuhan 56, stok 20, keluarga tujuh besar → jumlah kirim 44.

const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../golden/jumlah-kirim.json"), "utf8")) as {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: { tanggalKirim: string; kebutuhan: number };
  kasusJumlahKirim: { kebutuhan: number; stokAkhir: number; persenBuffer: number; jumlahKirim: number }[];
};
const TANGGAL_KIRIM = golden.kasusCakupan.tanggalKirim;
const SEMUA_HARI_JUNI = Array.from({ length: 30 }, (_, i) => i + 1);
const kategoriHari = (nama: NamaHari): KategoriDasar =>
  nama === "Jumat" || nama === "Sabtu" || nama === "Minggu" ? nama : "Senin–Kamis";

/** Produk uji dengan penjualan sesuai contoh PRD A6 (rata-rata per kategori hari dari golden). */
function produkContoh(tahun: number, kode: string, nama: string, ukuran: string, kategori: string): ProdukUji {
  return {
    kode,
    nama,
    ukuran,
    kategori,
    kuantitas: kuantitasJuniMenurutHari(tahun, SEMUA_HARI_JUNI, (hari) => golden.rataRata[kategoriHari(hari)]),
  };
}

/**
 * Satu toko Gudang Jabodetabek dengan jadwal Senin H−2, impor Juni berisi `daftarProduk` (semua dipetakan ke keluarga
 * tujuh besar), periode sumber, ranking berlaku, operator berhak input-stok, dan draft rencana untuk TANGGAL_KIRIM.
 */
async function siapkanDraft(daftarProduk: (tahun: number) => ProdukUji[]) {
  const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, EMAIL_ADMIN_E2E));
  const operator = await buatPenggunaUji("viewer");
  const jabodetabek = await idGudangUji("Gudang Jabodetabek");
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, jabodetabek));
  const toko = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: toko.id, gudangId: jabodetabek });
  await db.insert(jadwalToko).values({
    tokoId: toko.id,
    pola: "mingguan",
    hariKirim: [{ hari: "Senin", persiapanHari: 2 }],
    dibuatOleh: admin.id,
  });

  const tahun = tahunUji();
  const daftar = daftarProduk(tahun);
  await aktifkanImporJuniUji({ idAdmin: admin.id, tahun, namaToko: toko.nama, hari: SEMUA_HARI_JUNI, produk: daftar });
  await hitungUlangCacheLaporan();
  const periode = await tetapkanPeriodeSumber({ idGudang: jabodetabek, bulan: [`${tahun}-06`], idPengguna: admin.id });
  expect(periode.keadaan).toBe("berhasil");

  const tujuhBesar = await buatKeluargaUji();
  await publikasikanRankingUji({ keluarga: [tujuhBesar.id], idPengguna: admin.id });
  await db
    .update(produk)
    .set({ statusKeluargaAroma: "terpetakan", keluargaAromaId: tujuhBesar.id })
    .where(
      inArray(
        produk.kode,
        daftar.map((p) => p.kode),
      ),
    );
  expect(await tugaskanOperator({ idPengguna: operator.id, idGudang: jabodetabek, hakTindakan: ["input-stok"] })).toMatchObject({
    keadaan: "berhasil",
  });
  expect(
    await hitungDraftRencana({ idGudang: jabodetabek, tanggalKirim: parseTanggalBisnis(TANGGAL_KIRIM), idPengguna: admin.id }),
  ).toMatchObject({ keadaan: "berhasil" });
  return { admin, operator, jabodetabek, toko };
}

async function masuk(page: Page, email: string) {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata sandi").fill(sandiUji);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/masuk/);
}

test("Draft rencana: buka toko → isi stok → simpan → jumlah kirim tampil", async ({ page }) => {
  const kode = kodeProdukUji("GOR");
  const { operator, jabodetabek, toko } = await siapkanDraft((tahun) => [
    produkContoh(tahun, kode, "15ML GLITTER - GORGEOUS", "15ML", "15ML GLITTER/LEATHER"),
  ]);
  await masuk(page, operator.email);

  await page.goto(`/pengiriman-gudang/${jabodetabek}?tanggal=${TANGGAL_KIRIM}`);
  const baris = page.locator(`tr[data-kode-produk="${kode}"]`);
  // Tanpa toko dibuka: ringkasan toko saja, tanpa baris maupun isian stok.
  await expect(page.locator(`tr[data-ringkasan-toko="${toko.id}"] [data-jumlah-baris]`)).toHaveText("1");
  await expect(baris).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: `Stok akhir ${kode}` })).toHaveCount(0);

  await page.getByRole("link", { name: `Buka ${toko.nama}` }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]toko=${toko.id}(&|#|$)`));
  await expect(baris.locator("[data-kebutuhan]")).toHaveText(String(golden.kasusCakupan.kebutuhan));
  await expect(baris.locator("[data-jumlah-kirim]")).toHaveText("—");
  await expect(baris.getByText("Stok belum diisi")).toBeVisible();

  const [contoh] = golden.kasusJumlahKirim;
  const form = page.getByRole("form", { name: `Stok akhir ${toko.nama}` });
  await form.getByRole("textbox", { name: `Stok akhir ${kode}` }).fill(String(contoh.stokAkhir));
  await expect(form.getByText("Ada perubahan yang belum disimpan")).toBeVisible();
  await form.getByRole("button", { name: "Simpan stok" }).click();

  await expect(form.getByRole("status")).toHaveText("Berhasil disimpan");
  await expect(baris.locator("[data-jumlah-kirim]")).toHaveText(String(contoh.jumlahKirim));
  await expect(baris.locator("[data-masalah]")).toHaveCount(0);

  // Muat ulang: stok tersimpan dari server, tanpa isian yang belum disimpan.
  await page.reload();
  await expect(form.getByRole("textbox", { name: `Stok akhir ${kode}` })).toHaveValue(String(contoh.stokAkhir));
  await expect(baris.locator("[data-jumlah-kirim]")).toHaveText(String(contoh.jumlahKirim));
  await expect(form.getByText("Ada perubahan yang belum disimpan")).toHaveCount(0);

  await db.delete(draftRencana).where(eq(draftRencana.gudangId, jabodetabek));
});

// Contoh literal issue T83: draft toko memuat PW110P-GOR (kebutuhan 56, tujuh besar) dan A10M-GOR; alias
// GORGEOUS TUBEROSE - 110ML M PARFUM → PW110P-GOR; A10M-NO1 ada di master tetapi bukan varian toko ini. File:
// tests/e2e/file-stok-contoh.csv (kode produk uji unik per putaran, nama sama dengan contoh).
test("Draft rencana: unggah file stok → isian terisi (belum disimpan) → simpan → jumlah kirim tampil", async ({ page }) => {
  const kode = { pw110p: kodeProdukUji("GOR"), a10mGor: kodeProdukUji("GOR"), a10mNo1: kodeProdukUji("NO1") };
  const { admin, operator, jabodetabek, toko } = await siapkanDraft((tahun) => [
    produkContoh(tahun, kode.pw110p, "GORGEOUS TUBEROSE - 110ML M PARFUM INTENSE", "110ML", "PARFUM WANITA"),
    produkContoh(tahun, kode.a10mGor, "GORGEOUS TUBEROSE - 10ML ATOMIZER", "10ML", "ATOMIZER"),
  ]);
  await db
    .insert(produk)
    .values({ kode: kode.a10mNo1, nama: "NO1 - 10ML ATOMIZER", ukuran: "10ML", kategori: "ATOMIZER", klasifikasi: "otomatis" })
    .onConflictDoNothing();
  await db
    .insert(aliasNamaStok)
    .values({ alias: "GORGEOUS TUBEROSE - 110ML M PARFUM", kodeProduk: kode.pw110p, dibuatOleh: admin.id })
    .onConflictDoUpdate({ target: aliasNamaStok.alias, set: { kodeProduk: kode.pw110p } });

  await masuk(page, operator.email);
  await page.goto(`/pengiriman-gudang/${jabodetabek}?tanggal=${TANGGAL_KIRIM}&toko=${toko.id}`);
  const form = page.getByRole("form", { name: `Stok akhir ${toko.nama}` });
  const barisPw110p = page.locator(`tr[data-kode-produk="${kode.pw110p}"]`);
  const barisA10m = page.locator(`tr[data-kode-produk="${kode.a10mGor}"]`);
  await expect(barisPw110p.locator("[data-kebutuhan]")).toHaveText(String(golden.kasusCakupan.kebutuhan));
  await expect(form.getByRole("button", { name: "Baca file" })).toBeDisabled();

  await form.getByLabel("Unggah file stok").setInputFiles(join(import.meta.dirname, "file-stok-contoh.csv"));
  await form.getByRole("button", { name: "Baca file" }).click();

  const ringkasan = form.getByRole("region", { name: "Hasil unggahan file stok" });
  await expect(ringkasan.locator("[data-jumlah-terisi]")).toHaveText("2 varian terisi dari file");
  await expect(ringkasan.locator("[data-jumlah-tidak-dikenal]")).toHaveText("1 nama tidak dikenal");
  await expect(ringkasan.getByRole("list", { name: "Nama tidak dikenal" })).toHaveText("BACCARAT ELIXIR - 2ML EDP");
  await expect(ringkasan.getByText("Admin memetakan nama ini di Alias nama stok.")).toBeVisible();
  await expect(ringkasan.locator("[data-jumlah-diabaikan]")).toHaveText("1 baris diabaikan (bukan varian toko ini)");
  await expect(ringkasan.locator("[data-jumlah-tidak-valid]")).toHaveText("1 baris nilai tidak valid");
  await expect(ringkasan.getByRole("list", { name: "Baris nilai tidak valid" })).toHaveText(
    'Baris 6: HOLY SWEET - 2ML EDP — Ending "abc" bukan bilangan bulat.',
  );

  const [contoh] = golden.kasusJumlahKirim;
  await expect(form.getByRole("textbox", { name: `Stok akhir ${kode.pw110p}` })).toHaveValue(String(contoh.stokAkhir));
  await expect(form.getByRole("textbox", { name: `Stok akhir ${kode.a10mGor}` })).toHaveValue("");
  await expect(form.getByText("Ada perubahan yang belum disimpan")).toBeVisible();
  await expect(barisPw110p.locator("[data-jumlah-kirim]")).toHaveText("—");

  await form.getByRole("button", { name: "Simpan stok" }).click();
  await expect(form.getByRole("status").filter({ hasText: "Berhasil disimpan" })).toBeVisible();
  await expect(barisPw110p.locator("[data-jumlah-kirim]")).toHaveText(String(contoh.jumlahKirim));
  await expect(barisPw110p.locator("[data-masalah]")).toHaveCount(0);
  await expect(barisA10m.locator("[data-jumlah-kirim]")).toHaveText("—");

  // Muat ulang: stok tersimpan dari server; ringkasan unggahan hilang.
  await page.reload();
  await expect(form.getByRole("textbox", { name: `Stok akhir ${kode.pw110p}` })).toHaveValue(String(contoh.stokAkhir));
  await expect(form.getByRole("region", { name: "Hasil unggahan file stok" })).toHaveCount(0);
  await expect(form.getByText("Ada perubahan yang belum disimpan")).toHaveCount(0);

  await db.delete(draftRencana).where(eq(draftRencana.gudangId, jabodetabek));
});
