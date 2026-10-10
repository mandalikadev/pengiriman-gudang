import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

import type { KategoriDasar, NamaHari } from "../../src/domain/kalender";
import { parseTanggalBisnis } from "../../src/domain/kalender";
import { buatPenggunaUji, sandiUji } from "../../src/server/auth/uji-bantu";
import { db } from "../../src/server/db";
import { draftRencana, hubunganTokoGudang, jadwalToko, produk, user } from "../../src/server/db/schema";
import { hitungDraftRencana } from "../../src/server/gudang/draft-rencana";
import { tugaskanOperator } from "../../src/server/gudang/penugasan";
import { tetapkanPeriodeSumber } from "../../src/server/gudang/periode-sumber";
import { buatTokoUji, idGudangUji } from "../../src/server/gudang/uji-bantu";
import { kodeProdukUji, tahunUji } from "../../src/server/impor/uji-bantu";
import { hitungUlangCacheLaporan } from "../../src/server/laporan/cache";
import { aktifkanImporJuniUji, kuantitasJuniMenurutHari } from "../../src/server/laporan/uji-bantu";
import { buatKeluargaUji, publikasikanRankingUji } from "../../src/server/ranking/uji-bantu";
import { EMAIL_ADMIN_E2E } from "./siapkan";

// T59: operator dengan hak input-stok mengisi stok akhir di draft rencana → simpan → jumlah kirim tampil.
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

test("Draft rencana: isi stok → simpan → jumlah kirim tampil", async ({ page }) => {
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
  const kode = kodeProdukUji("GOR");
  await aktifkanImporJuniUji({
    idAdmin: admin.id,
    tahun,
    namaToko: toko.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [
      {
        kode,
        nama: "15ML GLITTER - GORGEOUS",
        ukuran: "15ML",
        kategori: "15ML GLITTER/LEATHER",
        kuantitas: kuantitasJuniMenurutHari(tahun, SEMUA_HARI_JUNI, (nama) => golden.rataRata[kategoriHari(nama)]),
      },
    ],
  });
  await hitungUlangCacheLaporan();
  const periode = await tetapkanPeriodeSumber({ idGudang: jabodetabek, bulan: [`${tahun}-06`], idPengguna: admin.id });
  expect(periode.keadaan).toBe("berhasil");

  const tujuhBesar = await buatKeluargaUji();
  await publikasikanRankingUji({ keluarga: [tujuhBesar.id], idPengguna: admin.id });
  await db
    .update(produk)
    .set({ statusKeluargaAroma: "terpetakan", keluargaAromaId: tujuhBesar.id })
    .where(inArray(produk.kode, [kode]));
  expect(await tugaskanOperator({ idPengguna: operator.id, idGudang: jabodetabek, hakTindakan: ["input-stok"] })).toMatchObject({
    keadaan: "berhasil",
  });
  expect(
    await hitungDraftRencana({ idGudang: jabodetabek, tanggalKirim: parseTanggalBisnis(TANGGAL_KIRIM), idPengguna: admin.id }),
  ).toMatchObject({ keadaan: "berhasil" });

  await page.goto("/masuk");
  await page.getByLabel("Email").fill(operator.email);
  await page.getByLabel("Kata sandi").fill(sandiUji);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).not.toHaveURL(/\/masuk/);

  await page.goto(`/pengiriman-gudang/${jabodetabek}?tanggal=${TANGGAL_KIRIM}`);
  const baris = page.locator(`tr[data-kode-produk="${kode}"]`);
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
