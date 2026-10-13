import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";

import type { KategoriDasar, NamaHari } from "../../src/domain/kalender";
import { parseTanggalBisnis } from "../../src/domain/kalender";
import { buatPenggunaUji, sandiUji } from "../../src/server/auth/uji-bantu";
import { db } from "../../src/server/db";
import { aliasNamaStok, draftRencana, hubunganTokoGudang, impor, jadwalToko, produk, user } from "../../src/server/db/schema";
import { hitungDraftRencana } from "../../src/server/gudang/draft-rencana";
import { tugaskanOperator } from "../../src/server/gudang/penugasan";
import { tetapkanPeriodeSumber } from "../../src/server/gudang/periode-sumber";
import { buatTokoUji, idGudangUji } from "../../src/server/gudang/uji-bantu";
import { aktifkanImpor } from "../../src/server/impor/impor";
import { buatWorkbookUji, imporUji, kodeProdukUji, sheetPenjualanUji, tahunUjiBebas, type ProdukUji } from "../../src/server/impor/uji-bantu";
import { hitungUlangCacheLaporan } from "../../src/server/laporan/cache";
import { kuantitasJuniMenurutHari } from "../../src/server/laporan/uji-bantu";
import { buatKeluargaUji, publikasikanRankingUji } from "../../src/server/ranking/uji-bantu";
import { EMAIL_ADMIN_E2E } from "./siapkan";

// T59: operator dengan hak input-stok mengisi stok akhir di draft rencana → simpan → jumlah kirim tampil.
// T73: draft tampil sebagai ringkasan per toko; baris dan isian stok tampil setelah toko dibuka.
// T83: operator mengunggah file stok satu toko → isian terisi (belum disimpan) → simpan → jumlah kirim tampil.
// T90: "Isi 0 untuk stok yang kosong" → isian 0 (belum disimpan) pada produk otomatis → simpan → baris tertahan berkurang.
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

  const tahun = await tahunUjiBebas();
  const daftar = daftarProduk(tahun);
  // Impor diproses oleh worker yang sedang berjalan, bukan langsung di test: memproses impor yang sama berbarengan
  // dengan worker menggandakan cakupan tanggalnya ("Pengamatan ganda" saat cache dihitung).
  const namaSheet = "JUNI (S)";
  const isi = buatWorkbookUji({ [namaSheet]: sheetPenjualanUji({ toko: toko.nama, bulan: 6, hari: SEMUA_HARI_JUNI, produk: daftar }) });
  const idImpor = await imporUji({ isi, namaSheet, tahunImpor: tahun, bulanImpor: 6, idPengguna: admin.id, proses: false });
  await expect
    .poll(async () => (await db.select({ status: impor.status }).from(impor).where(eq(impor.id, idImpor)))[0]?.status, { timeout: 60_000 })
    .toBe("siap-ditinjau");
  expect(await aktifkanImpor(idImpor, admin.id)).toEqual({ keadaan: "berhasil" });
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

