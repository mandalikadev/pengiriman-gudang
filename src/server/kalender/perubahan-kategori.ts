import { and, asc, desc, eq, inArray, isNull, max, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { parseTanggalBisnis, type KategoriDasar, type TanggalBisnis } from "@/domain/kalender";
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

/** Kategori satu tanggal untuk cakupan yang sedang dilihat di Kalender (T43). */
export type KategoriTanggalCakupan = {
  kategoriEfektif: KategoriDasar;
  /** Perubahan aktif yang menentukan kategori efektif, atau `null` bila kategori efektif = kategori dasar. */
  perubahan: PerubahanKategoriBerlaku | null;
};

/**
 * Kategori efektif setiap tanggal untuk satu cakupan tampilan Kalender (PRD B4). `idToko` `null` = "Semua toko": hanya
 * perubahan seluruh toko yang dipakai. Satu toko: perubahan khusus toko itu → perubahan seluruh toko → kategori dasar.
 * Perubahan khusus toko lain tidak pernah ikut dibaca. Urutannya ditentukan `kategoriEfektif` di domain.
 */
export async function muatKategoriEfektifCakupan(
  daftarTanggal: readonly TanggalBisnis[],
  idToko: number | null,
): Promise<Map<TanggalBisnis, KategoriTanggalCakupan>> {
  const hasil = new Map<TanggalBisnis, KategoriTanggalCakupan>();
  if (daftarTanggal.length === 0) return hasil;

  const baris = await db
    .select({
      id: perubahanKategori.id,
      tanggal: perubahanKategori.tanggal,
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
    .where(
      and(
        inArray(perubahanKategori.tanggal, [...daftarTanggal]),
        eq(perubahanKategori.status, "aktif"),
        idToko === null ? isNull(perubahanKategori.tokoId) : or(isNull(perubahanKategori.tokoId), eq(perubahanKategori.tokoId, idToko)),
      ),
    )
    .orderBy(asc(perubahanKategori.id));

  const perId = new Map(baris.map((b) => [String(b.id), b]));
  const daftar: PerubahanKategori[] = baris.map((b) => ({
    id: String(b.id),
    tanggal: parseTanggalBisnis(b.tanggal),
    cakupan: b.idToko === null ? { jenis: "semua-toko" } : { jenis: "toko", toko: String(b.idToko) },
    kategoriBaru: b.kategoriSesudah,
    revisi: b.revisi,
    status: "aktif",
  }));

  for (const tanggal of daftarTanggal) {
    const { kategoriEfektif: kategori, sumberKategori } = kategoriEfektif(tanggal, idToko === null ? "" : String(idToko), daftar);
    const sumber = perId.get(sumberKategori);
    hasil.set(tanggal, {
      kategoriEfektif: kategori,
      perubahan: sumber
        ? {
            idToko: sumber.idToko,
            namaToko: sumber.namaToko,
            kategoriSebelum: sumber.kategoriSebelum,
            kategoriSesudah: sumber.kategoriSesudah,
            alasan: sumber.alasan,
            revisi: sumber.revisi,
            dibuatOleh: sumber.dibuatOleh,
            dibuatPada: sumber.dibuatPada,
          }
        : null,
    });
  }
  return hasil;
}

/** Satu revisi perubahan kategori yang sudah dibatalkan, untuk riwayat di detail tanggal Kalender (T71). */
export type PerubahanKategoriDibatalkan = PerubahanKategoriBerlaku & {
  id: number;
  dibatalkanOleh: string;
  dibatalkanPada: Date;
  alasanPembatalan: string;
};

/**
 * Riwayat perubahan kategori yang dibatalkan pada `tanggal` untuk satu cakupan tampilan (PRD B4 ▶ Keputusan
 * 2026-10-10, T43). `idToko` `null` = "Semua toko": hanya pembatalan perubahan seluruh toko. Satu toko: pembatalan
 * perubahan toko itu dan perubahan seluruh toko. Setiap revisi yang dibatalkan menjadi satu entri, terbaru dahulu.
 * Riwayat ini tidak ikut menentukan kategori efektif.
 */
export async function muatRiwayatDibatalkanCakupan(
  tanggal: TanggalBisnis,
  idToko: number | null,
): Promise<PerubahanKategoriDibatalkan[]> {
  const pembatal = alias(user, "pembatal");
  const baris = await db
    .select({
      id: perubahanKategori.id,
      idToko: perubahanKategori.tokoId,
      namaToko: toko.nama,
      kategoriSebelum: perubahanKategori.kategoriSebelum,
      kategoriSesudah: perubahanKategori.kategoriSesudah,
      alasan: perubahanKategori.alasan,
      revisi: perubahanKategori.revisi,
      dibuatOleh: user.name,
      dibuatPada: perubahanKategori.dibuatPada,
      dibatalkanOleh: pembatal.name,
      dibatalkanPada: perubahanKategori.dibatalkanPada,
      alasanPembatalan: perubahanKategori.alasanPembatalan,
    })
    .from(perubahanKategori)
    .innerJoin(user, eq(user.id, perubahanKategori.dibuatOleh))
    .innerJoin(pembatal, eq(pembatal.id, perubahanKategori.dibatalkanOleh))
    .leftJoin(toko, eq(toko.id, perubahanKategori.tokoId))
    .where(
      and(
        eq(perubahanKategori.tanggal, tanggal),
        eq(perubahanKategori.status, "dibatalkan"),
        idToko === null ? isNull(perubahanKategori.tokoId) : or(isNull(perubahanKategori.tokoId), eq(perubahanKategori.tokoId, idToko)),
      ),
    )
    .orderBy(desc(perubahanKategori.dibatalkanPada), desc(perubahanKategori.revisi), desc(perubahanKategori.id));

  // Constraint tabel menjamin kolom pembatalan terisi untuk status `dibatalkan`; baris yang tidak lengkap dilewati.
  return baris.flatMap(({ dibatalkanPada, alasanPembatalan, ...b }) =>
    dibatalkanPada !== null && alasanPembatalan !== null ? [{ ...b, dibatalkanPada, alasanPembatalan }] : [],
  );
}
