import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, inArray } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { parseTanggalBisnis, type KategoriDasar, type NamaHari } from "@/domain/kalender";
import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { aliasNamaStok, barisDraftRencana, draftRencana, hubunganTokoGudang, jadwalToko, produk } from "@/server/db/schema";
import { hitungDraftRencana } from "@/server/gudang/draft-rencana";
import { daftarHakTindakan, type HakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";
import { PESAN_DRAFT_BERUBAH } from "@/server/gudang/stok-draft";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { buatWorkbookUji, kodeProdukUji, tahunUjiBebas } from "@/server/impor/uji-bantu";
import { hitungUlangCacheLaporan } from "@/server/laporan/cache";
import { aktifkanImporJuniUji, kuantitasJuniMenurutHari } from "@/server/laporan/uji-bantu";
import { buatKeluargaUji, publikasikanRankingUji } from "@/server/ranking/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { unggahStok } from "./aksi-stok";

// T83: unggah file stok satu toko di draft rencana (PRD A6 ▶ Keputusan 2026-10-12, UAT). Hak `input-stok` diperiksa di
// server sebelum membaca apa pun; hasil pembacaan dikembalikan tanpa menulis stok. Contoh literal issue T83: draft toko
// memuat PW110P-GOR (kebutuhan 56, tujuh besar) dan A10M-GOR; alias GORGEOUS TUBEROSE - 110ML M PARFUM → PW110P-GOR;
// A10M-NO1 ada di master tetapi bukan varian toko ini.

const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../tests/golden/jumlah-kirim.json"), "utf8")) as {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: { tanggalKirim: string };
};
const TANGGAL_KIRIM = golden.kasusCakupan.tanggalKirim;
const SEMUA_HARI_JUNI = Array.from({ length: 30 }, (_, i) => i + 1);
const kategoriHari = (nama: NamaHari): KategoriDasar =>
  nama === "Jumat" || nama === "Sabtu" || nama === "Minggu" ? nama : "Senin–Kamis";

// Nama master dan alias diberi akhiran unik: database test dipakai bersama berkas test lain yang memakai nama contoh
// yang sama (T82), sedangkan pencocokan nama master mengambil produk pertama yang namanya sama.
const UNIK = randomUUID().slice(0, 8).toUpperCase();
const ALIAS = `GORGEOUS TUBEROSE - 110ML M PARFUM ${UNIK}`;
const NAMA = {
  pw110p: `GORGEOUS TUBEROSE - 110ML M PARFUM INTENSE ${UNIK}`,
  a10mGor: `GORGEOUS TUBEROSE - 10ML ATOMIZER ${UNIK}`,
  a10mNo1: `NO1 - 10ML ATOMIZER ${UNIK}`,
};
const kode = { pw110p: kodeProdukUji("GOR"), a10mGor: kodeProdukUji("GOR"), a10mNo1: kodeProdukUji("NO1") };
const FILE_CONTOH = [
  "Name - Variant;Category;Ending",
  `${ALIAS};PARFUM WANITA;20`,
  `${NAMA.a10mGor};PARFUM WANITA;`,
  "BACCARAT ELIXIR - 2ML EDP;PARFUM WANITA;3",
  `${NAMA.a10mNo1};PARFUM PRIA;7`,
  "HOLY SWEET - 2ML EDP;PARFUM WANITA;abc",
].join("\r\n");
const HASIL_CONTOH = {
  keadaan: "berhasil",
  terisi: [
    { kodeProduk: kode.pw110p, stokAkhir: 20 },
    { kodeProduk: kode.a10mGor, stokAkhir: null },
  ],
  tidakDikenal: ["BACCARAT ELIXIR - 2ML EDP"],
  jumlahDiabaikan: 1,
  tidakValid: [{ nomor: 6, nama: "HOLY SWEET - 2ML EDP", alasan: 'Ending "abc" bukan bilangan bulat.' }],
};

let idAdmin: string;
let cibubur: number;
let toko: { id: number; nama: string };

async function masukOperator(idGudang: number, hakTindakan: HakTindakan[]) {
  const operator = await kepalaPenggunaUji("viewer");
  await tugaskanOperator({ idPengguna: operator.id, idGudang, hakTindakan });
  kepala.cookie = operator.cookie;
}

