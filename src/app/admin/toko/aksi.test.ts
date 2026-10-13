import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { hubunganTokoGudang, impor, jadwalToko, rencanaFinal, selPenjualan, toko, versiRanking } from "@/server/db/schema";
import { daftarHakTindakan } from "@/server/gudang/hak-tindakan";
import { jadwalTokoGudang } from "@/server/gudang/jadwal";
import { daftarTokoKelola } from "@/server/gudang/kelola-toko";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { bacaRencanaFinal } from "@/server/gudang/rencana-final";
import { buatGudangUji, buatTokoUji, gudangTokoUji, hapusGudangUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { buatWorkbookUji, imporUji, kodeProdukUji, sheetPenjualanUji, tahunUjiBebas } from "@/server/impor/uji-bantu";
import { tahunRankingUjiBebas } from "@/server/ranking/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "", muatUlangGagal: false }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: () => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
  },
}));

import { gantiNamaToko, tambahTokoBaru, ubahStatusToko } from "./aksi";
import HalamanToko from "./page";

// T111 (PRD A3 ▶ Revisi 2026-10-13): admin menambah, mengganti nama, menonaktifkan, dan mengaktifkan kembali toko dari
// halaman Toko. Nama unik menurut aturan pencocokan nama toko di impor (`kunciNamaToko`). Test memakai nama unik
// ("TOKO BARU <acak>") karena database test dipakai bersama dan toko tidak bisa dihapus.

let bali: number;
let idAdmin: string;
const gudangDibuat: number[] = [];

beforeAll(async () => {
  bali = await idGudangUji("Gudang Bali");
  await pastikanBucket();
});

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
});

afterAll(async () => {
  await hapusGudangUji(...gudangDibuat);
});

const namaUnik = (awalan = "TOKO BARU") => `${awalan} ${randomUUID().slice(0, 8).toUpperCase()}`;

async function sebagaiAdmin() {
  const admin = await kepalaPenggunaUji("admin");
  kepala.cookie = admin.cookie;
  idAdmin = admin.id;
  return admin;
}

async function tokoBernama(nama: string) {
  const [baris] = await db.select({ id: toko.id, nama: toko.nama, aktif: toko.aktif }).from(toko).where(eq(toko.nama, nama));
  return baris;
}

async function aktifUji(idToko: number) {
  const [baris] = await db.select({ aktif: toko.aktif }).from(toko).where(eq(toko.id, idToko));
  return baris.aktif;
}

const HARI = [1, 2, 3];

