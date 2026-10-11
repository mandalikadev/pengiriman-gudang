import * as XLSX from "xlsx";

import { formatBulanImpor } from "@/app/admin/impor/format";
import { labelStatus } from "@/components/badge-status";
import { KATEGORI, type HasilSemuaBarisRingkasan } from "@/server/laporan/ringkasan";

// Berkas ekspor Ringkasan (T38, PRD A2 ▶ Keputusan 2026-10-09: .xlsx). Isinya periode dan filter yang diterapkan,
// lalu semua baris hasil filter. Label status (Parsial) diambil dari sumber yang sama dengan badge di layar (T77).
// Tidak tersedia ditulis "—", bukan 0; nol teramati ditulis 0 (DESIGN §7, §8).

const TIDAK_TERSEDIA = "—";

type SemuaBaris = Extract<HasilSemuaBarisRingkasan, { keadaan: "siap" }>;
/** `null` = sel kosong. */
type Sel = string | number | null;

/** `2027-03` → `Maret 2027`. */
function labelBulan(kode: string) {
  return formatBulanImpor(Number(kode.slice(0, 4)), Number(kode.slice(5, 7)));
}

/** Judul kolom tabel ekspor; rata-rata dan total mentah berlabel berbeda (DESIGN §8). */
const KOLOM_EKSPOR: readonly string[] = [
  "Toko",
  "Kode produk",
  "Nama produk",
  "Kategori produk",
  ...KATEGORI.flatMap((kategori) => [`Rata-rata Ringkasan ${kategori}`, `Kelengkapan ${kategori}`]),
  "Total penjualan mentah",
];

/** Nama berkas: bulan pilihan yang diterapkan, mis. `ringkasan-2026-06_2026-07.xlsx`. */
export function namaBerkasEkspor(bulanPilihan: readonly string[]) {
  return `ringkasan-${bulanPilihan.join("_")}.xlsx`;
}

/** Workbook `.xlsx` berisi satu sheet "Ringkasan". */
export function buatBerkasEkspor({ bulanPilihan, filterAktif, baris }: SemuaBaris): Buffer {
  const isiFilter = (nilai: readonly string[], semua: string) => (nilai.length === 0 ? semua : nilai.join(", "));
  const kepala: Sel[][] = [
    ["Ringkasan penjualan"],
    ["Periode", `${bulanPilihan.map(labelBulan).join(", ")} (${bulanPilihan.length} bulan)`],
    ["Filter toko", isiFilter(filterAktif.toko.map((t) => t.nama), "Semua toko")],
    ["Filter kategori produk", isiFilter(filterAktif.kategoriProduk, "Semua kategori produk")],
    ["Filter produk", isiFilter(filterAktif.produk.map((p) => p.kode), "Semua produk")],
    ["Jumlah baris", baris.length],
    [
      "Keterangan",
      `${TIDAK_TERSEDIA} = tidak tersedia (tidak ada bulan pilihan yang punya pengamatan), bukan 0. ` +
        "Total penjualan mentah = jumlah kuantitas teramati tanpa perataan, bukan penjumlahan rata-rata.",
    ],
    [],
  ];
  const isi: Sel[][] = baris.map((b) => [
    b.namaToko,
    b.kodeProduk,
    b.namaProduk,
    b.kategoriProduk,
    ...KATEGORI.flatMap((kategori): Sel[] => {
      const nilai = b.rataRata[kategori];
      if (nilai === null) return [TIDAK_TERSEDIA, null];
      return [nilai.rataRataRingkasan, nilai.kelengkapan === "parsial" ? labelStatus("parsial") : null];
    }),
    b.totalPenjualanMentah,
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...kepala, [...KOLOM_EKSPOR], ...isi]), "Ringkasan");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
