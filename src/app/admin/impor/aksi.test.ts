import { createHash } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { cakupanTanggalImpor, impor, produk, selPenjualan } from "@/server/db/schema";
import { buatTokoUji } from "@/server/gudang/uji-bantu";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { prosesImpor } from "@/server/impor/proses";
import {
  buatWorkbookUji,
  kodeProdukUji,
  sheetPenjualanUji,
  tahunUji,
  type ProdukUji,
} from "@/server/impor/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "", muatUlangGagal: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
  },
}));

import { aktifkanImpor, daftarkanImpor, mintaUrlUnggah } from "./aksi";

beforeAll(async () => {
  await pastikanBucket();
});

beforeEach(async () => {
  kepala.cookie = (await kepalaPenggunaUji("admin")).cookie;
  kepala.muatUlangGagal = false;
});

const JUNI = 6;

function produkUji(kuantitas: (number | null)[], opsi: Partial<ProdukUji> = {}): ProdukUji {
  return { kode: kodeProdukUji(), nama: "15ML GLITTER - UJI", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER", kuantitas, ...opsi };
}

async function unggah(isi: Uint8Array) {
  const minta = await mintaUrlUnggah();
  if (minta.keadaan !== "berhasil") throw new Error(minta.pesan);
  const jawaban = await fetch(minta.url, { method: "PUT", body: Buffer.from(isi) });
  expect(jawaban.ok).toBe(true);
  return minta.kunci;
}

/** Unggah ke storage lewat presigned URL, lalu daftarkan impornya. */
async function unggahDanDaftarkan(
  isi: Uint8Array,
  { namaSheet = "JUNI (S)", tahunImpor, bulanImpor = JUNI }: { namaSheet?: string; tahunImpor: number; bulanImpor?: number },
) {
  const kunci = await unggah(isi);
  const hasil = await daftarkanImpor({ kunci, namaFile: "penjualan.xlsx", namaSheet, tahunImpor, bulanImpor });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
  return hasil.idImpor;
}

/** Impor yang sudah diproses worker dari sheet penjualan bersih satu toko. */
async function imporSiapDitinjau(tahunImpor: number, produkSheet?: ProdukUji[]) {
  const toko = await buatTokoUji();
  const isi = buatWorkbookUji({
    "JUNI (S)": sheetPenjualanUji({ toko: toko.nama, bulan: JUNI, hari: [1, 2], produk: produkSheet ?? [produkUji([2, 0])] }),
  });
  const idImpor = await unggahDanDaftarkan(isi, { tahunImpor });
  await prosesImpor(idImpor);
  return idImpor;
}

async function statusImpor(...id: number[]) {
  const baris = await db.select({ id: impor.id, status: impor.status }).from(impor).where(inArray(impor.id, id));
  return Object.fromEntries(baris.map((b) => [b.id, b.status]));
}

async function imporAktifBulan(tahunImpor: number, bulanImpor = JUNI) {
  const baris = await db
    .select({ id: impor.id })
    .from(impor)
    .where(and(eq(impor.tahunImpor, tahunImpor), eq(impor.bulanImpor, bulanImpor), eq(impor.status, "aktif")));
  return baris.map((b) => b.id);
}

describe("non-admin ditolak di server (OD-10)", () => {
  it("viewer tidak bisa meminta URL unggah, mendaftarkan, atau mengaktifkan impor", async () => {
    const idImpor = await imporSiapDitinjau(tahunUji());
    const kunci = await unggah(new Uint8Array([1]));
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;

    await expect(mintaUrlUnggah()).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(
      daftarkanImpor({ kunci, namaFile: "x.xlsx", namaSheet: "JUNI (S)", tahunImpor: 2026, bulanImpor: JUNI }),
    ).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(aktifkanImpor({ idImpor })).rejects.toBeInstanceOf(AksesDitolakError);

    expect(await db.select().from(impor).where(eq(impor.kunciObjek, kunci))).toEqual([]);
    expect(await statusImpor(idImpor)).toEqual({ [idImpor]: "siap-ditinjau" });
  });

  it("pengguna yang belum masuk diarahkan ke halaman masuk", async () => {
    const idImpor = await imporSiapDitinjau(tahunUji());
    kepala.cookie = "";
    await expect(mintaUrlUnggah()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    await expect(aktifkanImpor({ idImpor })).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    expect(await statusImpor(idImpor)).toEqual({ [idImpor]: "siap-ditinjau" });
  });
});

describe("unggah → worker → siap ditinjau → aktif", () => {
  it("alur lengkap menyimpan identitas file, sel bernilai, cakupan tanggal, lalu mendaftarkan produk baru saat aktivasi", async () => {
    const tahun = tahunUji();
    const toko = await buatTokoUji();
    const biasa = produkUji([2, 0, null]);
    const tester = produkUji([null, 1, null], { kode: kodeProdukUji("T"), nama: "DISPLAY TESTER UJI" });
    const kertas = produkUji([null, null, null], { kategori: "KTP", nama: "KERTAS TESTER UJI" });
    const isi = buatWorkbookUji({
      "JUNI (S)": sheetPenjualanUji({ toko: toko.nama, bulan: JUNI, hari: [1, 2, 3], produk: [biasa, tester, kertas] }),
      "MP PUSAT (S)": [["SALES"]],
    });

    const idImpor = await unggahDanDaftarkan(isi, { tahunImpor: tahun });
    const [terdaftar] = await db.select().from(impor).where(eq(impor.id, idImpor));
    expect(terdaftar).toMatchObject({
      status: "diunggah",
      namaFile: "penjualan.xlsx",
      namaSheet: "JUNI (S)",
      tahunImpor: tahun,
      bulanImpor: JUNI,
      ukuranByte: isi.length,
      sha256: null,
    });
    const job = await db.execute<{ jumlah: number }>(
      sql`select count(*)::int as jumlah from pgboss.job where name = 'proses-impor' and (data->>'idImpor')::int = ${idImpor}`,
    );
    expect(job[0].jumlah).toBe(1);

    await prosesImpor(idImpor);

    const [diproses] = await db.select().from(impor).where(eq(impor.id, idImpor));
    expect(diproses.status).toBe("siap-ditinjau");
    expect(diproses.sha256).toBe(createHash("sha256").update(isi).digest("hex"));
    expect(diproses.masalah).toEqual([]);
    expect(diproses.produk.map((p) => p.kodeProduk)).toEqual([biasa.kode, tester.kode, kertas.kode]);
    expect(diproses.selesaiDiprosesPada).not.toBeNull();

    const sel = await db
      .select({ kodeProduk: selPenjualan.kodeProduk, tanggal: selPenjualan.tanggal, kuantitas: selPenjualan.kuantitas, alamat: selPenjualan.alamat, tokoId: selPenjualan.tokoId })
      .from(selPenjualan)
      .where(eq(selPenjualan.imporId, idImpor))
      .orderBy(asc(selPenjualan.alamat));
    expect(sel).toEqual([
      { kodeProduk: biasa.kode, tanggal: `${tahun}-06-01`, kuantitas: 2, alamat: "F4", tokoId: toko.id },
      { kodeProduk: tester.kode, tanggal: `${tahun}-06-02`, kuantitas: 1, alamat: "G5", tokoId: toko.id },
      { kodeProduk: biasa.kode, tanggal: `${tahun}-06-02`, kuantitas: 0, alamat: "G4", tokoId: toko.id },
    ].sort((a, b) => a.alamat.localeCompare(b.alamat)));

    const cakupan = await db
      .select({ tokoId: cakupanTanggalImpor.tokoId, tanggal: cakupanTanggalImpor.tanggal, alamatKolom: cakupanTanggalImpor.alamatKolom })
      .from(cakupanTanggalImpor)
      .where(eq(cakupanTanggalImpor.imporId, idImpor))
      .orderBy(asc(cakupanTanggalImpor.tanggal));
    expect(cakupan).toEqual([
      { tokoId: toko.id, tanggal: `${tahun}-06-01`, alamatKolom: "F2" },
      { tokoId: toko.id, tanggal: `${tahun}-06-02`, alamatKolom: "G2" },
      { tokoId: toko.id, tanggal: `${tahun}-06-03`, alamatKolom: "H2" },
    ]);

    // Produk baru belum didaftarkan sebelum aktivasi.
    expect(await db.select().from(produk).where(inArray(produk.kode, [biasa.kode, tester.kode, kertas.kode]))).toEqual([]);

    await expect(aktifkanImpor({ idImpor })).resolves.toEqual({ keadaan: "berhasil" });
    expect(await statusImpor(idImpor)).toEqual({ [idImpor]: "aktif" });
    expect(await imporAktifBulan(tahun)).toEqual([idImpor]);

    const terdaftarProduk = await db
      .select({
        kode: produk.kode,
        nama: produk.nama,
        ukuran: produk.ukuran,
        kategori: produk.kategori,
        klasifikasi: produk.klasifikasi,
        alasanManual: produk.alasanManual,
        statusKeluargaAroma: produk.statusKeluargaAroma,
        didaftarkanOlehImporId: produk.didaftarkanOlehImporId,
      })
      .from(produk)
      .where(inArray(produk.kode, [biasa.kode, tester.kode, kertas.kode]));
    const keluargaBelum = { statusKeluargaAroma: "belum-dipetakan", didaftarkanOlehImporId: idImpor };
    expect(terdaftarProduk).toEqual(
      expect.arrayContaining([
        { kode: biasa.kode, nama: biasa.nama, ukuran: "15ML", kategori: biasa.kategori, klasifikasi: "otomatis", alasanManual: null, ...keluargaBelum },
        { kode: tester.kode, nama: tester.nama, ukuran: "15ML", kategori: tester.kategori, klasifikasi: "manual", alasanManual: "display-tester", ...keluargaBelum },
        { kode: kertas.kode, nama: kertas.nama, ukuran: "15ML", kategori: "KTP", klasifikasi: "manual", alasanManual: "kertas-tester", ...keluargaBelum },
      ]),
    );
    expect(terdaftarProduk).toHaveLength(3);
  });

  it("worker yang menjalankan job yang sama dua kali tidak menggandakan sel", async () => {
    const idImpor = await imporSiapDitinjau(tahunUji());
    await prosesImpor(idImpor);
    const sel = await db.select().from(selPenjualan).where(eq(selPenjualan.imporId, idImpor));
    expect(sel).toHaveLength(2);
  });

  it("tersimpan tetapi gagal memuat ulang tampilan", async () => {
    const idImpor = await imporSiapDitinjau(tahunUji());
    kepala.muatUlangGagal = true;
    await expect(aktifkanImpor({ idImpor })).resolves.toEqual({ keadaan: "tersimpanGagalMuatUlang" });
    expect(await statusImpor(idImpor)).toEqual({ [idImpor]: "aktif" });
  });
});

describe("impor kedua untuk bulan yang sama (ADR-0002)", () => {
  it("mengaktifkan impor kedua mengarsipkan yang pertama dalam satu transaksi", async () => {
    const tahun = tahunUji();
    const pertama = await imporSiapDitinjau(tahun);
    await aktifkanImpor({ idImpor: pertama });
    const kedua = await imporSiapDitinjau(tahun);

    await expect(aktifkanImpor({ idImpor: kedua })).resolves.toEqual({ keadaan: "berhasil" });

    expect(await statusImpor(pertama, kedua)).toEqual({ [pertama]: "diarsipkan", [kedua]: "aktif" });
    expect(await imporAktifBulan(tahun)).toEqual([kedua]);
    // now() PostgreSQL = waktu mulai transaksi: arsip dan aktivasi tercatat pada transaksi yang sama.
    const [lama] = await db.select({ diarsipkanPada: impor.diarsipkanPada }).from(impor).where(eq(impor.id, pertama));
    const [baru] = await db.select({ diaktifkanPada: impor.diaktifkanPada }).from(impor).where(eq(impor.id, kedua));
    expect(lama.diarsipkanPada).not.toBeNull();
    expect(lama.diarsipkanPada).toEqual(baru.diaktifkanPada);
    // Data impor lama tetap disimpan sebagai arsip.
    expect(await db.select().from(selPenjualan).where(eq(selPenjualan.imporId, pertama))).toHaveLength(2);
  });

  it("dua aktivasi bersamaan untuk bulan yang sama: tepat satu impor aktif", async () => {
    const tahun = tahunUji();
    const a = await imporSiapDitinjau(tahun);
    const b = await imporSiapDitinjau(tahun);
    const hasil = await Promise.all([aktifkanImpor({ idImpor: a }), aktifkanImpor({ idImpor: b })]);
    expect(hasil.every((h) => h.keadaan === "berhasil")).toBe(true);
    expect(await imporAktifBulan(tahun)).toHaveLength(1);
    expect(Object.values(await statusImpor(a, b)).sort()).toEqual(["aktif", "diarsipkan"]);
  });

  it("impor bulan lain tidak ikut diarsipkan", async () => {
    const tahun = tahunUji();
    const juni = await imporSiapDitinjau(tahun);
    await aktifkanImpor({ idImpor: juni });
    const toko = await buatTokoUji();
    const juli = await unggahDanDaftarkan(
      buatWorkbookUji({ "JULI (S)": sheetPenjualanUji({ toko: toko.nama, bulan: 7, hari: [1], produk: [produkUji([1])] }) }),
      { namaSheet: "JULI (S)", tahunImpor: tahun, bulanImpor: 7 },
    );
    await prosesImpor(juli);
    await aktifkanImpor({ idImpor: juli });
    expect(await statusImpor(juni, juli)).toEqual({ [juni]: "aktif", [juli]: "aktif" });
  });
});

describe("impor gagal, belum selesai, atau ber-error tidak mengubah impor aktif", () => {
  it("file yang tidak bisa dibaca → gagal; impor aktif tetap", async () => {
    const tahun = tahunUji();
    const aktif = await imporSiapDitinjau(tahun);
    await aktifkanImpor({ idImpor: aktif });

    const rusak = await unggahDanDaftarkan(new TextEncoder().encode("PK\u0003\u0004rusak-bukan-zip"), { tahunImpor: tahun });
    await prosesImpor(rusak);

    const [baris] = await db.select().from(impor).where(eq(impor.id, rusak));
    expect(baris.status).toBe("gagal");
    expect(baris.pesanGagal).toContain("tidak bisa dibaca");
    await expect(aktifkanImpor({ idImpor: rusak })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Impor ini gagal diproses dan tidak bisa diaktifkan. Unggah ulang file yang benar.",
    });
    expect(await imporAktifBulan(tahun)).toEqual([aktif]);
  });

  it("impor yang belum selesai diproses tidak bisa diaktifkan; impor aktif tetap", async () => {
    const tahun = tahunUji();
    const aktif = await imporSiapDitinjau(tahun);
    await aktifkanImpor({ idImpor: aktif });
    const toko = await buatTokoUji();
    const belum = await unggahDanDaftarkan(
      buatWorkbookUji({ "JUNI (S)": sheetPenjualanUji({ toko: toko.nama, bulan: JUNI, hari: [1], produk: [produkUji([1])] }) }),
      { tahunImpor: tahun },
    );

    await expect(aktifkanImpor({ idImpor: belum })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Impor ini belum selesai diproses. Tunggu sampai statusnya Siap ditinjau.",
    });
    expect(await statusImpor(belum, aktif)).toEqual({ [belum]: "diunggah", [aktif]: "aktif" });
  });

  it("sheet dengan error → siap ditinjau beserta daftar masalah, tetapi tidak bisa diaktifkan; impor aktif tetap", async () => {
    const tahun = tahunUji();
    const aktif = await imporSiapDitinjau(tahun);
    await aktifkanImpor({ idImpor: aktif });
    const toko = await buatTokoUji();
    const p = produkUji([-1, 3]);
    const error = await unggahDanDaftarkan(
      buatWorkbookUji({ "JUNI (S)": sheetPenjualanUji({ toko: toko.nama, bulan: JUNI, hari: [1, 2], produk: [p] }) }),
      { tahunImpor: tahun },
    );
    await prosesImpor(error);

    const [baris] = await db.select().from(impor).where(eq(impor.id, error));
    expect(baris.status).toBe("siap-ditinjau");
    expect(baris.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "kuantitas-negatif", lokasi: "JUNI (S)!F4" }),
    ]);
    await expect(aktifkanImpor({ idImpor: error })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Tidak bisa diaktifkan: ada 1 error. Perbaiki di Excel, lalu unggah ulang.",
    });
    expect(await statusImpor(error, aktif)).toEqual({ [error]: "siap-ditinjau", [aktif]: "aktif" });
    expect(await db.select().from(produk).where(eq(produk.kode, p.kode))).toEqual([]);
  });

  it("impor yang sudah aktif atau diarsipkan tidak diaktifkan ulang", async () => {
    const tahun = tahunUji();
    const lama = await imporSiapDitinjau(tahun);
    await aktifkanImpor({ idImpor: lama });
    const baru = await imporSiapDitinjau(tahun);
    await aktifkanImpor({ idImpor: baru });

    await expect(aktifkanImpor({ idImpor: baru })).resolves.toEqual({ keadaan: "gagal", pesan: "Impor ini sudah aktif." });
    await expect(aktifkanImpor({ idImpor: lama })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Impor ini sudah diarsipkan dan tidak bisa diaktifkan lagi.",
    });
    expect(await imporAktifBulan(tahun)).toEqual([baru]);
  });
});

