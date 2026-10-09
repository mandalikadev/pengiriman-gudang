// Pembaca dan validator satu sheet penjualan (PRD A1, B8; ADR-0002, ADR-0005; OD-01).
// Tanpa database: input buffer workbook → blok toko, kolom tanggal, sel bernilai, dan daftar masalah.
// Header tanggal dibaca sebagai nilai mentah (`cellDates: false`); nomor seri Excel dikonversi
// dengan aritmetika kalender bilangan bulat, tanpa objek `Date` dan tanpa zona waktu.

import * as XLSX from "xlsx";
import { bagiBulatBawah } from "../../domain/angka";
import { parseTanggalBisnis, type TanggalBisnis } from "../../domain/kalender";

type MasukanBacaSheet = {
  workbook: Uint8Array;
  namaSheet: string;
  tahunImpor: number;
  bulanImpor: number;
  namaTokoMaster: readonly string[];
};

type KodeMasalah =
  | "sheet-tidak-ditemukan"
  | "sheet-di-luar-cakupan"
  | "a1-bukan-sales"
  | "toko-tidak-dikenal"
  | "blok-toko-ganda"
  | "kode-produk-kosong"
  | "kode-produk-ganda"
  | "tanggal-ganda"
  | "tanggal-di-luar-bulan-impor"
  | "kuantitas-bukan-angka"
  | "kuantitas-bukan-bilangan-bulat"
  | "kuantitas-negatif"
  | "kolom-tanggal-invalid-berisi"
  | "kolom-tanggal-invalid-kosong"
  | "sel-tanpa-blok-toko";

type Masalah = {
  tingkat: "error" | "peringatan";
  kode: KodeMasalah;
  /** `sheet!sel`, mis. `JUNI (S)!AJ4`. */
  lokasi: string;
  pesan: string;
  perbaikan: string;
};

type KolomTanggal =
  | { alamat: string; header: string | number; status: "valid"; tanggal: TanggalBisnis }
  | { alamat: string; header: string | number; status: "di-luar-bulan-impor"; tanggal: TanggalBisnis }
  | { alamat: string; header: string | number; status: "invalid"; tanggal?: undefined };

type BlokToko = {
  namaToko: string;
  /** Alamat sel nama toko di baris 1. */
  alamat: string;
  kolomTanggal: KolomTanggal[];
};

type ProdukSheet = {
  /** Alamat sel PRODUCT CODE. */
  alamat: string;
  no: string | number | null;
  kodeProduk: string;
  namaProduk: string;
  ukuran: string;
  kategoriProduk: string;
};

type SelBernilai = {
  alamat: string;
  namaToko: string;
  kodeProduk: string;
  tanggal: TanggalBisnis;
  kuantitas: number;
};

type HasilBacaSheet = {
  namaSheet: string;
  blokToko: BlokToko[];
  produk: ProdukSheet[];
  /** Sel berisi angka pada kolom tanggal valid, termasuk nol yang diketik (ADR-0002). */
  selBernilai: SelBernilai[];
  masalah: Masalah[];
};

const BARIS_TOKO = 0;
const BARIS_TANGGAL = 1;
const BARIS_PRODUK_PERTAMA = 3;
const KOLOM_NO = 0;
const KOLOM_KODE = 1;
const KOLOM_NAMA = 2;
const KOLOM_UKURAN = 3;
const KOLOM_KATEGORI = 4;
const KOLOM_DATA_PERTAMA = 5;

const POLA_HEADER_TEKS = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/;

// Selisih hari: nomor seri 0 (sistem 1900) = 1899-12-30; 1970-01-01 = seri 25569.
// Sistem 1904: seri 0 = 1904-01-01 = seri 1462 pada sistem 1900.
const SERI_1970 = 25569;
const GESER_1904 = 1462;
// Seri 60 = 29-02-1900 fiktif (bug kompatibilitas Lotus); seri < 60 bergeser satu hari.
const SERI_29_FEB_1900 = 60;

const alamatSel = (baris: number, kolom: number) => XLSX.utils.encode_cell({ r: baris, c: kolom });

