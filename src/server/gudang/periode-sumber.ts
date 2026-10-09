import { asc, desc, eq, type SQL } from "drizzle-orm";

import { db } from "@/server/db";
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

/** Penetapan terbaru per gudang (yang berlaku), urut id gudang. */
function periodeBerlaku(kondisi?: SQL) {
  return db
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
export async function bacaPeriodeSumber(idGudang: number): Promise<PeriodeSumber | null> {
  const [baris] = await periodeBerlaku(eq(periodeSumberGudang.gudangId, idGudang));
  if (!baris) return null;
  return { versi: baris.versi, bulan: baris.bulan, ditetapkanOleh: baris.ditetapkanOleh, ditetapkanPada: baris.ditetapkanPada };
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