describe("validasi pendaftaran impor", () => {
  it("sheet MP di luar cakupan saat ini", async () => {
    const kunci = await unggah(buatWorkbookUji({ "MP PUSAT (S)": [["SALES"]] }));
    await expect(
      daftarkanImpor({ kunci, namaFile: "a.xlsx", namaSheet: "MP PUSAT (S)", tahunImpor: 2026, bulanImpor: JUNI }),
    ).resolves.toEqual({ keadaan: "gagal", pesan: "Sheet MP di luar cakupan saat ini. Pilih sheet penjualan <BULAN> (S)." });
    expect(await db.select().from(impor).where(eq(impor.kunciObjek, kunci))).toEqual([]);
  });

  it("file yang belum ada di storage, kunci asing, atau didaftarkan dua kali ditolak", async () => {
    const minta = await mintaUrlUnggah();
    if (minta.keadaan !== "berhasil") throw new Error(minta.pesan);
    const dasar = { namaFile: "a.xlsx", namaSheet: "JUNI (S)", tahunImpor: 2026, bulanImpor: JUNI };

    await expect(daftarkanImpor({ ...dasar, kunci: minta.kunci })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "File belum ada di storage. Unggah ulang file-nya.",
    });
    await expect(daftarkanImpor({ ...dasar, kunci: "lain/berkas.xlsx" })).resolves.toMatchObject({ keadaan: "gagal" });

    const kunci = await unggah(new Uint8Array([1, 2, 3]));
    await expect(daftarkanImpor({ ...dasar, kunci })).resolves.toMatchObject({ keadaan: "berhasil" });
    await expect(daftarkanImpor({ ...dasar, kunci })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "File ini sudah didaftarkan sebagai impor.",
    });
  });

  it("isian tidak valid → gagal dengan pesan", async () => {
    const kunci = await unggah(new Uint8Array([1]));
    const dasar = { kunci, namaFile: "a.xlsx", namaSheet: "JUNI (S)", tahunImpor: 2026, bulanImpor: JUNI };
    await expect(daftarkanImpor({ ...dasar, bulanImpor: 13 })).resolves.toEqual({ keadaan: "gagal", pesan: "Pilih bulan impor." });
    await expect(daftarkanImpor({ ...dasar, tahunImpor: 26 })).resolves.toEqual({ keadaan: "gagal", pesan: "Isi tahun impor empat digit." });
    await expect(daftarkanImpor({ ...dasar, namaSheet: "" })).resolves.toEqual({ keadaan: "gagal", pesan: "Pilih sheet." });
    await expect(aktifkanImpor({ idImpor: "x" })).resolves.toEqual({ keadaan: "gagal", pesan: "Impor tidak ditemukan." });
    await expect(aktifkanImpor({ idImpor: 2_000_000_000 })).resolves.toEqual({ keadaan: "gagal", pesan: "Impor tidak ditemukan." });
  });
});