/** Tanggal kalender dari jumlah hari sejak 1970-01-01 (algoritma civil_from_days, Howard Hinnant). */
function tanggalDariHariEpoch(hariEpoch: number): { tahun: number; bulan: number; hari: number } {
  const z = hariEpoch + 719468;
  const era = bagiBulatBawah(z, 146097);
  const hariEra = z - era * 146097;
  const tahunEra = bagiBulatBawah(
    hariEra - bagiBulatBawah(hariEra, 1460) + bagiBulatBawah(hariEra, 36524) - bagiBulatBawah(hariEra, 146096),
    365,
  );
  const hariTahun = hariEra - (365 * tahunEra + bagiBulatBawah(tahunEra, 4) - bagiBulatBawah(tahunEra, 100));
  const bulanMaret = bagiBulatBawah(5 * hariTahun + 2, 153);
  const hari = hariTahun - bagiBulatBawah(153 * bulanMaret + 2, 5) + 1;
  const bulan = bulanMaret < 10 ? bulanMaret + 3 : bulanMaret - 9;
  return { tahun: tahunEra + era * 400 + (bulan <= 2 ? 1 : 0), bulan, hari };
}

function tanggalAtauNull(tahun: number, bulan: number, hari: number): TanggalBisnis | null {
  const teks = `${String(tahun).padStart(4, "0")}-${String(bulan).padStart(2, "0")}-${String(hari).padStart(2, "0")}`;
  try {
    return parseTanggalBisnis(teks);
  } catch {
    return null;
  }
}

function tanggalDariSeri(seri: number, date1904: boolean): TanggalBisnis | null {
  if (!Number.isSafeInteger(seri) || seri < 1) return null;
  let hariEpoch: number;
  if (date1904) {
    hariEpoch = seri + GESER_1904 - SERI_1970;
  } else if (seri === SERI_29_FEB_1900) {
    return null;
  } else {
    hariEpoch = seri < SERI_29_FEB_1900 ? seri + 1 - SERI_1970 : seri - SERI_1970;
  }
  if (hariEpoch + 719468 < 0) return null;
  const { tahun, bulan, hari } = tanggalDariHariEpoch(hariEpoch);
  return tanggalAtauNull(tahun, bulan, hari);
}

/** Header DD/MM, DD/MM/YYYY, atau nomor seri Excel (PRD B8). Tahun DD/MM = tahun impor. */
function bacaHeaderTanggal(header: string | number, tahunImpor: number, date1904: boolean): TanggalBisnis | null {
  if (typeof header === "number") {
    return tanggalDariSeri(header, date1904);
  }
  const cocok = POLA_HEADER_TEKS.exec(header.trim());
  if (!cocok) return null;
  const tahun = cocok[3] === undefined ? tahunImpor : Number(cocok[3]);
  return tanggalAtauNull(tahun, Number(cocok[2]), Number(cocok[1]));
}

function teksSel(sel: XLSX.CellObject | undefined): string {
  if (!sel || sel.v === undefined || sel.v === null) return "";
  return String(sel.v).trim();
}

/** Sel terisi: ada, bukan stub, dan bukan teks kosong. */
function selTerisi(sel: XLSX.CellObject | undefined): sel is XLSX.CellObject {
  return sel !== undefined && sel.t !== "z" && sel.v !== undefined && !(sel.t === "s" && String(sel.v).trim() === "");
}