// T90 (PRD A6 ▶ Keputusan 2026-10-12, UAT kedua): dua produk otomatis berstok kosong (tertahan "Stok belum diisi") dan
// satu produk manual (display tester, kode berakhiran -T). Isi 0 hanya mengisi kedua produk otomatis.
test("Draft rencana: isi 0 untuk stok yang kosong → simpan → baris tertahan berkurang", async ({ page }) => {
  const kode = { gor: kodeProdukUji("GOR"), san: kodeProdukUji("SAN"), tester: kodeProdukUji("GOR-T") };
  const { operator, jabodetabek, toko } = await siapkanDraft((tahun) => [
    produkContoh(tahun, kode.gor, "15ML GLITTER - GORGEOUS", "15ML", "15ML GLITTER/LEATHER"),
    produkContoh(tahun, kode.san, "15ML GLITTER - SANTAL", "15ML", "15ML GLITTER/LEATHER"),
    produkContoh(tahun, kode.tester, "15ML GLITTER - GORGEOUS TESTER", "15ML", "15ML GLITTER/LEATHER"),
  ]);
  await masuk(page, operator.email);
  await page.goto(`/pengiriman-gudang/${jabodetabek}?tanggal=${TANGGAL_KIRIM}&toko=${toko.id}`);

  const bagianToko = page.locator(`section[data-draft-toko="${toko.id}"]`);
  const form = page.getByRole("form", { name: `Stok akhir ${toko.nama}` });
  const isianStok = (k: string) => form.getByRole("textbox", { name: `Stok akhir ${k}` });
  await expect(bagianToko.locator("[data-jumlah-tertahan]")).toHaveText("2 baris tertahan");
  await expect(page.locator(`tr[data-kode-produk="${kode.tester}"]`).getByText("Manual").first()).toBeVisible();

  await form.getByRole("button", { name: "Isi 0 untuk 2 stok yang kosong" }).click();
  await expect(isianStok(kode.gor)).toHaveValue("0");
  await expect(isianStok(kode.san)).toHaveValue("0");
  await expect(isianStok(kode.tester)).toHaveValue("");
  await expect(form.getByText("Ada perubahan yang belum disimpan")).toBeVisible();
  await expect(form.getByRole("button", { name: "Isi 0 untuk 0 stok yang kosong" })).toBeDisabled();
  // Belum ada tulisan ke server: baris masih tertahan sampai Simpan stok.
  await expect(bagianToko.locator("[data-jumlah-tertahan]")).toHaveText("2 baris tertahan");

  await form.getByRole("button", { name: "Simpan stok" }).click();
  await expect(form.getByRole("status").filter({ hasText: "Berhasil disimpan" })).toBeVisible();
  await expect(bagianToko.locator("[data-jumlah-tertahan]")).toHaveText("Tidak ada baris tertahan");

  // Muat ulang: stok 0 tersimpan dari server; produk manual tetap kosong.
  await page.reload();
  await expect(isianStok(kode.gor)).toHaveValue("0");
  await expect(isianStok(kode.tester)).toHaveValue("");
  await expect(form.getByText("Ada perubahan yang belum disimpan")).toHaveCount(0);

  await db.delete(draftRencana).where(eq(draftRencana.gudangId, jabodetabek));
});