describe("toko nonaktif di sheet (PRD A1, Keputusan 2026-10-09)", () => {
  it("satu toko nonaktif → siap ditinjau dengan peringatan untuk toko itu, bisa diaktifkan, dan datanya tersimpan", async () => {
    const tahun = tahunUji();
    const toko = await buatTokoUji({ aktif: false });
    const p = produkUji([4, 0]);
    const idImpor = await unggahDanDaftarkan(
      buatWorkbookUji({ "JUNI (S)": sheetPenjualanUji({ toko: toko.nama, bulan: JUNI, hari: [1, 2], produk: [p] }) }),
      { tahunImpor: tahun },
    );
    await prosesImpor(idImpor);

    const [baris] = await db.select().from(impor).where(eq(impor.id, idImpor));
    expect(baris.status).toBe("siap-ditinjau");
    expect(baris.masalah).toEqual([
      expect.objectContaining({
        tingkat: "peringatan",
        kode: "toko-nonaktif",
        lokasi: "JUNI (S)!F1",
        pesan: expect.stringContaining(toko.nama),
      }),
    ]);

    await expect(aktifkanImpor({ idImpor })).resolves.toEqual({ keadaan: "berhasil" });
    expect(await statusImpor(idImpor)).toEqual({ [idImpor]: "aktif" });
    const sel = await db
      .select({ tokoId: selPenjualan.tokoId, kuantitas: selPenjualan.kuantitas, alamat: selPenjualan.alamat })
      .from(selPenjualan)
      .where(eq(selPenjualan.imporId, idImpor))
      .orderBy(asc(selPenjualan.alamat));
    expect(sel).toEqual([
      { tokoId: toko.id, kuantitas: 4, alamat: "F4" },
      { tokoId: toko.id, kuantitas: 0, alamat: "G4" },
    ]);
  });

  it("toko aktif tidak menghasilkan peringatan toko nonaktif", async () => {
    const idImpor = await imporSiapDitinjau(tahunUji());
    const [baris] = await db.select().from(impor).where(eq(impor.id, idImpor));
    expect(baris.masalah.filter((m) => m.kode === "toko-nonaktif")).toEqual([]);
  });
});