/** Impor satu sheet dengan satu blok toko bernama `namaBlok`; mengembalikan id impor dan kode masalahnya. */
async function imporBlok(namaBlok: string) {
  const isi = buatWorkbookUji({
    "JUNI (S)": sheetPenjualanUji({
      toko: namaBlok,
      bulan: 6,
      hari: HARI,
      produk: [{ kode: kodeProdukUji(), nama: "15ML GLITTER - UJI", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER", kuantitas: [1, 2, 3] }],
    }),
  });
  const idImpor = await imporUji({ isi, tahunImpor: await tahunUjiBebas(), idPengguna: idAdmin });
  const [baris] = await db.select({ masalah: impor.masalah }).from(impor).where(eq(impor.id, idImpor));
  return { idImpor, kode: baris.masalah.map((m) => m.kode) };
}

describe("hanya admin yang bisa mengelola toko", () => {
  it("halaman: belum masuk → halaman masuk; viewer → 404", async () => {
    await expect(HalamanToko()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    await expect(HalamanToko()).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("viewer ditolak di server untuk tambah, ubah nama, dan ubah status; tidak ada yang berubah", async () => {
    const t = await buatTokoUji();
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    const nama = namaUnik();

    await expect(tambahTokoBaru({ nama })).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(gantiNamaToko({ idToko: t.id, nama })).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(ubahStatusToko({ idToko: t.id, aktif: false })).rejects.toBeInstanceOf(AksesDitolakError);

    expect(await tokoBernama(nama)).toBeUndefined();
    expect(await tokoBernama(t.nama)).toEqual({ id: t.id, nama: t.nama, aktif: true });
  });

  it("operator (viewer dengan penugasan dan semua hak tindakan) ditolak; tidak ada yang berubah", async () => {
    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: bali, hakTindakan: [...daftarHakTindakan] });
    kepala.cookie = operator.cookie;
    const t = await buatTokoUji({ aktif: false });

    await expect(tambahTokoBaru({ nama: namaUnik() })).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(gantiNamaToko({ idToko: t.id, nama: namaUnik() })).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(ubahStatusToko({ idToko: t.id, aktif: true })).rejects.toBeInstanceOf(AksesDitolakError);
    expect(await tokoBernama(t.nama)).toEqual({ id: t.id, nama: t.nama, aktif: false });
  });

  it("belum masuk → aksi diarahkan ke halaman masuk", async () => {
    const t = await buatTokoUji();
    for (const panggil of [
      () => tambahTokoBaru({ nama: namaUnik() }),
      () => gantiNamaToko({ idToko: t.id, nama: namaUnik() }),
      () => ubahStatusToko({ idToko: t.id, aktif: false }),
    ]) {
      await expect(panggil()).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
    }
    expect(await aktifUji(t.id)).toBe(true);
  });
});

describe("tambah toko", () => {
  it('admin menambah "TOKO BARU" → impor dengan blok toko itu tidak lagi menghasilkan error toko-tidak-dikenal', async () => {
    await sebagaiAdmin();
    const nama = namaUnik();

    expect((await imporBlok(nama)).kode).toContain("toko-tidak-dikenal");

    await expect(tambahTokoBaru({ nama: `  ${nama} ` })).resolves.toEqual({ keadaan: "berhasil" });
    const baru = await tokoBernama(nama);
    expect(baru).toMatchObject({ nama, aktif: true });
    expect((await daftarTokoKelola()).find((t) => t.id === baru.id)).toEqual({ id: baru.id, nama, aktif: true, namaGudang: null });

    const { idImpor, kode } = await imporBlok(nama);
    expect(kode).not.toContain("toko-tidak-dikenal");
    expect(await db.select().from(selPenjualan).where(eq(selPenjualan.imporId, idImpor))).toHaveLength(3);
    expect((await db.select().from(selPenjualan).where(eq(selPenjualan.imporId, idImpor))).every((s) => s.tokoId === baru.id)).toBe(true);

    // Toko baru tampil di halaman Toko dengan tindakannya.
    const html = renderToStaticMarkup(await HalamanToko());
    expect(html).toContain(`aria-label="Ubah nama ${nama}"`);
    expect(html).toContain(`aria-label="Nonaktifkan ${nama}"`);
  });

  it("nama kosong atau hanya spasi ditolak dengan pesan", async () => {
    await sebagaiAdmin();
    const sebelum = (await daftarTokoKelola()).length;
    for (const masukan of [{ nama: "" }, { nama: "   " }, {}]) {
      await expect(tambahTokoBaru(masukan)).resolves.toEqual({ keadaan: "gagal", pesan: "Nama toko wajib diisi." });
    }
    expect(await daftarTokoKelola()).toHaveLength(sebelum);
  });

  it("nama yang sama menurut kunciNamaToko (huruf besar/kecil, spasi di tepi, spasi beruntun) ditolak dengan pesan", async () => {
    await sebagaiAdmin();
    const sebelum = (await daftarTokoKelola()).length;
    await expect(tambahTokoBaru({ nama: "  tsm   cbb " })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Nama toko sudah dipakai: TSM CBB. Pilih nama lain.",
    });
    await expect(tambahTokoBaru({ nama: "pms" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Nama toko sudah dipakai: PMS. Pilih nama lain.",
    });
    expect(await daftarTokoKelola()).toHaveLength(sebelum);
  });

  it("halaman menampilkan keterangan aturan nama toko dan memakai tabel panjang", async () => {
    await sebagaiAdmin();
    const html = renderToStaticMarkup(await HalamanToko());
    expect(html).toContain(
      "Nama harus sama persis dengan nama blok toko di sheet penjualan. Setelah nama diubah, sheet berikutnya harus memakai nama baru.",
    );
    expect(html).toContain("Tambah toko");
    expect(html).toContain('aria-label="Daftar toko"');
    expect(html).toContain("max-h-[max(20rem,calc(100dvh-10rem))]");
    expect(html).toContain("text-2xl font-bold md:text-3xl");
  });
});

/** Rencana final minimal dengan snapshot nama toko saat finalisasi (kolom snapshot lain tidak dipakai test ini). */
async function rencanaFinalUji(idGudang: number, namaGudang: string, idToko: number, namaToko: string) {
  const [ranking] = await db
    .insert(versiRanking)
    .values({
      bulanRanking: `${await tahunRankingUjiBebas()}-09`,
      versi: 1,
      namaFile: "RANKING-UJI.xlsx",
      ukuranByte: 1,
      kunciObjek: `uji/${randomUUID()}`,
      diunggahOleh: idAdmin,
    })
    .returning({ id: versiRanking.id });
  const [r] = await db
    .insert(rencanaFinal)
    .values({
      gudangId: idGudang,
      namaGudang,
      tokoId: idToko,
      namaToko,
      tanggalKirim: "2026-06-08",
      versi: 1,
      difinalisasiOleh: idAdmin,
      namaPemfinalisasi: "Uji operator",
      bulanSumber: ["2026-06"],
      versiPeriodeSumber: 1,
      impor: [],
      versiRankingId: ranking.id,
      bulanRanking: "2026-09",
      versiRanking: 1,
      versiJadwal: 1,
      jadwal: { pola: "mingguan", hariKirim: [{ hari: "Senin", persiapanHari: 2 }], tanggalJangkar: null },
      persiapanHari: 2,
      panjangCakupan: 7,
      revisiKalender: 1,
      perubahanKategori: [],
      cakupan: [],
    })
    .returning({ id: rencanaFinal.id });
  return r.id;
}

describe("ubah nama toko", () => {
  it("penjualan, jadwal, dan hubungan gudang tetap melekat ke toko yang sama; rencana final lama tetap menampilkan nama lama", async () => {
    await sebagaiAdmin();
    const namaLama = namaUnik();
    await tambahTokoBaru({ nama: namaLama });
    const t = await tokoBernama(namaLama);
    const g = await buatGudangUji();
    gudangDibuat.push(g.id);
    await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: g.id });
    await db.insert(jadwalToko).values({ tokoId: t.id, pola: "mingguan", hariKirim: [{ hari: "Senin", persiapanHari: 1 }], dibuatOleh: idAdmin });
    const { idImpor } = await imporBlok(namaLama);
    const idRencana = await rencanaFinalUji(g.id, g.nama, t.id, namaLama);
    const namaBaru = namaUnik("TOKO GANTI");

    await expect(gantiNamaToko({ idToko: t.id, nama: ` ${namaBaru} ` })).resolves.toEqual({ keadaan: "berhasil" });

    expect(await tokoBernama(namaBaru)).toEqual({ id: t.id, nama: namaBaru, aktif: true });
    expect(await gudangTokoUji(t.id)).toEqual([g.id]);
    const jadwal = (await jadwalTokoGudang(g.id)).find((j) => j.id === t.id);
    expect(jadwal?.nama).toBe(namaBaru);
    expect(jadwal?.jadwal).not.toBeNull();
    const sel = await db.select({ tokoId: selPenjualan.tokoId }).from(selPenjualan).where(eq(selPenjualan.imporId, idImpor));
    expect(sel).toHaveLength(3);
    expect(sel.every((s) => s.tokoId === t.id)).toBe(true);
    expect((await bacaRencanaFinal(g.id, idRencana))?.toko).toEqual({ id: t.id, nama: namaLama });

    const html = renderToStaticMarkup(await HalamanToko());
    expect(html).toContain(namaBaru);
    expect(html).not.toContain(namaLama);

    // Sheet berikutnya memakai nama baru; nama lama tidak dikenal lagi.
    expect((await imporBlok(namaBaru)).kode).not.toContain("toko-tidak-dikenal");
    expect((await imporBlok(namaLama)).kode).toContain("toko-tidak-dikenal");
  });

  it("nama kosong atau sama dengan toko lain ditolak; nama sendiri beda huruf besar/kecil boleh", async () => {
    await sebagaiAdmin();
    const t = await buatTokoUji();

    await expect(gantiNamaToko({ idToko: t.id, nama: " " })).resolves.toEqual({ keadaan: "gagal", pesan: "Nama toko wajib diisi." });
    await expect(gantiNamaToko({ idToko: t.id, nama: "lmk" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Nama toko sudah dipakai: LMK. Pilih nama lain.",
    });
    expect(await tokoBernama(t.nama)).toMatchObject({ id: t.id });

    await expect(gantiNamaToko({ idToko: t.id, nama: t.nama.toLowerCase() })).resolves.toEqual({ keadaan: "berhasil" });
    expect(await tokoBernama(t.nama.toLowerCase())).toMatchObject({ id: t.id });
  });

  it("toko yang tidak ada ditolak dengan pesan", async () => {
    await sebagaiAdmin();
    await expect(gantiNamaToko({ idToko: 999_999_999, nama: namaUnik() })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Toko tidak ditemukan. Muat ulang halaman.",
    });
  });
});

describe("nonaktifkan dan aktifkan kembali toko dari halaman Toko", () => {
  it("menonaktifkan lalu mengaktifkan kembali; tombol di halaman Toko mengikuti status", async () => {
    await sebagaiAdmin();
    const t = await buatTokoUji();

    await expect(ubahStatusToko({ idToko: t.id, aktif: false })).resolves.toEqual({ keadaan: "berhasil" });
    expect(await aktifUji(t.id)).toBe(false);
    let html = renderToStaticMarkup(await HalamanToko());
    expect(html).toContain(`aria-label="Aktifkan ${t.nama}"`);
    expect(html).not.toContain(`aria-label="Nonaktifkan ${t.nama}"`);

    await expect(ubahStatusToko({ idToko: t.id, aktif: true })).resolves.toEqual({ keadaan: "berhasil" });
    expect(await aktifUji(t.id)).toBe(true);
    html = renderToStaticMarkup(await HalamanToko());
    expect(html).toContain(`aria-label="Nonaktifkan ${t.nama}"`);
  });

  it("hubungan toko–gudang tidak berubah saat toko dinonaktifkan; halaman Toko menampilkan gudangnya", async () => {
    await sebagaiAdmin();
    const t = await buatTokoUji();
    await db.insert(hubunganTokoGudang).values({ tokoId: t.id, gudangId: bali });
    await ubahStatusToko({ idToko: t.id, aktif: false });
    expect(await gudangTokoUji(t.id)).toEqual([bali]);
    const html = renderToStaticMarkup(await HalamanToko());
    const baris = new RegExp(`<tr[^>]*data-id-toko="${t.id}"[^>]*>(.*?)</tr>`).exec(html)?.[1] ?? "";
    expect(baris).toContain("Gudang Bali");
    expect(baris).toContain("Nonaktif");
  });

  it("tersimpan tetapi gagal memuat ulang tampilan", async () => {
    await sebagaiAdmin();
    kepala.muatUlangGagal = true;
    const t = await buatTokoUji();
    await expect(ubahStatusToko({ idToko: t.id, aktif: false })).resolves.toEqual({ keadaan: "tersimpanGagalMuatUlang" });
    expect(await aktifUji(t.id)).toBe(false);
  });

  it("toko tidak ditemukan atau isian tidak valid → gagal dengan pesan, tanpa menulis data", async () => {
    await sebagaiAdmin();
    await expect(ubahStatusToko({ idToko: -1, aktif: false })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Toko tidak ditemukan. Muat ulang halaman.",
    });
    const t = await buatTokoUji();
    await expect(ubahStatusToko({ idToko: t.id, aktif: "tidak" })).resolves.toMatchObject({ keadaan: "gagal" });
    await expect(ubahStatusToko({ idToko: "x", aktif: false })).resolves.toMatchObject({ keadaan: "gagal" });
    expect(await aktifUji(t.id)).toBe(true);
  });
});
