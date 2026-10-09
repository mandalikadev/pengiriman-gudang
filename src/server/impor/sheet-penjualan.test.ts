import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { bacaSheetPenjualan } from "./sheet-penjualan";

type Sel = string | number | null;

const JUDUL_KOLOM = ["NO", "PRODUCT CODE", "PRODUCT NAME", "SIZE", "PRODUCT CATEGORY"];
const PRODUK_A = [1, "15GL-GOR", "15ML GLITTER - GORGEOUS TUBEROSE", "15ML", "15ML GLITTER/LEATHER"];
const PRODUK_B = [2, "15GL-HOL", "15ML GLITTER - HOLY SWEET", "15ML", "15ML GLITTER/LEATHER"];

/** Workbook kecil buatan test; baris = array sel mulai kolom A. */
function buatWorkbook(sheet: Record<string, Sel[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [nama, baris] of Object.entries(sheet)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(baris), nama);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Sheet penjualan satu blok toko mulai kolom F. */
function sheetSatuBlok(toko: string, header: Sel[], produk: Sel[][]): Sel[][] {
  return [
    ["SALES", null, null, null, "TOKO :", toko],
    [null, null, null, null, "TANGGAL :", ...header],
    [...JUDUL_KOLOM, ...header.map(() => 0)],
    ...produk,
  ];
}

function baca(
  baris: Sel[][],
  opsi: { namaSheet?: string; tahun?: number; bulan?: number; toko?: string[]; tokoNonaktif?: string[] } = {},
) {
  const namaSheet = opsi.namaSheet ?? "JUNI (S)";
  return bacaSheetPenjualan({
    workbook: buatWorkbook({ [namaSheet]: baris }),
    namaSheet,
    tahunImpor: opsi.tahun ?? 2026,
    bulanImpor: opsi.bulan ?? 6,
    namaTokoMaster: opsi.toko ?? ["PMS", "PMJ"],
    namaTokoNonaktif: opsi.tokoNonaktif,
  });
}

type KasusHeader = {
  header: string | number;
  tahunImpor: number;
  bulanImpor: number;
  hasil: { status: "valid" | "invalid" | "di-luar-bulan-impor"; tanggal?: string };
};

const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../tests/golden/tanggal-impor.json"), "utf8"),
) as { kasusHeader: KasusHeader[] };

describe("bacaSheetPenjualan — header tanggal (golden tanggal-impor)", () => {
  it.each(golden.kasusHeader)("header $header (impor $tahunImpor-$bulanImpor) → $hasil.status", (kasus) => {
    const hasil = baca(sheetSatuBlok("PMS", [kasus.header], [PRODUK_A]), {
      tahun: kasus.tahunImpor,
      bulan: kasus.bulanImpor,
    });

    const kolom = hasil.blokToko[0]!.kolomTanggal[0]!;
    expect(kolom.status).toBe(kasus.hasil.status);
    expect(kolom.alamat).toBe("F2");
    if (kasus.hasil.tanggal !== undefined) {
      expect(kolom.tanggal).toBe(kasus.hasil.tanggal);
    }
  });

  it("tanggal di luar bulan impor adalah error dengan alamat sel header", () => {
    const hasil = baca(sheetSatuBlok("PMS", ["5/7"], [PRODUK_A]));
    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "tanggal-di-luar-bulan-impor", lokasi: "JUNI (S)!F2" }),
    ]);
  });
});

