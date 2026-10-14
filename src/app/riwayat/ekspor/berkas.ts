import * as XLSX from "xlsx";

import { formatWaktu, tanggalWib } from "@/app/admin/impor/format";
import {
  KETERANGAN_TIDAK_TERSEDIA,
  KOLOM_PRODUK_EKSPOR,
  selProdukEkspor,
  TIDAK_TERSEDIA,
  type Sel,
} from "@/app/pengiriman-gudang/[id]/rencana-final/[idRencana]/ekspor/berkas";
import { teksJenisPengiriman } from "@/app/pengiriman-gudang/[id]/teks-di-luar-jadwal";
import { labelJenisPengiriman, labelStatusPengiriman } from "@/app/usulan-jadwal/tampilan-pengiriman";
import { formatTanggal, type TanggalBisnis } from "@/domain/kalender";
import type { EntriPengirimanDiLuarJadwal } from "@/server/gudang/pengiriman-di-luar-jadwal";
import { labelPersiapan, persiapanDariHari } from "@/server/gudang/pilihan-jadwal";
import type { BarisProdukRencanaFinal, RingkasanRencanaFinal } from "@/server/gudang/rencana-final";

// Berkas ekspor halaman Riwayat (T129; PRD A7 ▶ Keputusan 2026-10-14): satu file, satu sheet, untuk tab yang dibuka dan
// seluruh hasil filter. Di atas tabel ada baris keterangan (jenis riwayat, filter yang diterapkan, waktu ekspor, arti
// tanda tidak tersedia). Tab Rencana final: satu baris per produk per rencana final, angka dari snapshot, dengan kolom
// tabel produk dan tanda tidak tersedia yang sama dengan ekspor satu rencana final (T64). Tab Di luar jadwal: satu baris
// per pengiriman dengan isian catatan aktivitas PRD A5.

export type JenisRiwayat = "rencana-final" | "di-luar-jadwal";

const judulRiwayat: Record<JenisRiwayat, { jenis: string; sheet: string }> = {
  "rencana-final": { jenis: "Rencana final", sheet: "Riwayat rencana final" },
  "di-luar-jadwal": { jenis: "Di luar jadwal", sheet: "Riwayat di luar jadwal" },
};

/** Filter yang diterapkan, siap tulis: nama gudang/toko atau "Semua …", rentang tanggal kirim, dan kata cari. */
export type KeteranganEkspor = {
  gudang: string;
  toko: string;
  /** Ujung rentang tanggal kirim; `null` = tidak dibatasi di ujung itu. */
  dari: TanggalBisnis | null;
  sampai: TanggalBisnis | null;
  cari: string;
  /** Nama gudang yang barisnya tidak ikut karena pengekspor tidak punya hak `ekspor` di sana. */
  gudangTidakIkut: readonly string[];
  waktuEkspor: Date;
};

function teksRentang({ dari, sampai }: Pick<KeteranganEkspor, "dari" | "sampai">) {
  if (dari !== null && sampai !== null) return `${formatTanggal(dari)} sampai ${formatTanggal(sampai)}`;
  if (dari !== null) return `Mulai ${formatTanggal(dari)}`;
  if (sampai !== null) return `Sampai ${formatTanggal(sampai)}`;
  return "Semua tanggal";
}

function barisKeterangan(jenis: JenisRiwayat, k: KeteranganEkspor): Sel[][] {
  return [
    [`Riwayat ${judulRiwayat[jenis].jenis.toLowerCase()}`],
    ["Jenis riwayat", judulRiwayat[jenis].jenis],
    ["Gudang", k.gudang],
    ...(k.gudangTidakIkut.length === 0 ? [] : [["Tidak ikut diekspor (tanpa hak ekspor)", k.gudangTidakIkut.join(", ")]]),
    ["Toko", k.toko],
    ["Tanggal kirim", teksRentang(k)],
    ["Cari toko", k.cari === "" ? TIDAK_TERSEDIA : k.cari],
    ["Waktu ekspor", formatWaktu(k.waktuEkspor)],
    ["Keterangan", KETERANGAN_TIDAK_TERSEDIA],
    [],
  ];
}

function tulis(jenis: JenisRiwayat, k: KeteranganEkspor, kolom: readonly string[], isi: Sel[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...barisKeterangan(jenis, k), [...kolom], ...isi]), judulRiwayat[jenis].sheet);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Nama berkas, mis. `riwayat-rencana-final-2026-10-14.xlsx` (tanggal ekspor, WIB). */
export function namaBerkasEksporRiwayat(jenis: JenisRiwayat, waktuEkspor: Date) {
  return `riwayat-${jenis}-${tanggalWib(waktuEkspor)}.xlsx`;
}

