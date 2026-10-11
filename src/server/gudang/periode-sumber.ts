import { asc, desc, eq, type SQL } from "drizzle-orm";

import { db } from "@/server/db";
import type { Tx } from "@/server/impor/antrean";
import { gudang, periodeSumberGudang, user } from "@/server/db/schema";
import { bulanLaporanTersedia, idVersiCacheAktif } from "@/server/laporan/cache";

// Periode sumber gudang (T51, PRD A4, ADR-0003): admin menetapkan 1–12 bulan laporan per gudang; semua operator
// gudang itu memakainya. Terpisah dari filter Ringkasan (yang hanya hidup di URL halaman Ringkasan). Belum
// ditetapkan = `null`; sistem tidak memilih periode cadangan.

const MAKS_BULAN = 12;

/** Periode sumber yang berlaku untuk satu gudang. */
export type PeriodeSumber = {
  /**
   * Versi periode sumber gudang = id penetapan yang berlaku. Berubah (naik) setiap kali admin mengubah periode, jadi
   * hasil yang menyimpan versi ini bisa dibandingkan dengan versi saat ini untuk tahu apakah periodenya sudah berubah.
   */
  versi: number;
  /** Bulan laporan `YYYY-MM`, urut naik. */
  bulan: string[];
  /** Nama admin yang menetapkan. */
  ditetapkanOleh: string;
  ditetapkanPada: Date;
};

export type PeriodeSumberPerGudang = PeriodeSumber & { idGudang: number };

/**
 * Periode sumber yang dipakai perhitungan (PRD A4 ▶ Keputusan 2026-10-10, T51): bulan periode yang tidak ada di bulan
 * laporan cache aktif ("bulan tanpa data aktif") tidak ikut dipakai. Periode yang tersimpan tidak diubah.
 */
export type PeriodeSumberPerhitungan = Omit<PeriodeSumber, "bulan"> & {
  /** Bulan periode yang masih punya data aktif, urut naik. Bisa kosong bila semua bulan hilang. */
  bulanDipakai: string[];
  /** Bulan periode yang tidak ada di bulan laporan cache aktif, urut naik. */
  bulanHilang: string[];
};

/** Penetapan terbaru per gudang (yang berlaku), urut id gudang. */
function periodeBerlaku(kondisi?: SQL, klien: typeof db | Tx = db) {
  return klien
    .selectDistinctOn([periodeSumberGudang.gudangId], {
      idGudang: periodeSumberGudang.gudangId,
      versi: periodeSumberGudang.id,
      bulan: periodeSumberGudang.bulan,
      ditetapkanOleh: user.name,
      ditetapkanPada: periodeSumberGudang.ditetapkanPada,
    })
    .from(periodeSumberGudang)
    .innerJoin(user, eq(user.id, periodeSumberGudang.ditetapkanOleh))
    .where(kondisi)
    .orderBy(asc(periodeSumberGudang.gudangId), desc(periodeSumberGudang.id));
}

/**
 * Periode sumber yang dipakai perhitungan gudang `idGudang`, atau `null` bila admin belum menetapkannya (perhitungan
 * tidak berjalan; tidak ada periode cadangan). Pemeriksaan akses dilakukan pemanggil.
 */
export async function bacaPeriodeSumber(idGudang: number, klien: typeof db | Tx = db): Promise<PeriodeSumber | null> {
  const [baris] = await periodeBerlaku(eq(periodeSumberGudang.gudangId, idGudang), klien);
  if (!baris) return null;
  return { versi: baris.versi, bulan: baris.bulan, ditetapkanOleh: baris.ditetapkanOleh, ditetapkanPada: baris.ditetapkanPada };
}

/**
 * Periode sumber gudang `idGudang` untuk perhitungan: bulan dipakai (masih ada di bulan laporan cache aktif) dan bulan
 * hilang, beserta versi dan siapa/kapan menetapkan. `null` bila admin belum menetapkan periode. Periode dan bulan cache
 * aktif dibaca dalam satu snapshot agar keduanya konsisten. Pemeriksaan akses dilakukan pemanggil.
 */