describe("bacaSheetPenjualan — kolom tanggal invalid (ADR-0005)", () => {
  it("kolom 31/6 kosong → peringatan dan kolom dilewati; kolom valid tetap diproses", () => {
    const hasil = baca(sheetSatuBlok("PMS", [46202, 46203, "31/6"], [[...PRODUK_A, 2, 1, null]]));

    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "peringatan", kode: "kolom-tanggal-invalid-kosong", lokasi: "JUNI (S)!H2" }),
    ]);
    expect(hasil.masalah[0]!.perbaikan).not.toBe("");
    expect(hasil.blokToko[0]!.kolomTanggal.map((k) => k.status)).toEqual(["valid", "valid", "invalid"]);
    expect(hasil.selBernilai).toEqual([
      { alamat: "F4", namaToko: "PMS", kodeProduk: "15GL-GOR", tanggal: "2026-06-29", kuantitas: 2 },
      { alamat: "G4", namaToko: "PMS", kodeProduk: "15GL-GOR", tanggal: "2026-06-30", kuantitas: 1 },
    ]);
  });

  it("kolom 31/9 berisi 1 → error dengan alamat sel, tidak menjadi sel bernilai", () => {
    const hasil = baca(sheetSatuBlok("PMS", [46295, "31/9"], [PRODUK_A, [...PRODUK_B, null, 1]]), {
      namaSheet: "SEPTEMBER (S)",
      bulan: 9,
    });

    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "kolom-tanggal-invalid-berisi", lokasi: "SEPTEMBER (S)!G5" }),
    ]);
    expect(hasil.selBernilai).toEqual([]);
  });

  it("kolom invalid yang hanya berisi nol yang diketik → error", () => {
    const hasil = baca(sheetSatuBlok("PMS", ["31/6"], [[...PRODUK_A, 0]]));
    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "kolom-tanggal-invalid-berisi", lokasi: "JUNI (S)!F4" }),
    ]);
  });
});

describe("bacaSheetPenjualan — kuantitas", () => {
  it("sel berisi 0 tersimpan sebagai pengamatan; sel kosong tidak muncul", () => {
    const hasil = baca(sheetSatuBlok("PMS", [46174, 46175], [[...PRODUK_A, 0, null], [...PRODUK_B, null, 3]]));

    expect(hasil.masalah).toEqual([]);
    expect(hasil.selBernilai).toEqual([
      { alamat: "F4", namaToko: "PMS", kodeProduk: "15GL-GOR", tanggal: "2026-06-01", kuantitas: 0 },
      { alamat: "G5", namaToko: "PMS", kodeProduk: "15GL-HOL", tanggal: "2026-06-02", kuantitas: 3 },
    ]);
  });

  it.each([
    { nilai: 1.5, kode: "kuantitas-bukan-bilangan-bulat" },
    { nilai: "abc", kode: "kuantitas-bukan-angka" },
    { nilai: -1, kode: "kuantitas-negatif" },
  ])("kuantitas $nilai → error $kode di sel tersebut", ({ nilai, kode }) => {
    const hasil = baca(sheetSatuBlok("PMS", [46174], [[...PRODUK_A, nilai]]));

    expect(hasil.masalah).toEqual([expect.objectContaining({ tingkat: "error", kode, lokasi: "JUNI (S)!F4" })]);
    expect(hasil.selBernilai).toEqual([]);
  });

  it("pesan kuantitas negatif meminta perbaikan di Excel sebelum impor (OD-01)", () => {
    const hasil = baca(sheetSatuBlok("PMS", [46174], [[...PRODUK_A, -1]]));
    expect(hasil.masalah[0]!.perbaikan).toContain("perbaiki di Excel sebelum impor");
  });
});

