import { createHash } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { cakupanTanggalImpor, impor, selPenjualan, toko } from "@/server/db/schema";

import { ambilObjek } from "./penyimpanan";
import { bacaSheetPenjualan } from "./sheet-penjualan";

// Handler job worker (issue T11): membaca dan memvalidasi satu sheet (T10), lalu menyimpan hasilnya sebagai
// staging dengan kunci impor_id. Tidak menyentuh impor aktif: impor baru menjadi sumber laporan hanya lewat aktivasi.

const UKURAN_BATCH = 2000;

class GagalProses extends Error {}

function potong<T>(daftar: T[], ukuran: number): T[][] {
  const hasil: T[][] = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

/**
 * Memproses satu impor berstatus `diunggah` (atau `diproses`, bila job diulang setelah worker berhenti).
 * Error validasi sheet tetap berakhir `siap-ditinjau` beserta daftar masalahnya; `gagal` hanya untuk
 * file yang tidak bisa diambil atau dibaca.
 */
export async function prosesImpor(idImpor: number): Promise<void> {
  const [klaim] = await db
    .update(impor)
    .set({ status: "diproses" })
    .where(and(eq(impor.id, idImpor), inArray(impor.status, ["diunggah", "diproses"])))
    .returning();
  if (!klaim) return;

  try {
    const isi = await ambilObjek(klaim.kunciObjek);
    if (!isi) throw new GagalProses("File tidak ditemukan di storage. Unggah ulang file-nya.");
    const sha256 = createHash("sha256").update(isi).digest("hex");

    const daftarToko = await db.select({ id: toko.id, nama: toko.nama }).from(toko);
    let hasil: ReturnType<typeof bacaSheetPenjualan>;
    try {
      hasil = bacaSheetPenjualan({
        workbook: isi,
        namaSheet: klaim.namaSheet,
        tahunImpor: klaim.tahunImpor,
        bulanImpor: klaim.bulanImpor,
        namaTokoMaster: daftarToko.map((t) => t.nama),
      });
    } catch {
      throw new GagalProses("File tidak bisa dibaca sebagai workbook Excel. Periksa file-nya, lalu unggah ulang.");
    }

    // Pembaca mengembalikan nama master untuk toko yang dikenal; blok toko tak dikenal sudah menjadi error.
    const idToko = new Map(daftarToko.map((t) => [t.nama, t.id]));
    const cakupan = hasil.blokToko.flatMap((blok) => {
      const id = idToko.get(blok.namaToko);
      if (id === undefined) return [];
      return blok.kolomTanggal.flatMap((k) =>
        k.status === "valid" ? [{ imporId: idImpor, tokoId: id, tanggal: k.tanggal, alamatKolom: k.alamat }] : [],
      );
    });
    const sel = hasil.selBernilai.flatMap((s) => {
      const id = idToko.get(s.namaToko);
      if (id === undefined) return [];
      return [{ imporId: idImpor, tokoId: id, kodeProduk: s.kodeProduk, tanggal: s.tanggal, kuantitas: s.kuantitas, alamat: s.alamat }];
    });

    await db.transaction(async (tx) => {
      await tx.delete(cakupanTanggalImpor).where(eq(cakupanTanggalImpor.imporId, idImpor));
      await tx.delete(selPenjualan).where(eq(selPenjualan.imporId, idImpor));
      for (const batch of potong(cakupan, UKURAN_BATCH)) await tx.insert(cakupanTanggalImpor).values(batch);
      for (const batch of potong(sel, UKURAN_BATCH)) await tx.insert(selPenjualan).values(batch);
      await tx
        .update(impor)
        .set({
          status: "siap-ditinjau",
          sha256,
          masalah: hasil.masalah,
          produk: hasil.produk,
          pesanGagal: null,
          selesaiDiprosesPada: new Date(),
        })
        .where(and(eq(impor.id, idImpor), eq(impor.status, "diproses")));
    });
  } catch (galat) {
    const pesan =
      galat instanceof GagalProses ? galat.message : "Terjadi kesalahan saat memproses file. Coba unggah ulang.";
    if (!(galat instanceof GagalProses)) console.error(`[proses-impor] impor ${idImpor}:`, galat);
    await db
      .update(impor)
      .set({ status: "gagal", pesanGagal: pesan, selesaiDiprosesPada: new Date() })
      .where(and(eq(impor.id, idImpor), eq(impor.status, "diproses")));
  }
}