export function bacaSheetPenjualan(masukan: MasukanBacaSheet): HasilBacaSheet {
  const { namaSheet, tahunImpor, bulanImpor } = masukan;
  const hasil: HasilBacaSheet = { namaSheet, blokToko: [], produk: [], selBernilai: [], masalah: [] };
  const lapor = (tingkat: Masalah["tingkat"], kode: KodeMasalah, sel: string, pesan: string, perbaikan: string) => {
    hasil.masalah.push({ tingkat, kode, lokasi: `${namaSheet}!${sel}`, pesan, perbaikan });
  };

  if (namaSheet.startsWith("MP ")) {
    lapor(
      "error",
      "sheet-di-luar-cakupan",
      "A1",
      `Sheet "${namaSheet}" di luar cakupan saat ini.`,
      "Pilih sheet penjualan berpola <BULAN> (S), mis. JUNI (S).",
    );
    return hasil;
  }

  const workbook = XLSX.read(masukan.workbook, { type: "buffer", sheets: namaSheet, cellDates: false });
  const sheet = workbook.Sheets[namaSheet];
  if (!sheet) {
    lapor(
      "error",
      "sheet-tidak-ditemukan",
      "A1",
      `Sheet "${namaSheet}" tidak ada di workbook.`,
      "Periksa nama sheet di file Excel, lalu pilih sheet yang ada.",
    );
    return hasil;
  }

  if (teksSel(sheet.A1) !== "SALES") {
    lapor(
      "error",
      "a1-bukan-sales",
      "A1",
      `Sel A1 berisi "${teksSel(sheet.A1)}", bukan "SALES"; ini bukan sheet penjualan.`,
      "Pilih sheet penjualan yang sel A1-nya berisi SALES.",
    );
    return hasil;
  }

  const date1904 = workbook.Workbook?.WBProps?.date1904 === true;
  const rentang = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const ambil = (baris: number, kolom: number) => sheet[alamatSel(baris, kolom)] as XLSX.CellObject | undefined;

  // Blok toko: setiap sel terisi di baris 1 (mulai kolom F) membuka blok sampai blok berikutnya.
  const tokoMaster = new Set(masukan.namaTokoMaster.map((nama) => nama.trim()));
  const tokoTerlihat = new Set<string>();
  const blokPerKolom: (BlokToko | undefined)[] = [];
  const kolomPerIndeks: (KolomTanggal | undefined)[] = [];
  let blokAktif: BlokToko | undefined;
  let tanggalBlok = new Set<string>();

  for (let kolom = KOLOM_DATA_PERTAMA; kolom <= rentang.e.c; kolom++) {
    const selToko = ambil(BARIS_TOKO, kolom);
    if (selTerisi(selToko)) {
      const namaToko = teksSel(selToko);
      const alamat = alamatSel(BARIS_TOKO, kolom);
      blokAktif = { namaToko, alamat, kolomTanggal: [] };
      tanggalBlok = new Set();
      hasil.blokToko.push(blokAktif);
      if (!tokoMaster.has(namaToko)) {
        lapor(
          "error",
          "toko-tidak-dikenal",
          alamat,
          `Toko "${namaToko}" tidak ada di daftar toko.`,
          "Perbaiki nama toko di Excel agar sama dengan daftar toko, atau minta admin menambahkan toko ini.",
        );
      }
      if (tokoTerlihat.has(namaToko)) {
        lapor(
          "error",
          "blok-toko-ganda",
          alamat,
          `Toko "${namaToko}" muncul lebih dari sekali di baris 1.`,
          "Gabungkan atau hapus blok toko yang ganda di Excel.",
        );
      }
      tokoTerlihat.add(namaToko);
    }
    blokPerKolom[kolom] = blokAktif;

    const selHeader = ambil(BARIS_TANGGAL, kolom);
    if (!blokAktif || !selTerisi(selHeader)) continue;

    const alamat = alamatSel(BARIS_TANGGAL, kolom);
    const header = typeof selHeader.v === "number" ? selHeader.v : teksSel(selHeader);
    const tanggal = bacaHeaderTanggal(header, tahunImpor, date1904);
    let kolomTanggal: KolomTanggal;
    if (tanggal === null) {
      kolomTanggal = { alamat, header, status: "invalid" };
    } else if (Number(tanggal.slice(0, 4)) !== tahunImpor || Number(tanggal.slice(5, 7)) !== bulanImpor) {
      kolomTanggal = { alamat, header, status: "di-luar-bulan-impor", tanggal };
      lapor(
        "error",
        "tanggal-di-luar-bulan-impor",
        alamat,
        `Tanggal ${tanggal} di blok ${blokAktif.namaToko} bukan bulan impor ${tahunImpor}-${String(bulanImpor).padStart(2, "0")}.`,
        "Perbaiki header tanggal di Excel, atau impor sheet ini dengan bulan impor yang sesuai.",
      );
    } else {
      kolomTanggal = { alamat, header, status: "valid", tanggal };
    }
    if (kolomTanggal.tanggal !== undefined) {
      if (tanggalBlok.has(kolomTanggal.tanggal)) {
        lapor(
          "error",
          "tanggal-ganda",
          alamat,
          `Tanggal ${kolomTanggal.tanggal} muncul lebih dari sekali di blok ${blokAktif.namaToko}.`,
          "Hapus atau perbaiki kolom tanggal yang ganda di Excel.",
        );
      }
      tanggalBlok.add(kolomTanggal.tanggal);
    }
    blokAktif.kolomTanggal.push(kolomTanggal);
    kolomPerIndeks[kolom] = kolomTanggal;
  }

  // Baris produk: baris 4 dan seterusnya.
  const kodeTerlihat = new Set<string>();
  const kolomInvalidBerisi = new Set<number>();
  for (let baris = BARIS_PRODUK_PERTAMA; baris <= rentang.e.r; baris++) {
    const selKode = ambil(baris, KOLOM_KODE);
    const kodeProduk = teksSel(selKode);
    const alamatKode = alamatSel(baris, KOLOM_KODE);

    const selData: { kolom: number; sel: XLSX.CellObject }[] = [];
    for (let kolom = KOLOM_DATA_PERTAMA; kolom <= rentang.e.c; kolom++) {
      const sel = ambil(baris, kolom);
      if (selTerisi(sel)) selData.push({ kolom, sel });
    }

    if (kodeProduk === "") {
      if (selData.length > 0) {
        lapor(
          "error",
          "kode-produk-kosong",
          alamatKode,
          `Baris ${baris + 1} berisi kuantitas tetapi PRODUCT CODE kosong.`,
          "Isi PRODUCT CODE di Excel, atau hapus kuantitas di baris itu.",
        );
      }
      continue;
    }

    if (kodeTerlihat.has(kodeProduk)) {
      lapor(
        "error",
        "kode-produk-ganda",
        alamatKode,
        `Kode produk ${kodeProduk} muncul lebih dari sekali.`,
        "Gabungkan atau hapus baris produk yang ganda di Excel.",
      );
    }
    kodeTerlihat.add(kodeProduk);

    const selNo = ambil(baris, KOLOM_NO);
    hasil.produk.push({
      alamat: alamatKode,
      no: !selTerisi(selNo) ? null : typeof selNo.v === "number" ? selNo.v : teksSel(selNo),
      kodeProduk,
      namaProduk: teksSel(ambil(baris, KOLOM_NAMA)),
      ukuran: teksSel(ambil(baris, KOLOM_UKURAN)),
      kategoriProduk: teksSel(ambil(baris, KOLOM_KATEGORI)),
    });

    for (const { kolom, sel } of selData) {
      const alamat = alamatSel(baris, kolom);
      const blok = blokPerKolom[kolom];
      const kolomTanggal = kolomPerIndeks[kolom];

      if (!blok || !kolomTanggal) {
        lapor(
          "error",
          "sel-tanpa-blok-toko",
          alamat,
          `Sel ${alamat} berisi data, tetapi kolomnya tidak punya nama toko atau header tanggal.`,
          "Lengkapi nama toko (baris 1) dan header tanggal (baris 2) di Excel, atau hapus isi sel itu.",
        );
        continue;
      }
      if (kolomTanggal.status === "invalid") {
        kolomInvalidBerisi.add(kolom);
        lapor(
          "error",
          "kolom-tanggal-invalid-berisi",
          alamat,
          `Kolom tanggal invalid "${kolomTanggal.header}" (${kolomTanggal.alamat}) berisi data di sel ${alamat}.`,
          "Pindahkan angka ke kolom tanggal yang benar atau hapus di Excel, lalu impor ulang. Nol yang diketik juga dihitung sebagai data.",
        );
        continue;
      }
      if (kolomTanggal.status === "di-luar-bulan-impor") continue;

      if (sel.t !== "n" || typeof sel.v !== "number") {
        lapor(
          "error",
          "kuantitas-bukan-angka",
          alamat,
          `Kuantitas di sel ${alamat} bukan angka ("${teksSel(sel)}").`,
          "Ganti isi sel dengan angka bilangan bulat di Excel, atau kosongkan jika tidak ada penjualan.",
        );
        continue;
      }
      if (!Number.isSafeInteger(sel.v)) {
        lapor(
          "error",
          "kuantitas-bukan-bilangan-bulat",
          alamat,
          `Kuantitas di sel ${alamat} (${sel.v}) bukan bilangan bulat.`,
          "Ganti dengan bilangan bulat di Excel.",
        );
        continue;
      }
      if (sel.v < 0) {
        lapor(
          "error",
          "kuantitas-negatif",
          alamat,
          `Kuantitas di sel ${alamat} negatif (${sel.v}); ini salah input.`,
          "Kuantitas negatif adalah salah input: perbaiki di Excel sebelum impor.",
        );
        continue;
      }
      hasil.selBernilai.push({
        alamat,
        namaToko: blok.namaToko,
        kodeProduk,
        tanggal: kolomTanggal.tanggal,
        kuantitas: sel.v === 0 ? 0 : sel.v,
      });
    }
  }

  // Kolom tanggal invalid yang seluruh selnya kosong: peringatan, kolom dilewati (ADR-0005).
  for (const [kolom, kolomTanggal] of kolomPerIndeks.entries()) {
    if (kolomTanggal?.status !== "invalid" || kolomInvalidBerisi.has(kolom)) continue;
    lapor(
      "peringatan",
      "kolom-tanggal-invalid-kosong",
      kolomTanggal.alamat,
      `Kolom tanggal invalid "${kolomTanggal.header}" di blok ${blokPerKolom[kolom]?.namaToko ?? ""} kosong dan dilewati.`,
      "Tidak perlu tindakan. Jika ingin, hapus kolom template ini dari Excel.",
    );
  }

  return hasil;
}