describe("master produk mengikuti impor yang terakhir diaktifkan (PRD A1, Keputusan 2026-10-09)", () => {
  async function masterProduk(kode: string) {
    const [baris] = await db.select().from(produk).where(eq(produk.kode, kode));
    return baris;
  }

  it("kategori berubah menjadi KTP → setelah aktivasi berklasifikasi manual (kertas-tester); kode, status keluarga aroma, dan pendaftar tetap", async () => {
    const tahun = tahunUji();
    const p = produkUji([1, 1], { nama: "KERTAS UJI LAMA", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER" });
    const pertama = await imporSiapDitinjau(tahun, [p]);
    await aktifkanImpor({ idImpor: pertama });
    expect(await masterProduk(p.kode)).toMatchObject({ klasifikasi: "otomatis", alasanManual: null });
    await db.update(produk).set({ statusKeluargaAroma: "tanpa-aroma" }).where(eq(produk.kode, p.kode));

    const kedua = await imporSiapDitinjau(tahun, [{ ...p, nama: "KERTAS UJI BARU", ukuran: "1PCS", kategori: "KTP" }]);
    // Sebelum aktivasi master belum berubah.
    expect(await masterProduk(p.kode)).toMatchObject({ nama: "KERTAS UJI LAMA", kategori: "15ML GLITTER/LEATHER" });
    await expect(aktifkanImpor({ idImpor: kedua })).resolves.toEqual({ keadaan: "berhasil" });

    expect(await masterProduk(p.kode)).toMatchObject({
      kode: p.kode,
      nama: "KERTAS UJI BARU",
      ukuran: "1PCS",
      kategori: "KTP",
      klasifikasi: "manual",
      alasanManual: "kertas-tester",
      statusKeluargaAroma: "tanpa-aroma",
      didaftarkanOlehImporId: pertama,
    });
  });

  it("kategori KTP kembali ke kategori biasa → otomatis lagi", async () => {
    const tahun = tahunUji();
    const p = produkUji([1, 1], { kategori: "KTP" });
    await aktifkanImpor({ idImpor: await imporSiapDitinjau(tahun, [p]) });
    expect(await masterProduk(p.kode)).toMatchObject({ klasifikasi: "manual", alasanManual: "kertas-tester" });

    await aktifkanImpor({ idImpor: await imporSiapDitinjau(tahun, [{ ...p, kategori: "15ML GLITTER/LEATHER" }]) });
    expect(await masterProduk(p.kode)).toMatchObject({ kategori: "15ML GLITTER/LEATHER", klasifikasi: "otomatis", alasanManual: null });
  });

  it("mengaktifkan impor bulan lebih lama setelah bulan lebih baru memakai data impor yang terakhir diaktifkan", async () => {
    const tahun = tahunUji();
    const p = produkUji([1, 1], { nama: "NAMA JUNI", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER" });
    const toko = await buatTokoUji();
    const juli = await unggahDanDaftarkan(
      buatWorkbookUji({
        "JULI (S)": sheetPenjualanUji({
          toko: toko.nama,
          bulan: 7,
          hari: [1],
          produk: [{ ...p, nama: "NAMA JULI", ukuran: "30ML", kategori: "KTL", kuantitas: [1] }],
        }),
      }),
      { namaSheet: "JULI (S)", tahunImpor: tahun, bulanImpor: 7 },
    );
    await prosesImpor(juli);
    const juni = await imporSiapDitinjau(tahun, [p]);

    await aktifkanImpor({ idImpor: juli });
    expect(await masterProduk(p.kode)).toMatchObject({ nama: "NAMA JULI", ukuran: "30ML", kategori: "KTL", klasifikasi: "manual" });

    await aktifkanImpor({ idImpor: juni });
    expect(await statusImpor(juni, juli)).toEqual({ [juni]: "aktif", [juli]: "aktif" });
    expect(await masterProduk(p.kode)).toMatchObject({
      nama: "NAMA JUNI",
      ukuran: "15ML",
      kategori: "15ML GLITTER/LEATHER",
      klasifikasi: "otomatis",
      alasanManual: null,
    });
  });

  it("produk yang tidak ada di impor yang diaktifkan tidak berubah", async () => {
    const tahun = tahunUji();
    const a = produkUji([1, 1], { nama: "NAMA A" });
    const b = produkUji([1, 1]);
    await aktifkanImpor({ idImpor: await imporSiapDitinjau(tahun, [a]) });
    await aktifkanImpor({ idImpor: await imporSiapDitinjau(tahun, [b]) });
    expect(await masterProduk(a.kode)).toMatchObject({ nama: "NAMA A" });
  });
});
