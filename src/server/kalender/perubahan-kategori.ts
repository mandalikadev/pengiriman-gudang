import { and, asc, eq, isNull, max, sql } from "drizzle-orm";

import type { KategoriDasar, TanggalBisnis } from "@/domain/kalender";
import { kategoriEfektif, type PerubahanKategori } from "@/domain/kategori";
import { db } from "@/server/db";
import { perubahanKategori, toko, user } from "@/server/db/schema";
import type { Tx } from "@/server/impor/antrean";
import { bacaPerubahanKategori, naikkanRevisiKalender } from "@/server/laporan/cache";

// Perubahan kategori manual oleh admin (T42, PRD B4 + ▶ Keputusan 2026-10-10). Buat, revisi, dan batal masing-masing
// berjalan dalam satu transaksi yang juga menaikkan revisi kalender (T33), sehingga cache laporan dihitung ulang.
// Kewenangan admin diperiksa pemanggil (server action) sebelum fungsi ini dipanggil.

/** Kunci advisory lock: semua tulis perubahan kategori berjalan bergiliran agar nomor revisi dan kategori sebelum konsisten. */
const KUNCI_PERUBAHAN_KATEGORI = 42;

export type HasilPerubahanKategori = { keadaan: "berhasil" } | { keadaan: "gagal"; pesan: string };

type Cakupan = {
  tanggal: TanggalBisnis;
  /** `null` = seluruh toko. */
  idToko: number | null;
};

type IsianPerubahan = Cakupan & { kategoriBaru: KategoriDasar; alasan: string; idPengguna: string };

const PESAN_ALASAN_KOSONG = "Alasan wajib diisi.";

const milikCakupan = ({ tanggal, idToko }: Cakupan) =>
  and(
    eq(perubahanKategori.tanggal, tanggal),
    idToko === null ? isNull(perubahanKategori.tokoId) : eq(perubahanKategori.tokoId, idToko),
  );

/**
 * Kategori yang berlaku untuk cakupan itu saat ini (▶ Keputusan 2026-10-10): untuk satu toko, perubahan toko itu →
 * perubahan seluruh toko → kategori dasar; untuk seluruh toko, perubahan seluruh toko → kategori dasar.
 */
function kategoriBerlaku({ tanggal, idToko }: Cakupan, daftar: readonly PerubahanKategori[]) {
  const toko = idToko === null ? "" : String(idToko);
  const relevan = daftar.filter(
    ({ cakupan }) => cakupan.jenis === "semua-toko" || (idToko !== null && cakupan.toko === toko),
  );
  return kategoriEfektif(tanggal, toko, relevan);
}