describe("bacaSheetPenjualan — struktur sheet", () => {
  it("membaca beberapa blok toko dengan kolom dan produk masing-masing", () => {
    const hasil = baca([
      ["SALES", null, null, null, "TOKO :", "PMS", null, "PMJ"],
      [null, null, null, null, "TANGGAL :", "1/6", "2/6", "01/06/2026", "02/06/2026"],
      [...JUDUL_KOLOM, 0, 0, 0, 0],
      [...PRODUK_A, null, null, 4, null],
    ]);

    expect(hasil.masalah).toEqual([]);
    expect(hasil.blokToko.map((b) => [b.namaToko, b.alamat, b.kolomTanggal.length])).toEqual([
      ["PMS", "F1", 2],
      ["PMJ", "H1", 2],
    ]);
    expect(hasil.produk).toEqual([
      {
        alamat: "B4",
        no: 1,
        kodeProduk: "15GL-GOR",
        namaProduk: "15ML GLITTER - GORGEOUS TUBEROSE",
        ukuran: "15ML",
        kategoriProduk: "15ML GLITTER/LEATHER",
      },
    ]);
    expect(hasil.selBernilai).toEqual([
      { alamat: "H4", namaToko: "PMJ", kodeProduk: "15GL-GOR", tanggal: "2026-06-01", kuantitas: 4 },
    ]);
  });

  it("sheet berawalan MP → error di luar cakupan saat ini", () => {
    const hasil = baca(sheetSatuBlok("PMS", [46174], [PRODUK_A]), { namaSheet: "MP JUNI (S)" });
    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "sheet-di-luar-cakupan", lokasi: "MP JUNI (S)!A1" }),
    ]);
    expect(hasil.masalah[0]!.pesan).toContain("di luar cakupan saat ini");
    expect(hasil.blokToko).toEqual([]);
  });

  it("A1 bukan SALES → error", () => {
    const baris = sheetSatuBlok("PMS", [46174], [PRODUK_A]);
    baris[0]![0] = "BARDAT";
    const hasil = baca(baris, { namaSheet: "BARDAT Schedule" });
    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "a1-bukan-sales", lokasi: "BARDAT Schedule!A1" }),
    ]);
    expect(hasil.blokToko).toEqual([]);
  });

  it("sheet yang tidak ada di workbook → error", () => {
    const hasil = bacaSheetPenjualan({
      workbook: buatWorkbook({ "JUNI (S)": sheetSatuBlok("PMS", [46174], [PRODUK_A]) }),
      namaSheet: "JULI (S)",
      tahunImpor: 2026,
      bulanImpor: 7,
      namaTokoMaster: ["PMS"],
    });
    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "sheet-tidak-ditemukan", lokasi: "JULI (S)!A1" }),
    ]);
  });

  it("nama toko tidak ada di master → error di sel nama toko", () => {
    const hasil = baca(sheetSatuBlok("ASOY", [46174], [PRODUK_A]));
    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "toko-tidak-dikenal", lokasi: "JUNI (S)!F1" }),
    ]);
  });

  it("blok toko ganda → error di blok kedua", () => {
    const hasil = baca([
      ["SALES", null, null, null, "TOKO :", "PMS", "PMS"],
      [null, null, null, null, "TANGGAL :", 46174, 46174],
      [...JUDUL_KOLOM, 0, 0],
      PRODUK_A,
    ]);
    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "blok-toko-ganda", lokasi: "JUNI (S)!G1" }),
    ]);
  });

  it("kode produk ganda → error di baris kedua", () => {
    const hasil = baca(sheetSatuBlok("PMS", [46174], [PRODUK_A, [2, ...PRODUK_A.slice(1)]]));
    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "kode-produk-ganda", lokasi: "JUNI (S)!B5" }),
    ]);
  });

  it("tanggal ganda dalam satu blok → error di header kedua", () => {
    const hasil = baca(sheetSatuBlok("PMS", [46174, "1/6"], [PRODUK_A]));
    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "tanggal-ganda", lokasi: "JUNI (S)!G2" }),
    ]);
  });

  it("tanggal yang sama di blok toko berbeda bukan tanggal ganda", () => {
    const hasil = baca([
      ["SALES", null, null, null, "TOKO :", "PMS", "PMJ"],
      [null, null, null, null, "TANGGAL :", 46174, 46174],
      [...JUDUL_KOLOM, 0, 0],
      PRODUK_A,
    ]);
    expect(hasil.masalah).toEqual([]);
  });

  it("baris kosong sesudah produk terakhir diabaikan", () => {
    const hasil = baca(sheetSatuBlok("PMS", [46174], [PRODUK_A, [], [], [null, null, null, null, null, null]]));
    expect(hasil.produk.map((p) => p.kodeProduk)).toEqual(["15GL-GOR"]);
    expect(hasil.masalah).toEqual([]);
  });

  it("baris berisi kuantitas tanpa kode produk → error", () => {
    const hasil = baca(sheetSatuBlok("PMS", [46174], [PRODUK_A, [null, null, null, null, null, 5]]));
    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "kode-produk-kosong", lokasi: "JUNI (S)!B5" }),
    ]);
  });

  it("setiap masalah punya pesan dan cara memperbaiki", () => {
    const hasil = baca(sheetSatuBlok("ASOY", [46174, "5/7", "31/6"], [[...PRODUK_A, -1, null, null]]));
    expect(hasil.masalah.length).toBe(4);
    for (const masalah of hasil.masalah) {
      expect(masalah.pesan).not.toBe("");
      expect(masalah.perbaikan).not.toBe("");
    }
  });
});