export async function bacaPeriodeSumberPerhitungan(idGudang: number): Promise<PeriodeSumberPerhitungan | null> {
  return db.transaction(
    async (tx) => {
      const [baris] = await periodeBerlaku(eq(periodeSumberGudang.gudangId, idGudang), tx);
      if (!baris) return null;
      const versiCache = await idVersiCacheAktif(tx);
      const tersedia = new Set(versiCache === null ? [] : await bulanLaporanTersedia(tx, versiCache));
      return {
        versi: baris.versi,
        bulanDipakai: baris.bulan.filter((b) => tersedia.has(b)),
        bulanHilang: baris.bulan.filter((b) => !tersedia.has(b)),
        ditetapkanOleh: baris.ditetapkanOleh,
        ditetapkanPada: baris.ditetapkanPada,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** Periode sumber yang berlaku untuk setiap gudang yang sudah ditetapkan (halaman admin). */
export async function daftarPeriodeSumber(): Promise<PeriodeSumberPerGudang[]> {
  return periodeBerlaku();
}

/** Bulan laporan yang tersedia di data (cache laporan aktif), urut naik. Kosong bila belum ada cache. */
export async function bulanTersediaUntukPeriode(): Promise<string[]> {
  const versiId = await idVersiCacheAktif();
  return versiId === null ? [] : bulanLaporanTersedia(db, versiId);
}

export type HasilTetapkanPeriode = { keadaan: "berhasil"; versi: number } | { keadaan: "gagal"; pesan: string };

function periksaBulan(bulan: readonly string[], tersedia: readonly string[]): string | null {
  if (bulan.length === 0) return "Pilih minimal satu bulan.";
  if (bulan.length > MAKS_BULAN) return `Pilih paling banyak ${MAKS_BULAN} bulan.`;
  if (new Set(bulan).size !== bulan.length) return "Bulan pilihan tidak boleh ganda.";
  const adaDiData = new Set(tersedia);
  if (bulan.some((b) => !adaDiData.has(b))) {
    return "Ada bulan yang tidak tersedia di data. Muat ulang halaman, lalu pilih lagi.";
  }
  return null;
}

/**
 * Menetapkan periode sumber gudang `idGudang`: 1–12 bulan laporan dari bulan yang tersedia di data, boleh tidak
 * berurutan. Penetapan lama tetap tersimpan sebagai riwayat. Bila bulannya sama dengan periode yang berlaku, tidak
 * ada penetapan baru (versi tidak berubah). Kewenangan admin diperiksa pemanggil (server action).
 */
export async function tetapkanPeriodeSumber({
  idGudang,
  bulan,
  idPengguna,
}: {
  idGudang: number;
  bulan: readonly string[];
  idPengguna: string;
}): Promise<HasilTetapkanPeriode> {
  const pesan = periksaBulan(bulan, await bulanTersediaUntukPeriode());
  if (pesan !== null) return { keadaan: "gagal", pesan };
  const bulanUrut = [...bulan].sort();

  return db.transaction(async (tx) => {
    // Mengunci baris gudang agar penetapan bersamaan untuk gudang yang sama berjalan bergantian.
    const [tujuan] = await tx.select({ id: gudang.id }).from(gudang).where(eq(gudang.id, idGudang)).for("update");
    if (!tujuan) return { keadaan: "gagal", pesan: "Gudang tidak ditemukan." };

    const [berlaku] = await tx
      .select({ versi: periodeSumberGudang.id, bulan: periodeSumberGudang.bulan })
      .from(periodeSumberGudang)
      .where(eq(periodeSumberGudang.gudangId, idGudang))
      .orderBy(desc(periodeSumberGudang.id))
      .limit(1);
    if (berlaku && berlaku.bulan.join() === bulanUrut.join()) return { keadaan: "berhasil", versi: berlaku.versi };

    const [baru] = await tx
      .insert(periodeSumberGudang)
      .values({ gudangId: idGudang, bulan: bulanUrut, ditetapkanOleh: idPengguna })
      .returning({ versi: periodeSumberGudang.id });
    return { keadaan: "berhasil", versi: baru.versi };
  });
}
