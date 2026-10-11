import * as XLSX from "xlsx";

import { formatAngka, formatBulanImpor, formatBulanLaporan, formatWaktu } from "@/app/admin/impor/format";
import { formatTanggal } from "@/domain/kalender";
import type { RencanaFinal } from "@/server/gudang/rencana-final";

import { labelStatusBarisRencanaFinal } from "../../label-status-baris";

// Berkas ekspor rencana final (T64; PRD A7 ▶ Keputusan 2026-10-09: .xlsx). Semua isinya dari snapshot finalisasi:
// gudang, tanggal kirim, toko, waktu finalisasi, identitas sumber penjualan, ranking, lalu baris rencana (varian,
// kebutuhan, stok, buffer, jumlah kirim, status dengan label yang sama seperti layar rincian, T77). Nilai
// kosong/tidak tersedia ditulis "—", bukan 0 (DESIGN §7, §8).

const TIDAK_TERSEDIA = "—";

/** `null` = sel kosong. */
type Sel = string | number | null;

const KOLOM_EKSPOR: readonly string[] = ["Kode produk", "Nama produk", "Kebutuhan barang", "Stok akhir", "Buffer (%)", "Jumlah kirim", "Status"];

const angkaAtauTidakTersedia = (nilai: number | null): Sel => nilai ?? TIDAK_TERSEDIA;

/** Nama berkas, mis. `rencana-final-PMS-2026-06-08-v1.xlsx`; karakter selain huruf, angka, dan "-" dibuang dari nama toko. */
export function namaBerkasEkspor(rencana: Pick<RencanaFinal, "toko" | "tanggalKirim" | "versi">) {
  const toko = rencana.toko.nama.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `toko-${rencana.toko.id}`;
  return `rencana-final-${toko}-${rencana.tanggalKirim}-v${rencana.versi}.xlsx`;
}

/** Workbook `.xlsx` berisi satu sheet "Rencana final". */
export function buatBerkasEkspor(rencana: RencanaFinal): Buffer {
  const { sumber, ranking } = rencana;
  const kepala: Sel[][] = [
    ["Rencana final"],
    ["Gudang", rencana.gudang.nama],
    ["Tanggal kirim", formatTanggal(rencana.tanggalKirim)],
    ["Toko", rencana.toko.nama],
    ["Waktu finalisasi", formatWaktu(rencana.difinalisasiPada)],
    ["Periode sumber", `${sumber.bulanSumber.map(formatBulanLaporan).join(", ")} (penetapan #${sumber.versiPeriodeSumber})`],
    ...(sumber.impor.length === 0
      ? [["Impor sumber", "Tidak ada impor aktif untuk bulan periode sumber."]]
      : sumber.impor.map((i): Sel[] => [
          "Impor sumber",
          formatBulanImpor(i.tahunImpor, i.bulanImpor),
          i.namaSheet,
          i.namaFile,
          `${formatAngka(i.ukuranByte)} byte`,
          i.sha256 ?? TIDAK_TERSEDIA,
        ])),
    ["Ranking pusat", `${formatBulanLaporan(ranking.bulanRanking)} versi ${ranking.versi}`],
    ["Keterangan", `${TIDAK_TERSEDIA} = tidak tersedia atau belum diisi, bukan 0.`],
    [],
  ];
  const isi: Sel[][] = rencana.baris.map((b) => [
    b.kodeProduk,
    b.namaProduk ?? TIDAK_TERSEDIA,
    angkaAtauTidakTersedia(b.kebutuhan),
    angkaAtauTidakTersedia(b.stokAkhir),
    angkaAtauTidakTersedia(b.persenBuffer),
    angkaAtauTidakTersedia(b.jumlahKirim),
    labelStatusBarisRencanaFinal[b.status],
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...kepala, [...KOLOM_EKSPOR], ...isi]), "Rencana final");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
