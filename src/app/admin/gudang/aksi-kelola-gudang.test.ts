import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { gudang, hubunganTokoGudang, penugasanOperator, rencanaFinal, versiRanking } from "@/server/db/schema";
import { daftarGudangAktif, daftarGudangKelola } from "@/server/gudang/kelola-gudang";
import { bacaRencanaFinal } from "@/server/gudang/rencana-final";
import { buatGudangUji, buatTokoUji, hapusGudangUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { siapkanBulanTersediaUji } from "@/server/laporan/uji-bantu";
import { tahunRankingUjiBebas } from "@/server/ranking/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { tugaskanOperator as tugaskanOperatorGudang } from "@/app/admin/penugasan/aksi";

import { gantiNamaGudang, tambahGudangBaru, tetapkanPeriodeSumberGudang, ubahStatusGudang } from "./aksi";
import HalamanGudang from "./page";

// T110 (PRD A3 ▶ Revisi 2026-10-13): admin menambah, mengganti nama, menonaktifkan, dan mengaktifkan kembali gudang.
// Pusat terkunci. Test membuat gudang sendiri (nama unik) dan menghapusnya agar berkas test lain tetap melihat lima gudang.

const dibuat: number[] = [];
let pusat: number;

beforeAll(async () => {
  pusat = await idGudangUji("Pusat");
});

beforeEach(() => {
  kepala.cookie = "";
});

afterAll(async () => {
  await hapusGudangUji(...dibuat);
});

const namaUnik = (awalan = "Gudang Uji") => `${awalan} ${randomUUID().slice(0, 8)}`;

async function idGudangBernama(nama: string) {
  const [baris] = await db.select({ id: gudang.id }).from(gudang).where(eq(gudang.nama, nama));
  if (baris) dibuat.push(baris.id);
  return baris?.id;
}

async function sebagaiAdmin() {
  const admin = await kepalaPenggunaUji("admin");
  kepala.cookie = admin.cookie;
  return admin;
}

describe("hanya admin yang bisa mengelola gudang", () => {
  it("viewer ditolak di server untuk tambah, ubah nama, dan ubah status; tidak ada yang berubah", async () => {
    const g = await buatGudangUji();
    dibuat.push(g.id);
    kepala.cookie = (await kepalaPenggunaUji("viewer")).cookie;
    const nama = namaUnik();

    await expect(tambahGudangBaru({ nama })).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(gantiNamaGudang({ idGudang: g.id, nama })).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(ubahStatusGudang({ idGudang: g.id, aktif: false })).rejects.toBeInstanceOf(AksesDitolakError);

    expect(await idGudangBernama(nama)).toBeUndefined();
    expect((await daftarGudangKelola()).find((d) => d.id === g.id)).toMatchObject({ nama: g.nama, aktif: true });
  });

  it("operator (viewer dengan penugasan) juga ditolak", async () => {
    const g = await buatGudangUji();
    dibuat.push(g.id);
    const operator = await kepalaPenggunaUji("viewer");
    await db.insert(penugasanOperator).values({
      userId: operator.id,
      gudangId: g.id,
      hakTindakan: ["kelola-usulan-jadwal", "input-stok", "hitung-kebutuhan", "finalisasi", "ekspor"],
    });
    kepala.cookie = operator.cookie;
    await expect(ubahStatusGudang({ idGudang: g.id, aktif: false })).rejects.toBeInstanceOf(AksesDitolakError);
    await expect(gantiNamaGudang({ idGudang: g.id, nama: namaUnik() })).rejects.toBeInstanceOf(AksesDitolakError);
  });

  it("belum masuk → diarahkan ke halaman masuk", async () => {
    await expect(tambahGudangBaru({ nama: namaUnik() })).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });
});

describe("tambah gudang", () => {
  it("gudang baru muncul di daftar dan bisa dipilih di Penugasan dan Periode sumber", async () => {
    const admin = await sebagaiAdmin();
    const nama = namaUnik();

    await expect(tambahGudangBaru({ nama: `  ${nama}  ` })).resolves.toEqual({ keadaan: "berhasil" });
    const id = await idGudangBernama(nama);
    expect(id).toBeDefined();

    expect((await daftarGudangKelola()).find((g) => g.id === id)).toEqual({ id, nama, aktif: true, pusat: false, jumlahToko: 0 });
    const html = renderToStaticMarkup(await HalamanGudang());
    expect(html).toContain(nama);
    expect(html).toContain(`aria-label="Ubah nama ${nama}"`);
    expect(html).toContain(`aria-label="Nonaktifkan ${nama}"`);

    // Pilihan gudang untuk penugasan baru dan periode sumber.
    expect(await daftarGudangAktif()).toContainEqual({ id, nama });
    const operator = await buatPenggunaUji("viewer");
    await expect(tugaskanOperatorGudang({ idPengguna: operator.id, idGudang: id, hakTindakan: [] })).resolves.toMatchObject({
      keadaan: "berhasil",
    });
    const [bulan] = await siapkanBulanTersediaUji(admin.id, [8]);
    await expect(tetapkanPeriodeSumberGudang({ idGudang: id, bulan: [bulan] })).resolves.toEqual({ keadaan: "berhasil" });
  });

  it("nama kosong atau hanya spasi ditolak dengan pesan", async () => {
    await sebagaiAdmin();
    const sebelum = (await daftarGudangKelola()).length;
    await expect(tambahGudangBaru({ nama: "" })).resolves.toEqual({ keadaan: "gagal", pesan: "Nama gudang wajib diisi." });
    await expect(tambahGudangBaru({ nama: "   " })).resolves.toEqual({ keadaan: "gagal", pesan: "Nama gudang wajib diisi." });
    await expect(tambahGudangBaru({})).resolves.toEqual({ keadaan: "gagal", pesan: "Nama gudang wajib diisi." });
    expect(await daftarGudangKelola()).toHaveLength(sebelum);
  });

  it("nama ganda (beda huruf besar/kecil atau spasi di awal/akhir) ditolak dengan pesan", async () => {
    await sebagaiAdmin();
    const sebelum = (await daftarGudangKelola()).length;
    await expect(tambahGudangBaru({ nama: "  gudang BALI " })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Nama gudang sudah dipakai: Gudang Bali. Pilih nama lain.",
    });
    await expect(tambahGudangBaru({ nama: "PUSAT" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Nama gudang sudah dipakai: Pusat. Pilih nama lain.",
    });
    expect(await daftarGudangKelola()).toHaveLength(sebelum);
  });
});

/** Rencana final minimal dengan snapshot nama gudang saat finalisasi (kolom snapshot lain tidak dipakai test ini). */
async function rencanaFinalUji(idGudang: number, namaGudang: string, idPengguna: string) {
  const t = await buatTokoUji();
  const [ranking] = await db
    .insert(versiRanking)
    .values({
      bulanRanking: `${await tahunRankingUjiBebas()}-09`,
      versi: 1,
      namaFile: "RANKING-UJI.xlsx",
      ukuranByte: 1,
      kunciObjek: `uji/${randomUUID()}`,
      diunggahOleh: idPengguna,
    })
    .returning({ id: versiRanking.id });
  const [r] = await db
    .insert(rencanaFinal)
    .values({
      gudangId: idGudang,
      namaGudang,
      tokoId: t.id,
      namaToko: t.nama,
      tanggalKirim: "2026-06-08",
      versi: 1,
      difinalisasiOleh: idPengguna,
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

describe("ubah nama gudang", () => {
  it("memperbarui tampilan; rencana final lama tetap menampilkan nama lama", async () => {
    const admin = await sebagaiAdmin();
    const g = await buatGudangUji();
    dibuat.push(g.id);
    const idRencana = await rencanaFinalUji(g.id, g.nama, admin.id);
    const namaBaru = namaUnik("Gudang Baru");

    await expect(gantiNamaGudang({ idGudang: g.id, nama: ` ${namaBaru} ` })).resolves.toEqual({ keadaan: "berhasil" });

    expect((await daftarGudangKelola()).find((d) => d.id === g.id)?.nama).toBe(namaBaru);
    const html = renderToStaticMarkup(await HalamanGudang());
    expect(html).toContain(namaBaru);
    expect(html).not.toContain(g.nama);
    expect((await bacaRencanaFinal(g.id, idRencana))?.gudang).toEqual({ id: g.id, nama: g.nama });
  });

  it("nama kosong atau ganda ditolak; mengganti dengan nama sendiri beda huruf besar/kecil boleh", async () => {
    await sebagaiAdmin();
    const g = await buatGudangUji();
    dibuat.push(g.id);

    await expect(gantiNamaGudang({ idGudang: g.id, nama: " " })).resolves.toEqual({ keadaan: "gagal", pesan: "Nama gudang wajib diisi." });
    await expect(gantiNamaGudang({ idGudang: g.id, nama: "gudang cibubur" })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Nama gudang sudah dipakai: Gudang Cibubur. Pilih nama lain.",
    });
    expect((await daftarGudangKelola()).find((d) => d.id === g.id)?.nama).toBe(g.nama);

    await expect(gantiNamaGudang({ idGudang: g.id, nama: g.nama.toLowerCase() })).resolves.toEqual({ keadaan: "berhasil" });
    expect((await daftarGudangKelola()).find((d) => d.id === g.id)?.nama).toBe(g.nama.toLowerCase());
  });

  it("gudang yang tidak ada ditolak dengan pesan", async () => {
    await sebagaiAdmin();
    await expect(gantiNamaGudang({ idGudang: 999_999_999, nama: namaUnik() })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Gudang tidak ditemukan. Muat ulang halaman.",
    });
  });
});

describe("nonaktifkan dan aktifkan kembali gudang", () => {
  it("gudang yang masih punya toko ditolak dengan pesan berisi jumlah toko", async () => {
    await sebagaiAdmin();
    const g = await buatGudangUji();
    dibuat.push(g.id);
    const [a, b, c] = [await buatTokoUji(), await buatTokoUji(), await buatTokoUji()];
    await db.insert(hubunganTokoGudang).values([a, b, c].map((t) => ({ tokoId: t.id, gudangId: g.id })));

    await expect(ubahStatusGudang({ idGudang: g.id, aktif: false })).resolves.toEqual({
      keadaan: "gagal",
      pesan: `${g.nama} masih terhubung dengan 3 toko. Gudang hanya bisa dinonaktifkan jika tidak ada lagi toko yang terhubung.`,
    });
    expect((await daftarGudangKelola()).find((d) => d.id === g.id)).toMatchObject({ aktif: true, jumlahToko: 3 });
  });

  it("tanpa toko → nonaktif (hilang dari pilihan Penugasan dan Periode sumber), lalu bisa diaktifkan kembali", async () => {
    const admin = await sebagaiAdmin();
    const g = await buatGudangUji();
    dibuat.push(g.id);
    const [bulan] = await siapkanBulanTersediaUji(admin.id, [9]);

    await expect(ubahStatusGudang({ idGudang: g.id, aktif: false })).resolves.toEqual({ keadaan: "berhasil" });
    expect((await daftarGudangKelola()).find((d) => d.id === g.id)).toMatchObject({ aktif: false });
    expect((await daftarGudangAktif()).map((d) => d.id)).not.toContain(g.id);
    const html = renderToStaticMarkup(await HalamanGudang());
    expect(html).toContain(`aria-label="Aktifkan ${g.nama}"`);
    expect(html).not.toContain(`aria-label="Nonaktifkan ${g.nama}"`);

    // Server juga menolak memilih gudang nonaktif untuk penugasan baru dan periode sumber.
    const operator = await buatPenggunaUji("viewer");
    await expect(tugaskanOperatorGudang({ idPengguna: operator.id, idGudang: g.id, hakTindakan: [] })).resolves.toMatchObject({
      keadaan: "gagal",
      pesan: "Gudang ini nonaktif dan tidak bisa dipilih untuk penugasan baru.",
    });
    await expect(tetapkanPeriodeSumberGudang({ idGudang: g.id, bulan: [bulan] })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Gudang ini nonaktif. Aktifkan kembali gudangnya sebelum menetapkan periode sumber.",
    });

    await expect(ubahStatusGudang({ idGudang: g.id, aktif: true })).resolves.toEqual({ keadaan: "berhasil" });
    expect((await daftarGudangKelola()).find((d) => d.id === g.id)).toMatchObject({ aktif: true });
    expect((await daftarGudangAktif()).map((d) => d.id)).toContain(g.id);
  });
});

describe("Pusat terkunci", () => {
  it("ubah nama atau nonaktifkan Pusat ditolak di server; Pusat tetap aktif dengan nama yang sama", async () => {
    await sebagaiAdmin();
    await expect(gantiNamaGudang({ idGudang: pusat, nama: namaUnik("Pusat Baru") })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Gudang Pusat tidak bisa diganti nama atau dinonaktifkan.",
    });
    await expect(ubahStatusGudang({ idGudang: pusat, aktif: false })).resolves.toEqual({
      keadaan: "gagal",
      pesan: "Gudang Pusat tidak bisa diganti nama atau dinonaktifkan.",
    });
    expect((await daftarGudangKelola()).find((d) => d.id === pusat)).toMatchObject({ nama: "Pusat", aktif: true, pusat: true });
  });

  it("baris Pusat tanpa tombol ubah nama dan nonaktifkan, dengan keterangan", async () => {
    await sebagaiAdmin();
    const html = renderToStaticMarkup(await HalamanGudang());
    expect(html).toContain("Gudang Pusat tidak bisa diganti nama atau dinonaktifkan");
    expect(html).not.toContain('aria-label="Ubah nama Pusat"');
    expect(html).not.toContain('aria-label="Nonaktifkan Pusat"');
    expect(html).toContain('aria-label="Ubah nama Gudang Bali"');
  });
});
