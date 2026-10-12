import { randomUUID } from "node:crypto";

import { and, eq, ne, sql } from "drizzle-orm";

import { klasifikasiProduk } from "@/domain/produk";
import { db } from "@/server/db";
import { impor, produk, type StatusImpor } from "@/server/db/schema";

import { kirimJobHitungCacheLaporan, kirimJobProsesImpor } from "./antrean";
import { ukuranObjek } from "./penyimpanan";

// Siklus impor (issue T11, ADR-0002): daftarkan → (worker) → aktifkan. Pemeriksaan peran ada di server action.

const AWALAN_KUNCI = "impor/";
const POLA_KUNCI = /^impor\/[0-9a-f-]{36}$/;

export type HasilGagal = { keadaan: "gagal"; pesan: string };

/** Kunci objek baru di storage untuk satu unggahan. */
export function kunciObjekBaru() {
  return `${AWALAN_KUNCI}${randomUUID()}`;
}

function sheetDiLuarCakupan(namaSheet: string) {
  return namaSheet.startsWith("MP ");
}

type MasukanDaftar = {
  kunci: string;
  namaFile: string;
  namaSheet: string;
  tahunImpor: number;
  bulanImpor: number;
  idPengguna: string;
};

type MasukanDaftarBanyakSheet = Omit<MasukanDaftar, "namaSheet" | "bulanImpor"> & {
  sheet: readonly { namaSheet: string; bulanImpor: number }[];
};

export type HasilDaftarSheet = { namaSheet: string } & ({ keadaan: "berhasil"; idImpor: number } | HasilGagal);

/** Mendaftarkan satu sheet dari satu file sebagai impor. Lihat `daftarkanImporBanyakSheet`. */
export async function daftarkanImpor(masukan: MasukanDaftar): Promise<{ keadaan: "berhasil"; idImpor: number } | HasilGagal> {
  const { namaSheet, bulanImpor, ...file } = masukan;
  const hasil = await daftarkanImporBanyakSheet({ ...file, sheet: [{ namaSheet, bulanImpor }] });
  if (hasil.keadaan === "gagal") return hasil;
  const [satu] = hasil.sheet;
  return satu.keadaan === "berhasil" ? { keadaan: "berhasil", idImpor: satu.idImpor } : { keadaan: "gagal", pesan: satu.pesan };
}

/**
 * Mendaftarkan beberapa sheet dari satu file yang sudah ada di storage (PRD A1, Keputusan 2026-10-12). Setiap sheet
 * menjadi satu impor berstatus `diunggah` beserta job worker-nya dalam satu transaksi tersendiri, sehingga sheet yang
 * gagal didaftarkan tidak membatalkan sheet lain. Hasil dikembalikan per sheet, sesuai urutan masukan.
 */
export async function daftarkanImporBanyakSheet(
  masukan: MasukanDaftarBanyakSheet,
): Promise<{ keadaan: "berhasil"; sheet: HasilDaftarSheet[] } | HasilGagal> {
  if (!POLA_KUNCI.test(masukan.kunci)) {
    return { keadaan: "gagal", pesan: "File unggahan tidak dikenal. Unggah ulang file-nya." };
  }
  const ukuran = await ukuranObjek(masukan.kunci);
  if (ukuran === null) return { keadaan: "gagal", pesan: "File belum ada di storage. Unggah ulang file-nya." };

  const hasil: HasilDaftarSheet[] = [];
  for (const { namaSheet, bulanImpor } of masukan.sheet) {
    hasil.push({ namaSheet, ...(await daftarkanSatuSheet({ ...masukan, ukuran, namaSheet, bulanImpor })) });
  }
  return { keadaan: "berhasil", sheet: hasil };
}

async function daftarkanSatuSheet(
  masukan: MasukanDaftar & { ukuran: number },
): Promise<{ keadaan: "berhasil"; idImpor: number } | HasilGagal> {
  if (sheetDiLuarCakupan(masukan.namaSheet)) {
    return { keadaan: "gagal", pesan: "Sheet MP di luar cakupan saat ini. Pilih sheet penjualan <BULAN> (S)." };
  }
  try {
    return await db.transaction(async (tx) => {
      const [baris] = await tx
        .insert(impor)
        .values({
          namaFile: masukan.namaFile,
          ukuranByte: masukan.ukuran,
          kunciObjek: masukan.kunci,
          namaSheet: masukan.namaSheet,
          tahunImpor: masukan.tahunImpor,
          bulanImpor: masukan.bulanImpor,
          diunggahOleh: masukan.idPengguna,
        })
        .onConflictDoNothing({ target: [impor.kunciObjek, impor.namaSheet] })
        .returning({ id: impor.id });
      if (!baris) return { keadaan: "gagal", pesan: "Sheet ini dari file yang sama sudah didaftarkan sebagai impor." } as const;
      await kirimJobProsesImpor(tx, baris.id);
      return { keadaan: "berhasil", idImpor: baris.id } as const;
    });
  } catch (galat) {
    // Transaksi sheet ini dibatalkan; sheet lain tetap diproses (hasil per sheet).
    console.error(`[daftarkan-impor] sheet ${masukan.namaSheet}:`, galat);
    return { keadaan: "gagal", pesan: "Sheet ini gagal didaftarkan karena kesalahan server. Periksa Daftar impor sebelum mencoba lagi." };
  }
}