function kirim(nama: string, isi: Buffer | string, { tokoId = toko.id, tanggalKirim = TANGGAL_KIRIM, idGudang = cibubur } = {}) {
  const form = new FormData();
  form.set("idGudang", String(idGudang));
  form.set("tanggalKirim", tanggalKirim);
  form.set("tokoId", String(tokoId));
  form.set("file", new File([typeof isi === "string" ? isi : new Uint8Array(isi)], nama));
  return unggahStok(form);
}

/** Stok akhir tersimpan per kode untuk varian toko contoh di draft. */
async function stokTersimpan() {
  const baris = await db
    .select({ kodeProduk: barisDraftRencana.kodeProduk, stokAkhir: barisDraftRencana.stokAkhir })
    .from(barisDraftRencana)
    .where(inArray(barisDraftRencana.kodeProduk, [kode.pw110p, kode.a10mGor]));
  return Object.fromEntries(baris.map((b) => [b.kodeProduk, b.stokAkhir]));
}

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
  cibubur = await idGudangUji("Gudang Cibubur");
  await db.delete(draftRencana).where(eq(draftRencana.gudangId, cibubur));
  toko = await buatTokoUji();
  await db.insert(hubunganTokoGudang).values({ tokoId: toko.id, gudangId: cibubur });
  await db.insert(jadwalToko).values({
    tokoId: toko.id,
    pola: "mingguan",
    hariKirim: [{ hari: "Senin", persiapanHari: 2 }],
    dibuatOleh: idAdmin,
  });

  const tahun = await tahunUjiBebas();
  const kuantitas = kuantitasJuniMenurutHari(tahun, SEMUA_HARI_JUNI, (nama) => golden.rataRata[kategoriHari(nama)]);
  await aktifkanImporJuniUji({
    idAdmin,
    tahun,
    namaToko: toko.nama,
    hari: SEMUA_HARI_JUNI,
    produk: [
      { kode: kode.pw110p, nama: NAMA.pw110p, ukuran: "110ML", kategori: "PARFUM WANITA", kuantitas },
      { kode: kode.a10mGor, nama: NAMA.a10mGor, ukuran: "10ML", kategori: "ATOMIZER", kuantitas },
    ],
  });
  await hitungUlangCacheLaporan();
  expect(await tetapkanPeriodeSumber({ idGudang: cibubur, bulan: [`${tahun}-06`], idPengguna: idAdmin })).toMatchObject({ keadaan: "berhasil" });
  const tujuhBesar = await buatKeluargaUji();
  await publikasikanRankingUji({ keluarga: [tujuhBesar.id], idPengguna: idAdmin });
  await db
    .update(produk)
    .set({ statusKeluargaAroma: "terpetakan", keluargaAromaId: tujuhBesar.id })
    .where(inArray(produk.kode, [kode.pw110p, kode.a10mGor]));
  await db
    .insert(produk)
    .values({ kode: kode.a10mNo1, nama: NAMA.a10mNo1, ukuran: "10ML", kategori: "ATOMIZER", klasifikasi: "otomatis" })
    .onConflictDoNothing();
  await db.insert(aliasNamaStok).values({ alias: ALIAS, kodeProduk: kode.pw110p, dibuatOleh: idAdmin }).onConflictDoUpdate({
    target: aliasNamaStok.alias,
    set: { kodeProduk: kode.pw110p },
  });
  expect(await hitungDraftRencana({ idGudang: cibubur, tanggalKirim: parseTanggalBisnis(TANGGAL_KIRIM), idPengguna: idAdmin })).toMatchObject({
    keadaan: "berhasil",
  });
});

beforeEach(() => {
  kepala.cookie = "";
});

