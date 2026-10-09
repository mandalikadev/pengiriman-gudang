import { randomInt, randomUUID } from "node:crypto";

import * as XLSX from "xlsx";

import { daftarkanImpor, kunciObjekBaru } from "./impor";
import { buatUrlUnggah } from "./penyimpanan";
import { prosesImpor } from "./proses";

// Bantuan khusus test: workbook kecil buatan sendiri (CODING_STANDARDS: data bisnis asli tidak di-commit).

type Sel = string | number | null;

export type ProdukUji = { kode: string; nama: string; ukuran: string; kategori: string; kuantitas: Sel[] };

/** Tahun impor acak agar impor aktif buatan test lain (dan run sebelumnya) tidak bertabrakan. */
export function tahunUji() {
  return randomInt(3000, 9000);
}

export function kodeProdukUji(akhiran = "GOR") {
  return `UJI${randomUUID().slice(0, 8).toUpperCase()}-${akhiran}`;
}

/**
 * Sheet penjualan satu blok toko mulai kolom F, dengan header tanggal `DD/MM` (tahun = tahun impor).
 * `hari` = tanggal-tanggal kolom; `kuantitas` per produk sejajar dengan `hari`.
 */
export function sheetPenjualanUji({ toko, bulan, hari, produk }: { toko: string; bulan: number; hari: (number | string)[]; produk: ProdukUji[] }): Sel[][] {
  const header = hari.map((h) => (typeof h === "string" ? h : `${h}/${bulan}`));
  return [
    ["SALES", null, null, null, "TOKO :", toko],
    [null, null, null, null, "TANGGAL :", ...header],
    ["NO", "PRODUCT CODE", "PRODUCT NAME", "SIZE", "PRODUCT CATEGORY", ...header.map(() => null)],
    ...produk.map((p, i) => [i + 1, p.kode, p.nama, p.ukuran, p.kategori, ...p.kuantitas]),
  ];
}

export function buatWorkbookUji(sheet: Record<string, Sel[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [nama, baris] of Object.entries(sheet)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(baris), nama);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Unggah lewat presigned URL dan daftarkan impor langsung di lapisan server (tanpa server action). */
export async function imporUji({
  isi,
  namaSheet = "JUNI (S)",
  tahunImpor,
  bulanImpor = 6,
  idPengguna,
  proses = true,
}: {
  isi: Uint8Array;
  namaSheet?: string;
  tahunImpor: number;
  bulanImpor?: number;
  idPengguna: string;
  proses?: boolean;
}) {
  const kunci = kunciObjekBaru();
  const jawaban = await fetch(await buatUrlUnggah(kunci), { method: "PUT", body: Buffer.from(isi) });
  if (!jawaban.ok) throw new Error(`Unggah uji gagal: ${jawaban.status}`);
  const hasil = await daftarkanImpor({ kunci, namaFile: "penjualan-uji.xlsx", namaSheet, tahunImpor, bulanImpor, idPengguna });
  if (hasil.keadaan !== "berhasil") throw new Error(hasil.pesan);
  if (proses) await prosesImpor(hasil.idImpor);
  return hasil.idImpor;
}