// T107 (DESIGN §11.1): draft toko dengan banyak varian. Tabel varian menggulir di wadahnya sendiri (wadah bertinggi
// terbatas: tinggi layar dikurangi kepala halaman, minimal 20rem), sehingga tinggi dokumen tidak mengikuti jumlah
// baris; header tetap terlihat setelah wadah digulir; kode dan nama produk menempel saat digulir horizontal.
test("Draft rencana: tabel varian panjang menggulir di wadahnya; header dan kolom identitas tetap terlihat", async ({ page }) => {
  const JUMLAH_VARIAN = 40;
  const daftarKode = Array.from({ length: JUMLAH_VARIAN }, () => kodeProdukUji("GOR"));
  const { operator, jabodetabek, toko } = await siapkanDraft((tahun) =>
    daftarKode.map((k, i) => produkContoh(tahun, k, `15ML GLITTER - VARIAN UJI ${i + 1}`, "15ML", "15ML GLITTER/LEATHER")),
  );
  const TINGGI_LAYAR = 800;
  await page.setViewportSize({ width: 1024, height: TINGGI_LAYAR });
  await masuk(page, operator.email);
  await page.goto(`/pengiriman-gudang/${jabodetabek}?tanggal=${TANGGAL_KIRIM}&toko=${toko.id}`);

  const tabel = page.getByRole("table", { name: `Varian ${toko.nama}` });
  await expect(tabel.locator("tr[data-kode-produk]")).toHaveCount(JUMLAH_VARIAN);
  const wadah = tabel.locator("xpath=..");
  const ukuran = await wadah.evaluate((el) => ({ tinggi: el.clientHeight, tinggiIsi: el.scrollHeight, lebar: el.clientWidth, lebarIsi: el.scrollWidth }));
  // Wadah bertinggi terbatas: max(20rem, 100dvh − 10rem) = 640 px pada layar 800 px; baris sisanya digulir di dalamnya.
  expect(ukuran.tinggi).toBeLessThanOrEqual(TINGGI_LAYAR - 160);
  expect(ukuran.tinggiIsi).toBeGreaterThan(ukuran.tinggi);
  // Menggandakan baris tabel tidak menambah tinggi dokumen.
  const tinggiDokumen = () => page.evaluate(() => document.documentElement.scrollHeight);
  const tinggiAwal = await tinggiDokumen();
  await tabel.evaluate((el) => {
    const badan = el.querySelector("tbody")!;
    for (const tr of [...badan.querySelectorAll("tr")]) badan.append(tr.cloneNode(true));
  });
  expect(await tinggiDokumen()).toBe(tinggiAwal);
  await tabel.evaluate((el) => {
    const baris = [...el.querySelectorAll("tbody > tr")];
    for (const tr of baris.slice(baris.length / 2)) tr.remove();
  });

  // Gulir wadah sampai bawah: baris terakhir terlihat, header tetap di atas wadah.
  await wadah.scrollIntoViewIfNeeded();
  await wadah.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  const header = tabel.getByRole("columnheader", { name: "Jumlah kirim" });
  const barisTerakhir = tabel.locator("tr[data-kode-produk]").last();
  await expect(barisTerakhir).toBeInViewport();
  const kotakWadah = (await wadah.boundingBox())!;
  const kotakHeader = (await header.boundingBox())!;
  expect(Math.abs(kotakHeader.y - kotakWadah.y)).toBeLessThanOrEqual(2);

  // Gulir horizontal (bila tabel lebih lebar dari wadahnya): kode dan nama produk tetap di tepi kiri wadah.
  expect(ukuran.lebarIsi).toBeGreaterThan(ukuran.lebar);
  await wadah.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  const kotakKode = (await barisTerakhir.locator("td").nth(0).boundingBox())!;
  const kotakNama = (await barisTerakhir.locator("td").nth(1).boundingBox())!;
  expect(Math.abs(kotakKode.x - kotakWadah.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(kotakNama.x - (kotakKode.x + kotakKode.width))).toBeLessThanOrEqual(2);

  await db.delete(draftRencana).where(eq(draftRencana.gudangId, jabodetabek));
});

// T108 (DESIGN §11.2): "Lihat rincian" membuka panel samping di atas halaman tanpa memuat ulang. Isian stok yang belum
// disimpan tetap ada, tidak ada peringatan tinggalkan halaman, dan posisi gulir tabel sama setelah panel ditutup.
// Tautan langsung `?rincian=` langsung membuka panel baris itu.
test("Draft rencana: rincian baris di panel samping; isian stok dan posisi gulir tetap", async ({ page }) => {
  const JUMLAH_VARIAN = 30;
  const daftarKode = Array.from({ length: JUMLAH_VARIAN }, () => kodeProdukUji("GOR"));
  const { operator, jabodetabek, toko } = await siapkanDraft((tahun) =>
    daftarKode.map((k, i) => produkContoh(tahun, k, `15ML GLITTER - VARIAN UJI ${i + 1}`, "15ML", "15ML GLITTER/LEATHER")),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await masuk(page, operator.email);
  await page.goto(`/pengiriman-gudang/${jabodetabek}?tanggal=${TANGGAL_KIRIM}&toko=${toko.id}`);

  // Peringatan tinggalkan halaman (confirm) maupun beforeunload tidak boleh muncul.
  const dialogPeramban: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogPeramban.push(dialog.message());
    await dialog.dismiss();
  });

  const form = page.getByRole("form", { name: `Stok akhir ${toko.nama}` });
  const [pertama] = daftarKode;
  // Locator CSS: selama panel terbuka, isi halaman disembunyikan dari pohon aksesibilitas (aria-hidden).
  const isianPertama = page.locator(`input[aria-label="Stok akhir ${pertama}"]`);
  await isianPertama.fill("7");
  await expect(form.getByText("Ada perubahan yang belum disimpan")).toBeVisible();

  // Gulir halaman dan wadah tabel sampai baris di tengah tabel terlihat, lalu buka rinciannya.
  const tabel = page.locator(`table[aria-label="Varian ${toko.nama}"]`);
  const wadah = tabel.locator("xpath=..");
  await wadah.scrollIntoViewIfNeeded();
  const kodeDibuka = daftarKode[20];
  const tautan = page.locator(`a[data-tautan-rincian-baris="${toko.id}|${kodeDibuka}"]`);
  await tautan.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(tautan).toBeInViewport();
  const posisi = async () => ({
    wadah: await wadah.evaluate((el) => el.scrollTop),
    halaman: await page.evaluate(() => window.scrollY),
  });
  const sebelum = await posisi();
  expect(sebelum.wadah).toBeGreaterThan(0);
  const urlAwal = page.url();
  await tautan.click();

  const panel = page.getByRole("dialog", { name: `Rincian perhitungan ${kodeDibuka} · ${toko.nama}` });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`[?&]rincian=${toko.id}%7C${kodeDibuka}`));
  await expect(panel.locator(`[data-rincian-baris="${toko.id}|${kodeDibuka}"] [data-kebutuhan-rincian]`)).toHaveAttribute(
    "data-kebutuhan-rincian",
    String(golden.kasusCakupan.kebutuhan),
  );
  // Panel di kanan, di atas halaman, dengan tombol Tutup yang terlihat (±560 px di desktop).
  const kotakPanel = (await panel.boundingBox())!;
  expect(kotakPanel.x + kotakPanel.width).toBeGreaterThanOrEqual(1440 - 20);
  expect(Math.abs(kotakPanel.width - 560)).toBeLessThanOrEqual(1);
  await expect(panel.getByRole("button", { name: "Tutup" })).toBeInViewport();
  // Halaman tidak dimuat ulang: isian yang belum disimpan tetap ada.
  await expect(isianPertama).toHaveValue("7");
  expect(await posisi()).toEqual(sebelum);

  await panel.getByRole("button", { name: "Tutup" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page).not.toHaveURL(/rincian=/);
  await expect(tautan).toBeFocused();
  await expect(isianPertama).toHaveValue("7");
  await expect(form.getByText("Ada perubahan yang belum disimpan")).toBeVisible();
  expect(await posisi()).toEqual(sebelum);
  expect(new URL(page.url()).searchParams.get("toko")).toBe(new URL(urlAwal).searchParams.get("toko"));

  // Esc juga menutup panel.
  await tautan.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  expect(dialogPeramban).toEqual([]);

  // Kosongkan lagi isian agar membuka alamat baru tidak memicu peringatan meninggalkan halaman.
  await isianPertama.fill("");
  await expect(form.getByText("Ada perubahan yang belum disimpan")).toHaveCount(0);

  // Tautan langsung: panel baris itu langsung terbuka.
  const kodeLangsung = daftarKode[3];
  await page.goto(
    `/pengiriman-gudang/${jabodetabek}?tanggal=${TANGGAL_KIRIM}&toko=${toko.id}&rincian=${encodeURIComponent(`${toko.id}|${kodeLangsung}`)}`,
  );
  const panelLangsung = page.getByRole("dialog", { name: `Rincian perhitungan ${kodeLangsung} · ${toko.nama}` });
  await expect(panelLangsung).toBeVisible();
  await expect(panelLangsung.locator(`[data-rincian-baris="${toko.id}|${kodeLangsung}"]`)).toBeVisible();

  await db.delete(draftRencana).where(eq(draftRencana.gudangId, jabodetabek));
});
