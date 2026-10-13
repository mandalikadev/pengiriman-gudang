import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { gudang, hubunganTokoGudang, toko } from "@/server/db/schema";
import { kunciNamaToko } from "@/server/impor/sheet-penjualan";

// Kelola toko oleh admin (PRD A3 ▶ Revisi 2026-10-13, T111): tambah dan ubah nama. Status aktif/nonaktif memakai
// `tetapkanAktifToko` (T76). Tidak ada hapus permanen. Kewenangan admin diperiksa pemanggil (server action).

export type HasilKelolaToko = { keadaan: "berhasil" } | { keadaan: "gagal"; pesan: string };

/** Satu baris daftar toko di halaman admin: nama, status, dan gudang terhubung (`null` = belum terhubung). */
export type TokoKelola = { id: number; nama: string; aktif: boolean; namaGudang: string | null };

const PESAN_NAMA_KOSONG = "Nama toko wajib diisi.";
const PESAN_TIDAK_DITEMUKAN = "Toko tidak ditemukan. Muat ulang halaman.";

/** Kunci advisory lock: tambah dan ubah nama toko berjalan bergiliran agar pemeriksaan nama ganda tidak balapan. */
const KUNCI_KELOLA_TOKO = 111;

const gagal = (pesan: string): HasilKelolaToko => ({ keadaan: "gagal", pesan });

/** Semua toko (aktif dan nonaktif) beserta gudang terhubungnya, urut nama. */
export async function daftarTokoKelola(): Promise<TokoKelola[]> {
  return db
    .select({ id: toko.id, nama: toko.nama, aktif: toko.aktif, namaGudang: gudang.nama })
    .from(toko)
    .leftJoin(hubunganTokoGudang, eq(hubunganTokoGudang.tokoId, toko.id))
    .leftJoin(gudang, eq(gudang.id, hubunganTokoGudang.gudangId))
    .orderBy(asc(toko.nama));
}

type Transaksi = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Pesan bila `nama` sama dengan nama toko lain menurut aturan pencocokan nama toko di impor (`kunciNamaToko`: trim,
 * spasi beruntun jadi satu, huruf besar). Dua toko dengan kunci sama tidak bisa dibedakan saat impor.
 */
async function pesanNamaDipakai(tx: Transaksi, nama: string, kecualiId?: number): Promise<string | null> {
  const kunci = kunciNamaToko(nama);
  const semua = await tx.select({ id: toko.id, nama: toko.nama }).from(toko);
  const lain = semua.find((t) => t.id !== kecualiId && kunciNamaToko(t.nama) === kunci);
  return lain ? `Nama toko sudah dipakai: ${lain.nama}. Pilih nama lain.` : null;
}

async function kunciKelolaToko(tx: Transaksi) {
  await tx.execute(sql`select pg_advisory_xact_lock(${KUNCI_KELOLA_TOKO}, 0)`);
}

/** Menambah toko aktif baru (belum terhubung ke gudang). Toko baru langsung dikenali impor berikutnya. */
export async function tambahToko(namaMasukan: string): Promise<HasilKelolaToko> {
  const nama = namaMasukan.trim();
  if (nama === "") return gagal(PESAN_NAMA_KOSONG);
  return db.transaction(async (tx) => {
    await kunciKelolaToko(tx);
    const dipakai = await pesanNamaDipakai(tx, nama);
    if (dipakai) return gagal(dipakai);
    await tx.insert(toko).values({ nama });
    return { keadaan: "berhasil" } as const;
  });
}

/**
 * Mengganti nama toko. Penjualan, jadwal, dan hubungan gudang merujuk id toko sehingga tetap melekat; rencana final
 * lama memakai snapshot namanya. Sheet penjualan berikutnya harus memakai nama baru.
 */
export async function ubahNamaToko(idToko: number, namaMasukan: string): Promise<HasilKelolaToko> {
  const nama = namaMasukan.trim();
  if (nama === "") return gagal(PESAN_NAMA_KOSONG);
  return db.transaction(async (tx) => {
    await kunciKelolaToko(tx);
    const [tujuan] = await tx.select({ id: toko.id }).from(toko).where(eq(toko.id, idToko));
    if (!tujuan) return gagal(PESAN_TIDAK_DITEMUKAN);
    const dipakai = await pesanNamaDipakai(tx, nama, idToko);
    if (dipakai) return gagal(dipakai);
    await tx.update(toko).set({ nama }).where(eq(toko.id, idToko));
    return { keadaan: "berhasil" } as const;
  });
}