describe("kewenangan unggah stok (diperiksa di server)", () => {
  it("tanpa hak input-stok ditolak: operator tanpa hak itu, admin tanpa penugasan, operator gudang lain", async () => {
    await masukOperator(
      cibubur,
      daftarHakTindakan.filter((h) => h !== "input-stok"),
    );
    await expect(kirim("stok.csv", FILE_CONTOH)).rejects.toBeInstanceOf(AksesDitolakError);

    kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
    await expect(kirim("stok.csv", FILE_CONTOH)).rejects.toBeInstanceOf(AksesDitolakError);

    await masukOperator(await idGudangUji("Gudang Bali"), ["input-stok"]);
    await expect(kirim("stok.csv", FILE_CONTOH)).rejects.toBeInstanceOf(AksesDitolakError);

    expect(await stokTersimpan()).toEqual({ [kode.pw110p]: null, [kode.a10mGor]: null });
  });

  it("pengguna yang belum masuk diarahkan ke halaman masuk", async () => {
    await expect(kirim("stok.csv", FILE_CONTOH)).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });
});

describe("operator berhak mengunggah file stok", () => {
  beforeEach(async () => {
    await masukOperator(cibubur, ["input-stok"]);
  });

  it("contoh literal (CSV ;): terisi 2, tidak dikenal 1, diabaikan 1, nilai tidak valid 1; stok tidak ditulis", async () => {
    const aliasSebelum = await db.select().from(aliasNamaStok);
    expect(await kirim("ENDING STOK.csv", `﻿${FILE_CONTOH}\r\n`)).toEqual(HASIL_CONTOH);
    expect(await stokTersimpan()).toEqual({ [kode.pw110p]: null, [kode.a10mGor]: null });
    expect(await db.select().from(aliasNamaStok)).toEqual(aliasSebelum);
  });

  it("workbook .xlsx (sheet pertama; sel angka)", async () => {
    const workbook = buatWorkbookUji({
      Stok: [
        ["Name - Variant", "Category", "Ending"],
        [ALIAS, "PARFUM WANITA", 20],
        [NAMA.a10mGor, "PARFUM WANITA", null],
        ["BACCARAT ELIXIR - 2ML EDP", "PARFUM WANITA", 3],
        [NAMA.a10mNo1, "PARFUM PRIA", 7],
        ["HOLY SWEET - 2ML EDP", "PARFUM WANITA", "abc"],
      ],
      Lain: [["Name - Variant", "Ending"], [NAMA.a10mGor, 99]],
    });
    expect(await kirim("stok.xlsx", workbook)).toEqual(HASIL_CONTOH);
    expect(await stokTersimpan()).toEqual({ [kode.pw110p]: null, [kode.a10mGor]: null });
  });

  it("judul kolom kurang, format lain, file lebih dari 1 MB, dan tanpa file → gagal", async () => {
    expect(await kirim("stok.csv", "Name - Variant;Category\nA;B\n")).toEqual({
      keadaan: "gagal",
      pesan: "Judul kolom Ending tidak ditemukan di baris pertama.",
    });
    expect(await kirim("stok.txt", FILE_CONTOH)).toEqual({ keadaan: "gagal", pesan: "Format file harus CSV berpemisah ; atau .xlsx." });
    expect(await kirim("stok.csv", "x".repeat(1_048_577))).toEqual({ keadaan: "gagal", pesan: "File melebihi 1 MB." });

    const tanpaFile = new FormData();
    tanpaFile.set("idGudang", String(cibubur));
    tanpaFile.set("tanggalKirim", TANGGAL_KIRIM);
    tanpaFile.set("tokoId", String(toko.id));
    expect(await unggahStok(tanpaFile)).toEqual({ keadaan: "gagal", pesan: "Pilih file stok." });
  });

  it("toko tidak ada di draft, atau tidak ada draft untuk tanggal kirim → gagal tanpa membaca file", async () => {
    const tokoLain = await buatTokoUji();
    expect(await kirim("stok.csv", FILE_CONTOH, { tokoId: tokoLain.id })).toEqual({ keadaan: "gagal", pesan: PESAN_DRAFT_BERUBAH });
    expect(await kirim("stok.csv", FILE_CONTOH, { tanggalKirim: "2026-06-15" })).toEqual({ keadaan: "gagal", pesan: PESAN_DRAFT_BERUBAH });
    expect(await kirim("stok.csv", FILE_CONTOH, { tanggalKirim: "bukan-tanggal" })).toEqual({ keadaan: "gagal", pesan: "Tanggal kirim tidak valid." });
  });
});