describe("bacaSheetPenjualan — normalisasi nama toko (keputusan T10)", () => {
  it.each([" pms ", "Pms", "PMS"])("nama toko %j cocok dengan master PMS", (nama) => {
    const hasil = baca(sheetSatuBlok(nama, [46174], [[...PRODUK_A, 2]]));
    expect(hasil.masalah).toEqual([]);
    expect(hasil.blokToko.map((b) => b.namaToko)).toEqual(["PMS"]);
    expect(hasil.selBernilai.map((s) => s.namaToko)).toEqual(["PMS"]);
  });

  it("spasi ganda dirapikan: GUDANG  BALI cocok dengan master Gudang Bali", () => {
    const hasil = baca(sheetSatuBlok("GUDANG  BALI", [46174], [[...PRODUK_A, 2]]), { toko: ["  Gudang   Bali "] });
    expect(hasil.masalah).toEqual([]);
    expect(hasil.blokToko.map((b) => b.namaToko)).toEqual(["Gudang   Bali"]);
    expect(hasil.selBernilai.map((s) => s.namaToko)).toEqual(["Gudang   Bali"]);
  });

  it("blok PMS dan pms  → error blok toko ganda di blok kedua", () => {
    const hasil = baca([
      ["SALES", null, null, null, "TOKO :", "PMS", "pms "],
      [null, null, null, null, "TANGGAL :", 46174, 46174],
      [...JUDUL_KOLOM, 0, 0],
      PRODUK_A,
    ]);
    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "blok-toko-ganda", lokasi: "JUNI (S)!G1" }),
    ]);
  });

  it("nama yang hanya mirip (PMSS) tetap toko-tidak-dikenal", () => {
    const hasil = baca(sheetSatuBlok("PMSS", [46174], [PRODUK_A]));
    expect(hasil.masalah).toEqual([
      expect.objectContaining({ tingkat: "error", kode: "toko-tidak-dikenal", lokasi: "JUNI (S)!F1" }),
    ]);
    expect(hasil.blokToko.map((b) => b.namaToko)).toEqual(["PMSS"]);
  });
});

describe("bacaSheetPenjualan — toko nonaktif (PRD A1, Keputusan 2026-10-09)", () => {
  const duaBlok: Sel[][] = [
    ["SALES", null, null, null, "TOKO :", "PMS", " pmj "],
    [null, null, null, null, "TANGGAL :", 46174, 46174],
    [...JUDUL_KOLOM, 0, 0],
    [...PRODUK_A, 2, 3],
  ];

  it("blok toko nonaktif → peringatan (bukan error) dengan nama toko dan lokasi bloknya; datanya tetap dibaca", () => {
    const hasil = baca(duaBlok, { toko: ["PMS", "PMJ"], tokoNonaktif: ["PMJ"] });
    expect(hasil.masalah).toEqual([
      expect.objectContaining({
        tingkat: "peringatan",
        kode: "toko-nonaktif",
        lokasi: "JUNI (S)!G1",
        pesan: expect.stringContaining("PMJ"),
        perbaikan: expect.any(String),
      }),
    ]);
    expect(hasil.selBernilai.map((s) => [s.namaToko, s.kuantitas])).toEqual([
      ["PMS", 2],
      ["PMJ", 3],
    ]);
  });

  it("toko aktif tidak menghasilkan peringatan toko nonaktif", () => {
    const hasil = baca(duaBlok, { toko: ["PMS", "PMJ"], tokoNonaktif: [] });
    expect(hasil.masalah).toEqual([]);
  });
});