const KOLOM_RENCANA_FINAL: readonly string[] = [
  "Gudang",
  "Tanggal kirim",
  "Toko",
  "Versi",
  "Berlaku",
  "Jenis pengiriman",
  "Difinalisasi oleh",
  "Waktu finalisasi",
  ...KOLOM_PRODUK_EKSPOR,
];

/** Sheet tab Rencana final: satu baris per produk per rencana final, urut `daftar` lalu kode produk. */
export function buatBerkasRiwayatRencanaFinal(
  daftar: readonly RingkasanRencanaFinal[],
  barisProduk: ReadonlyMap<number, readonly BarisProdukRencanaFinal[]>,
  keterangan: KeteranganEkspor,
): Buffer {
  const isi = daftar.flatMap((r) => {
    const rencana: Sel[] = [
      r.gudang.nama,
      formatTanggal(r.tanggalKirim),
      r.toko.nama,
      r.versi,
      r.digantikanOlehVersi === null ? "Ya" : `Digantikan oleh versi ${r.digantikanOlehVersi}`,
      teksJenisPengiriman(r.diLuarJadwal),
      r.difinalisasiOleh,
      formatWaktu(r.difinalisasiPada),
    ];
    return (barisProduk.get(r.id) ?? []).map((b) => [...rencana, ...selProdukEkspor(b)]);
  });
  return tulis("rencana-final", keterangan, KOLOM_RENCANA_FINAL, isi);
}

const KOLOM_DI_LUAR_JADWAL: readonly string[] = [
  "Gudang",
  "Jenis",
  "Toko",
  "Tanggal kirim",
  "Persiapan",
  "Tanggal rutin yang dipindah",
  "Alasan",
  "Status",
  "Pengusul",
  "Waktu usul",
  "Penyetuju/penolak",
  "Waktu keputusan",
  "Alasan penolakan",
  "Ditarik/dibatalkan oleh",
  "Waktu penarikan/pembatalan",
  "Alasan penarikan/pembatalan",
];

const waktuAtauTidakTersedia = (waktu: Date | null): Sel => (waktu === null ? TIDAK_TERSEDIA : formatWaktu(waktu));

/** Penyetuju/penolak; langsung berlaku di Pusat ditulis seperti di tabel riwayat (T113). */
function teksPemutus(e: EntriPengirimanDiLuarJadwal): string {
  if (e.pemutus !== null) return e.pemutus;
  if (e.gudangPusat && (e.status === "berlaku" || e.status === "dibatalkan")) return "Langsung berlaku (Pusat)";
  return TIDAK_TERSEDIA;
}

/** Penarikan (oleh pengusul, tanpa alasan) atau pembatalan (oleh admin/operator, atau otomatis oleh sistem). */
function penghentian(e: EntriPengirimanDiLuarJadwal): [Sel, Sel, Sel] {
  if (e.status === "ditarik") return [e.pengusul, waktuAtauTidakTersedia(e.ditarikPada), TIDAK_TERSEDIA];
  if (e.status === "dibatalkan") {
    return [e.pembatal ?? "Otomatis oleh sistem", waktuAtauTidakTersedia(e.dibatalkanPada), e.alasanPembatalan ?? TIDAK_TERSEDIA];
  }
  return [TIDAK_TERSEDIA, TIDAK_TERSEDIA, TIDAK_TERSEDIA];
}

/** Sheet tab Di luar jadwal: satu baris per pengiriman, urut `daftar` (terbaru di atas). */
export function buatBerkasRiwayatDiLuarJadwal(daftar: readonly EntriPengirimanDiLuarJadwal[], keterangan: KeteranganEkspor): Buffer {
  const isi = daftar.map((e): Sel[] => [
    e.gudang,
    labelJenisPengiriman[e.jenis],
    e.toko,
    formatTanggal(e.tanggalKirim),
    labelPersiapan[persiapanDariHari[e.persiapanHari]],
    e.tanggalRutinDipindah === null ? TIDAK_TERSEDIA : formatTanggal(e.tanggalRutinDipindah),
    e.alasan,
    labelStatusPengiriman(e.status),
    e.pengusul,
    formatWaktu(e.diusulkanPada),
    teksPemutus(e),
    waktuAtauTidakTersedia(e.diputuskanPada),
    e.alasanPenolakan ?? TIDAK_TERSEDIA,
    ...penghentian(e),
  ]);
  return tulis("di-luar-jadwal", keterangan, KOLOM_DI_LUAR_JADWAL, isi);
}
