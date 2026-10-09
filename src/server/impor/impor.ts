import { randomUUID } from "node:crypto";

import { and, eq, ne, sql } from "drizzle-orm";

import { klasifikasiProduk } from "@/domain/produk";
import { db } from "@/server/db";
import { impor, produk, type StatusImpor } from "@/server/db/schema";

import { kirimJobProsesImpor } from "./antrean";
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

/**
 * Mendaftarkan file yang sudah ada di storage sebagai impor berstatus `diunggah` dan mengirim job worker
 * dalam satu transaksi.
 */
export async function daftarkanImpor(masukan: MasukanDaftar): Promise<{ keadaan: "berhasil"; idImpor: number } | HasilGagal> {
  if (sheetDiLuarCakupan(masukan.namaSheet)) {
    return { keadaan: "gagal", pesan: "Sheet MP di luar cakupan saat ini. Pilih sheet penjualan <BULAN> (S)." };
  }
  if (!POLA_KUNCI.test(masukan.kunci)) {
    return { keadaan: "gagal", pesan: "File unggahan tidak dikenal. Unggah ulang file-nya." };
  }
  const ukuran = await ukuranObjek(masukan.kunci);
  if (ukuran === null) return { keadaan: "gagal", pesan: "File belum ada di storage. Unggah ulang file-nya." };

  return db.transaction(async (tx) => {
    const [baris] = await tx
      .insert(impor)
      .values({
        namaFile: masukan.namaFile,
        ukuranByte: ukuran,
        kunciObjek: masukan.kunci,
        namaSheet: masukan.namaSheet,
        tahunImpor: masukan.tahunImpor,
        bulanImpor: masukan.bulanImpor,
        diunggahOleh: masukan.idPengguna,
      })
      .onConflictDoNothing({ target: impor.kunciObjek })
      .returning({ id: impor.id });
    if (!baris) return { keadaan: "gagal", pesan: "File ini sudah didaftarkan sebagai impor." } as const;
    await kirimJobProsesImpor(tx, baris.id);
    return { keadaan: "berhasil", idImpor: baris.id } as const;
  });
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
 * diarsipkan, produk baru didaftarkan dengan keluarga aroma `belum-dipetakan` (ADR-0006), lalu impor ini aktif.
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
        .onConflictDoNothing({ target: produk.kode });
    }

    await tx
      .update(impor)
      .set({ status: "aktif", diaktifkanOleh: idPengguna, diaktifkanPada: sql`now()` })
      .where(eq(impor.id, target.id));
    return { keadaan: "berhasil" };
  });
}