/** Alasan impor tidak bisa diaktifkan, atau `null` jika bisa. Dipakai aktivasi dan tombol Aktifkan. */
export function alasanTidakBisaAktif({ status, jumlahError }: { status: StatusImpor; jumlahError: number }): string | null {
  switch (status) {
    case "diunggah":
    case "diproses":
      return "Impor ini belum selesai diproses. Tunggu sampai statusnya Siap ditinjau.";
    case "gagal":
      return "Impor ini gagal diproses dan tidak bisa diaktifkan. Unggah ulang file yang benar.";
    case "aktif":
      return "Impor ini sudah aktif.";
    case "diarsipkan":
      return "Impor ini sudah diarsipkan dan tidak bisa diaktifkan lagi.";
    case "siap-ditinjau":
      return jumlahError > 0
        ? `Tidak bisa diaktifkan: ada ${jumlahError} error. Perbaiki di Excel, lalu unggah ulang.`
        : null;
  }
}

/**
 * Mengaktifkan impor dalam satu transaksi (ADR-0002, CODING_STANDARDS): impor aktif lama untuk bulan yang sama
 * diarsipkan, produk baru didaftarkan dengan keluarga aroma `belum-dipetakan` (ADR-0006), produk yang sudah ada
 * diperbarui nama, ukuran, kategori, dan klasifikasinya (PRD A1, Keputusan 2026-10-09), lalu impor ini aktif dan
 * job hitung ulang cache laporan dikirim (T33).
 */
export async function aktifkanImpor(idImpor: number, idPengguna: string): Promise<{ keadaan: "berhasil" } | HasilGagal> {
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(impor).where(eq(impor.id, idImpor)).for("update");
    if (!target) return { keadaan: "gagal", pesan: "Impor tidak ditemukan." };
    const alasan = alasanTidakBisaAktif({
      status: target.status,
      jumlahError: target.masalah.filter((m) => m.tingkat === "error").length,
    });
    if (alasan) return { keadaan: "gagal", pesan: alasan };

    // Aktivasi bulan yang sama berjalan bergiliran.
    await tx.execute(sql`select pg_advisory_xact_lock(${target.tahunImpor * 100 + target.bulanImpor})`);

    await tx
      .update(impor)
      .set({ status: "diarsipkan", diarsipkanPada: sql`now()` })
      .where(
        and(
          eq(impor.tahunImpor, target.tahunImpor),
          eq(impor.bulanImpor, target.bulanImpor),
          eq(impor.status, "aktif"),
          ne(impor.id, target.id),
        ),
      );

    if (target.produk.length > 0) {
      await tx
        .insert(produk)
        .values(
          target.produk.map((p) => {
            const hasil = klasifikasiProduk(p.kodeProduk, p.kategoriProduk);
            return {
              kode: p.kodeProduk,
              nama: p.namaProduk,
              ukuran: p.ukuran,
              kategori: p.kategoriProduk,
              klasifikasi: hasil.klasifikasi,
              alasanManual: hasil.klasifikasi === "manual" ? hasil.alasan : null,
              didaftarkanOlehImporId: target.id,
            };
          }),
        )
        // PRD A1 (Keputusan 2026-10-09): master produk mengikuti impor yang terakhir diaktifkan. Kode tetap
        // identitas; status keluarga aroma dan impor pendaftar tidak diubah.
        .onConflictDoUpdate({
          target: produk.kode,
          set: {
            nama: sql`excluded.nama`,
            ukuran: sql`excluded.ukuran`,
            kategori: sql`excluded.kategori`,
            klasifikasi: sql`excluded.klasifikasi`,
            alasanManual: sql`excluded.alasan_manual`,
          },
        });
    }

    await tx
      .update(impor)
      .set({ status: "aktif", diaktifkanOleh: idPengguna, diaktifkanPada: sql`now()` })
      .where(eq(impor.id, target.id));
    await kirimJobHitungCacheLaporan(tx);
    return { keadaan: "berhasil" };
  });
}
