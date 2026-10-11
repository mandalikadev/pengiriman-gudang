import * as XLSX from "xlsx";

// Data sintetis uji performa (T65, PRD C1): workbook penjualan berbentuk sama dengan sheet `<BULAN> (S)` (PRD A1, B8)
// untuk 25 toko dan 500 produk (PRD C1 ▶ Keputusan 2026-10-11, T65). Deterministik (PRNG berbenih), tanpa data bisnis asli (CODING_STANDARDS).
// Kepadatan sel ±9% → ±38 ribu sel bernilai per bulan untuk 500 produk (ADR-0002 memperkirakan ±25 ribu untuk ±360 produk).

const NAMA_SHEET = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];

/** Keluarga aroma sintetis: segmen kode (mis. `A07`) dan nama (mis. `AROMA 07`). */
type KeluargaSintetis = { segmen: string; nama: string };

export type ProdukSintetis = { kode: string; nama: string; ukuran: string; kategori: string; keluarga: KeluargaSintetis };

/**
 * Varian per keluarga: 8 produk otomatis, 1 display tester (kode berakhiran `-T`) dan 1 kertas tester (kategori `KTP`),
 * keduanya manual (ADR-0007).
 */
const VARIAN: readonly { awalan: string; akhiran: string; ukuran: string; kategori: string }[] = [
  { awalan: "15GL", akhiran: "", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER" },
  { awalan: "15LT", akhiran: "", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER" },
  { awalan: "30", akhiran: "", ukuran: "30ML", kategori: "30ML" },
  { awalan: "50", akhiran: "", ukuran: "50ML", kategori: "50ML" },
  { awalan: "100", akhiran: "", ukuran: "100ML", kategori: "100ML" },
  { awalan: "RO", akhiran: "", ukuran: "10ML", kategori: "ROLL ON" },
  { awalan: "BM", akhiran: "", ukuran: "100ML", kategori: "BODY MIST" },
  { awalan: "EDP", akhiran: "", ukuran: "35ML", kategori: "EDP 35ML" },
  { awalan: "50", akhiran: "-T", ukuran: "50ML", kategori: "50ML" },
  { awalan: "KT", akhiran: "", ukuran: "-", kategori: "KTP" },
];

/** `jumlahKeluarga` × 10 varian; 50 keluarga = 500 produk. */
export function daftarProdukSintetis(jumlahKeluarga: number): ProdukSintetis[] {
  return Array.from({ length: jumlahKeluarga }, (_, i) => {
    const nomor = String(i + 1).padStart(2, "0");
    return { segmen: `A${nomor}`, nama: `AROMA ${nomor}` };
  }).flatMap((keluarga) =>
    VARIAN.map((v) => ({
      kode: `${v.awalan}-${keluarga.segmen}${v.akhiran}`,
      nama: `${v.kategori} - ${keluarga.nama}`,
      ukuran: v.ukuran,
      kategori: v.kategori,
      keluarga,
    })),
  );
}

/** Nama sheet penjualan bulan `bulan` (1–12), mis. `OKTOBER (S)`. */
export function namaSheetBulan(bulan: number) {
  return `${NAMA_SHEET[bulan - 1]} (S)`;
}

function jumlahHari(tahun: number, bulan: number) {
  if (bulan === 2) return (tahun % 4 === 0 && tahun % 100 !== 0) || tahun % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(bulan) ? 30 : 31;
}

/** PRNG mulberry32: bilangan bulat 32-bit tak bertanda, deterministik untuk benih yang sama. */
function pembangkitAcak(benih: number) {
  let keadaan = benih >>> 0;
  return () => {
    keadaan = (keadaan + 0x6d2b79f5) >>> 0;
    let t = keadaan;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

type Sel = string | number | null;

/**
 * Satu sheet penjualan sintetis: baris 1 `SALES` + nama toko per blok, baris 2 header tanggal `D/M` (semua tanggal bulan
 * itu), baris 3 judul kolom, lalu satu baris per produk (PRD B8). Setiap pasangan toko–produk punya peluang laku harian
 * sendiri (rata-rata ±10%), sehingga ada produk yang hampir selalu laku dan banyak yang jarang. Sel tanpa penjualan
 * kosong. `jumlahSel` = banyaknya sel bernilai.
 */
export function sheetPenjualanSintetis({
  tahun,
  bulan,
  toko,
  produk,
  benih,
}: {
  tahun: number;
  bulan: number;
  toko: readonly string[];
  produk: readonly ProdukSintetis[];
  benih: number;
}): { baris: Sel[][]; jumlahSel: number } {
  const acak = pembangkitAcak(benih);
  const hari = Array.from({ length: jumlahHari(tahun, bulan) }, (_, i) => `${i + 1}/${bulan}`);
  const barisToko: Sel[] = ["SALES", null, null, null, "TOKO :"];
  const barisTanggal: Sel[] = [null, null, null, null, "TANGGAL :"];
  for (const nama of toko) {
    barisToko.push(nama, ...hari.slice(1).map(() => null));
    barisTanggal.push(...hari);
  }
  const judul: Sel[] = ["NO", "PRODUCT CODE", "PRODUCT NAME", "SIZE", "PRODUCT CATEGORY"];

  // Peluang laku per mil per pasangan toko–produk: 400 × u³ dengan u seragam 0–1 (rata-rata 100‰).
  const peluang = toko.map(() =>
    produk.map(() => {
      const u = acak() % 1000;
      return (u * u * u * 4) / 10_000_000;
    }),
  );
  let jumlahSel = 0;
  const barisProduk = produk.map((p, iProduk) => {
    const baris: Sel[] = [iProduk + 1, p.kode, p.nama, p.ukuran, p.kategori];
    for (let iToko = 0; iToko < toko.length; iToko++) {
      for (let iHari = 0; iHari < hari.length; iHari++) {
        if (acak() % 1000 < peluang[iToko][iProduk]) {
          baris.push(1 + (acak() % 4));
          jumlahSel++;
        } else {
          baris.push(null);
        }
      }
    }
    return baris;
  });
  return { baris: [barisToko, barisTanggal, judul, ...barisProduk], jumlahSel };
}

/** Workbook `.xlsx` berisi satu sheet `namaSheet`. */
export function workbookSatuSheet(namaSheet: string, baris: Sel[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(baris), namaSheet);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