async function kunciPerubahanKategori(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(${KUNCI_PERUBAHAN_KATEGORI}, 0)`);
}

async function tokoAda(tx: Tx, idToko: number | null) {
  if (idToko === null) return true;
  const [baris] = await tx.select({ id: toko.id }).from(toko).where(eq(toko.id, idToko));
  return baris !== undefined;
}

async function adaPerubahanAktif(tx: Tx, cakupan: Cakupan) {
  const [baris] = await tx
    .select({ id: perubahanKategori.id })
    .from(perubahanKategori)
    .where(and(milikCakupan(cakupan), eq(perubahanKategori.status, "aktif")))
    .limit(1);
  return baris !== undefined;
}

/** Nomor revisi berikutnya pada tanggal + cakupan: melanjutkan semua revisi yang pernah ada, termasuk yang dibatalkan. */
async function revisiBerikutnya(tx: Tx, cakupan: Cakupan) {
  const [baris] = await tx.select({ terbesar: max(perubahanKategori.revisi) }).from(perubahanKategori).where(milikCakupan(cakupan));
  return (baris?.terbesar ?? 0) + 1;
}

async function simpanRevisi(tx: Tx, isian: IsianPerubahan, alasan: string) {
  const sebelum = kategoriBerlaku(isian, await bacaPerubahanKategori(tx, isian.tanggal));
  await tx.insert(perubahanKategori).values({
    tanggal: isian.tanggal,
    tokoId: isian.idToko,
    kategoriSebelum: sebelum.kategoriEfektif,
    kategoriSesudah: isian.kategoriBaru,
    alasan,
    revisi: await revisiBerikutnya(tx, isian),
    dibuatOleh: isian.idPengguna,
  });
  await naikkanRevisiKalender(tx);
}

/** Membuat perubahan kategori baru untuk tanggal + cakupan yang belum punya perubahan aktif. */
export async function buatPerubahanKategori(isian: IsianPerubahan): Promise<HasilPerubahanKategori> {
  const alasan = isian.alasan.trim();
  if (alasan === "") return { keadaan: "gagal", pesan: PESAN_ALASAN_KOSONG };

  return db.transaction(async (tx) => {
    await kunciPerubahanKategori(tx);
    if (!(await tokoAda(tx, isian.idToko))) return { keadaan: "gagal", pesan: "Toko tidak ditemukan." };
    if (await adaPerubahanAktif(tx, isian)) {
      return {
        keadaan: "gagal",
        pesan: "Sudah ada perubahan aktif untuk cakupan ini pada tanggal tersebut. Ubah atau batalkan perubahan itu.",
      };
    }
    await simpanRevisi(tx, isian, alasan);
    return { keadaan: "berhasil" };
  });
}

/** Mengganti kategori perubahan aktif: revisi baru (revisi +1) pada tanggal + cakupan yang sama; revisi lama tetap tersimpan. */
export async function revisiPerubahanKategori(isian: IsianPerubahan): Promise<HasilPerubahanKategori> {
  const alasan = isian.alasan.trim();
  if (alasan === "") return { keadaan: "gagal", pesan: PESAN_ALASAN_KOSONG };

  return db.transaction(async (tx) => {
    await kunciPerubahanKategori(tx);
    if (!(await adaPerubahanAktif(tx, isian))) {
      return { keadaan: "gagal", pesan: "Tidak ada perubahan aktif untuk cakupan ini. Muat ulang halaman, lalu periksa lagi." };
    }
    await simpanRevisi(tx, isian, alasan);
    return { keadaan: "berhasil" };
  });
}

/**
 * Membatalkan seluruh perubahan aktif pada tanggal + cakupan (▶ Keputusan 2026-10-10), sehingga tanggal kembali ke
 * level berikutnya. Baris tidak dihapus: statusnya `dibatalkan`, dengan siapa, kapan, dan alasan pembatalan.
 */
export async function batalkanPerubahanKategori(
  isian: Cakupan & { alasan: string; idPengguna: string },
): Promise<HasilPerubahanKategori> {
  const alasan = isian.alasan.trim();
  if (alasan === "") return { keadaan: "gagal", pesan: "Alasan pembatalan wajib diisi." };

  return db.transaction(async (tx) => {
    await kunciPerubahanKategori(tx);
    const dibatalkan = await tx
      .update(perubahanKategori)
      .set({ status: "dibatalkan", dibatalkanOleh: isian.idPengguna, dibatalkanPada: sql`now()`, alasanPembatalan: alasan })
      .where(and(milikCakupan(isian), eq(perubahanKategori.status, "aktif")))
      .returning({ id: perubahanKategori.id });
    if (dibatalkan.length === 0) {
      return { keadaan: "gagal", pesan: "Tidak ada perubahan aktif untuk cakupan ini. Muat ulang halaman, lalu periksa lagi." };
    }
    await naikkanRevisiKalender(tx);
    return { keadaan: "berhasil" };
  });
}

/** Perubahan aktif yang berlaku untuk satu cakupan pada satu tanggal (revisi aktif terbaru), siap tampil di form admin. */
export type PerubahanKategoriBerlaku = {
  idToko: number | null;
  namaToko: string | null;
  kategoriSebelum: KategoriDasar;
  kategoriSesudah: KategoriDasar;
  alasan: string;
  revisi: number;
  dibuatOleh: string;
  dibuatPada: Date;
};

/** Revisi aktif terbaru per cakupan pada `tanggal`: seluruh toko dahulu, lalu per toko urut nama. */
export async function muatPerubahanKategoriTanggal(tanggal: TanggalBisnis): Promise<PerubahanKategoriBerlaku[]> {
  const baris = await db
    .selectDistinctOn([perubahanKategori.tokoId], {
      idToko: perubahanKategori.tokoId,
      namaToko: toko.nama,
      kategoriSebelum: perubahanKategori.kategoriSebelum,
      kategoriSesudah: perubahanKategori.kategoriSesudah,
      alasan: perubahanKategori.alasan,
      revisi: perubahanKategori.revisi,
      dibuatOleh: user.name,
      dibuatPada: perubahanKategori.dibuatPada,
    })
    .from(perubahanKategori)
    .innerJoin(user, eq(user.id, perubahanKategori.dibuatOleh))
    .leftJoin(toko, eq(toko.id, perubahanKategori.tokoId))
    .where(and(eq(perubahanKategori.tanggal, tanggal), eq(perubahanKategori.status, "aktif")))
    .orderBy(asc(perubahanKategori.tokoId), sql`${perubahanKategori.revisi} desc`);
  return baris.sort((a, b) => (a.namaToko === null ? -1 : b.namaToko === null ? 1 : a.namaToko.localeCompare(b.namaToko)));
}

/** Toko aktif untuk pilihan cakupan di form perubahan kategori. */
export async function daftarTokoAktif(): Promise<{ id: number; nama: string }[]> {
  return db.select({ id: toko.id, nama: toko.nama }).from(toko).where(eq(toko.aktif, true)).orderBy(asc(toko.nama));
}
