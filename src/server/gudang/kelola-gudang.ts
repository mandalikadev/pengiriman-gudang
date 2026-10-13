import { and, asc, count, eq, ne, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { gudang, hubunganTokoGudang } from "@/server/db/schema";

import { NAMA_GUDANG_PUSAT } from "./seed-master";

// Kelola gudang oleh admin (PRD A3 ▶ Revisi 2026-10-13, T110): tambah, ubah nama, nonaktifkan, aktifkan kembali.
// Tidak ada hapus permanen. Pusat tidak bisa diganti nama atau dinonaktifkan. Kewenangan admin diperiksa pemanggil
// (server action) sebelum fungsi ini dipanggil.

export type HasilKelolaGudang = { keadaan: "berhasil" } | { keadaan: "gagal"; pesan: string };

/** Satu baris daftar gudang di halaman admin. */
export type GudangKelola = { id: number; nama: string; aktif: boolean; pusat: boolean; jumlahToko: number };

const PESAN_PUSAT_TERKUNCI = "Gudang Pusat tidak bisa diganti nama atau dinonaktifkan";
const PESAN_TIDAK_DITEMUKAN = "Gudang tidak ditemukan. Muat ulang halaman.";
const PESAN_NAMA_KOSONG = "Nama gudang wajib diisi.";

const gagal = (pesan: string): HasilKelolaGudang => ({ keadaan: "gagal", pesan });

/** Semua gudang (aktif dan nonaktif) beserta jumlah toko terhubung, urut id (urutan seed master). */
export async function daftarGudangKelola(): Promise<GudangKelola[]> {
  const baris = await db
    .select({ id: gudang.id, nama: gudang.nama, aktif: gudang.aktif, jumlahToko: count(hubunganTokoGudang.tokoId) })
    .from(gudang)
    .leftJoin(hubunganTokoGudang, eq(hubunganTokoGudang.gudangId, gudang.id))
    .groupBy(gudang.id)
    .orderBy(asc(gudang.id));
  return baris.map((b) => ({ ...b, pusat: b.nama === NAMA_GUDANG_PUSAT }));
}

/** Gudang aktif untuk pilihan kerja (penugasan baru, periode sumber), urut id. */
export async function daftarGudangAktif(): Promise<{ id: number; nama: string }[]> {
  return db.select({ id: gudang.id, nama: gudang.nama }).from(gudang).where(eq(gudang.aktif, true)).orderBy(asc(gudang.id));
}

type Transaksi = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Pesan bila `nama` (sudah di-trim) sudah dipakai gudang lain; pembandingan mengabaikan huruf besar/kecil. */
async function pesanNamaDipakai(tx: Transaksi, nama: string, kecualiId?: number): Promise<string | null> {
  const [lain] = await tx
    .select({ nama: gudang.nama })
    .from(gudang)
    .where(and(sql`lower(${gudang.nama}) = lower(${nama})`, kecualiId === undefined ? undefined : ne(gudang.id, kecualiId)));
  return lain ? `Nama gudang sudah dipakai: ${lain.nama}. Pilih nama lain.` : null;
}

/** Pelanggaran unique (balapan dua admin menyimpan nama yang sama bersamaan). */
function namaBentrok(galat: unknown) {
  return typeof galat === "object" && galat !== null && "code" in galat && galat.code === "23505";
}

/** Menambah gudang aktif baru. Nama wajib dan unik (trim, tanpa membedakan huruf besar/kecil). */
export async function tambahGudang(namaMasukan: string): Promise<HasilKelolaGudang> {
  const nama = namaMasukan.trim();
  if (nama === "") return gagal(PESAN_NAMA_KOSONG);
  try {
    return await db.transaction(async (tx) => {
      const dipakai = await pesanNamaDipakai(tx, nama);
      if (dipakai) return gagal(dipakai);
      await tx.insert(gudang).values({ nama });
      return { keadaan: "berhasil" } as const;
    });
  } catch (galat) {
    if (namaBentrok(galat)) return gagal("Nama gudang sudah dipakai. Muat ulang halaman, lalu pilih nama lain.");
    throw galat;
  }
}

/** Mengganti nama gudang. Aturan nama sama dengan tambah; Pusat ditolak. Rencana final tetap memakai snapshot namanya. */
export async function ubahNamaGudang(idGudang: number, namaMasukan: string): Promise<HasilKelolaGudang> {
  const nama = namaMasukan.trim();
  if (nama === "") return gagal(PESAN_NAMA_KOSONG);
  try {
    return await db.transaction(async (tx) => {
      const [tujuan] = await tx.select({ nama: gudang.nama }).from(gudang).where(eq(gudang.id, idGudang)).for("update");
      if (!tujuan) return gagal(PESAN_TIDAK_DITEMUKAN);
      if (tujuan.nama === NAMA_GUDANG_PUSAT) return gagal(`${PESAN_PUSAT_TERKUNCI}.`);
      const dipakai = await pesanNamaDipakai(tx, nama, idGudang);
      if (dipakai) return gagal(dipakai);
      await tx.update(gudang).set({ nama }).where(eq(gudang.id, idGudang));
      return { keadaan: "berhasil" } as const;
    });
  } catch (galat) {
    if (namaBentrok(galat)) return gagal("Nama gudang sudah dipakai. Muat ulang halaman, lalu pilih nama lain.");
    throw galat;
  }
}

/**
 * Menonaktifkan (`aktif = false`) atau mengaktifkan kembali gudang. Pusat tidak bisa dinonaktifkan. Menonaktifkan
 * ditolak selama masih ada toko terhubung; pesannya menyebut jumlah toko. Baris gudang dikunci agar tidak balapan dengan
 * penambahan toko ke gudang yang sama.
 */
export async function tetapkanAktifGudang(idGudang: number, aktif: boolean): Promise<HasilKelolaGudang> {
  return db.transaction(async (tx) => {
    const [tujuan] = await tx.select({ nama: gudang.nama }).from(gudang).where(eq(gudang.id, idGudang)).for("update");
    if (!tujuan) return gagal(PESAN_TIDAK_DITEMUKAN);
    if (!aktif) {
      if (tujuan.nama === NAMA_GUDANG_PUSAT) return gagal(`${PESAN_PUSAT_TERKUNCI}.`);
      const [{ jumlah }] = await tx
        .select({ jumlah: count() })
        .from(hubunganTokoGudang)
        .where(eq(hubunganTokoGudang.gudangId, idGudang));
      if (jumlah > 0) {
        return gagal(
          `${tujuan.nama} masih terhubung dengan ${jumlah} toko. Gudang hanya bisa dinonaktifkan jika tidak ada lagi toko yang terhubung.`,
        );
      }
    }
    await tx.update(gudang).set({ aktif }).where(eq(gudang.id, idGudang));
    return { keadaan: "berhasil" } as const;
  });
}
