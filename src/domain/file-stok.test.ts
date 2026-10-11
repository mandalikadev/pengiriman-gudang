import { describe, expect, it } from "vitest";

import { STOK_MAKS } from "./batas-stok";
import { bacaFileStok, kelompokkanBarisStok, type BarisFileStok } from "./file-stok";

// Contoh literal issue T83 (PRD A6 ▶ Keputusan 2026-10-12, UAT): file stok kasir lima baris isi.
const JUDUL = ["Name - Variant", "Category", "Ending"];
const CONTOH = [
  JUDUL,
  ["GORGEOUS TUBEROSE - 110ML M PARFUM", "PARFUM WANITA", "20"],
  ["GORGEOUS TUBEROSE - 10ML ATOMIZER", "PARFUM WANITA", ""],
  ["BACCARAT ELIXIR - 2ML EDP", "PARFUM WANITA", "3"],
  ["NO1 - 10ML ATOMIZER", "PARFUM PRIA", "7"],
  ["HOLY SWEET - 2ML EDP", "PARFUM WANITA", "abc"],
];

const valid = (nomor: number, nama: string, stokAkhir: number | null): BarisFileStok => ({ nomor, nama, valid: true, stokAkhir });
const tidakValid = (nomor: number, nama: string, alasan: string): BarisFileStok => ({ nomor, nama, valid: false, alasan });

describe("bacaFileStok: judul kolom", () => {
  it("Name - Variant dan Ending wajib, dicocokkan setelah normalisasi; Category dan kolom lain diabaikan", () => {
    const hasil = bacaFileStok([
      ["No", " name -  variant ", "ENDING", "Catatan"],
      ["1", "GORGEOUS TUBEROSE - 10ML ATOMIZER", "4", "x"],
    ]);
    expect(hasil).toEqual({ ok: true, baris: [valid(2, "GORGEOUS TUBEROSE - 10ML ATOMIZER", 4)] });
  });

  it("kolom yang kurang disebut di pesan", () => {
    expect(bacaFileStok([["Name - Variant", "Category"], ["A", "B"]])).toEqual({
      ok: false,
      pesan: "Judul kolom Ending tidak ditemukan di baris pertama.",
    });
    expect(bacaFileStok([["Nama", "Ending"], ["A", "1"]])).toEqual({
      ok: false,
      pesan: "Judul kolom Name - Variant tidak ditemukan di baris pertama.",
    });
    expect(bacaFileStok([["Nama", "Stok"]])).toEqual({
      ok: false,
      pesan: "Judul kolom Name - Variant dan Ending tidak ditemukan di baris pertama.",
    });
    expect(bacaFileStok([])).toEqual({
      ok: false,
      pesan: "Judul kolom Name - Variant dan Ending tidak ditemukan di baris pertama.",
    });
  });
});

describe("bacaFileStok: nilai Ending", () => {
  it("contoh literal: bilangan bulat → stok, kosong → belum diketahui (null), abc → tidak valid; nomor = nomor baris file", () => {
    expect(bacaFileStok(CONTOH)).toEqual({
      ok: true,
      baris: [
        valid(2, "GORGEOUS TUBEROSE - 110ML M PARFUM", 20),
        valid(3, "GORGEOUS TUBEROSE - 10ML ATOMIZER", null),
        valid(4, "BACCARAT ELIXIR - 2ML EDP", 3),
        valid(5, "NO1 - 10ML ATOMIZER", 7),
        tidakValid(6, "HOLY SWEET - 2ML EDP", 'Ending "abc" bukan bilangan bulat.'),
      ],
    });
  });

  it("negatif diterima, termasuk tanda minus tipografis; sel angka workbook diterima; baris kosong dilewati", () => {
    expect(
      bacaFileStok([
        JUDUL,
        ["A", "", "-3"],
        ["", "", ""],
        ["B", "", "−4"],
        [null, null, null],
        ["C", "", 7],
        ["D", "", null],
        ["E", "", " 12 "],
      ]),
    ).toEqual({
      ok: true,
      baris: [valid(2, "A", -3), valid(4, "B", -4), valid(6, "C", 7), valid(7, "D", null), valid(8, "E", 12)],
    });
  });

  it("pecahan, pemisah ribuan, dan nilai di luar batas STOK_MAKS tidak valid; nama kosong tidak valid", () => {
    expect(
      bacaFileStok([
        JUDUL,
        ["A", "", "1,5"],
        ["B", "", 2.5],
        ["C", "", "1.000"],
        ["D", "", String(STOK_MAKS + 1)],
        ["E", "", String(-STOK_MAKS)],
        ["", "", "5"],
      ]),
    ).toEqual({
      ok: true,
      baris: [
        tidakValid(2, "A", 'Ending "1,5" bukan bilangan bulat.'),
        tidakValid(3, "B", 'Ending "2.5" bukan bilangan bulat.'),
        tidakValid(4, "C", 'Ending "1.000" bukan bilangan bulat.'),
        tidakValid(5, "D", `Ending ${STOK_MAKS + 1} melebihi batas ${STOK_MAKS.toLocaleString("id-ID")}.`),
        valid(6, "E", -STOK_MAKS),
        tidakValid(7, "", "Name - Variant kosong."),
      ],
    });
  });

  it("nama yang muncul lebih dari sekali (setelah normalisasi) → semua barisnya tidak valid, ganda di file", () => {
    expect(
      bacaFileStok([
        JUDUL,
        ["HOLY SWEET - 2ML EDP", "", "1"],
        ["X", "", "2"],
        ["holy  sweet - 2ml edp ", "", "3"],
        ["HOLY SWEET - 2ML EDP", "", "abc"],
      ]),
    ).toEqual({
      ok: true,
      baris: [
        tidakValid(2, "HOLY SWEET - 2ML EDP", "Nama ganda di file (baris 2, 4, dan 5)."),
        valid(3, "X", 2),
        tidakValid(4, "holy  sweet - 2ml edp", "Nama ganda di file (baris 2, 4, dan 5)."),
        tidakValid(5, "HOLY SWEET - 2ML EDP", "Nama ganda di file (baris 2, 4, dan 5)."),
      ],
    });
  });
});

describe("kelompokkanBarisStok", () => {
  const produk = [
    { kode: "PW110P-GOR", nama: "GORGEOUS TUBEROSE - 110ML M PARFUM INTENSE" },
    { kode: "A10M-GOR", nama: "GORGEOUS TUBEROSE - 10ML ATOMIZER" },
    { kode: "A10M-NO1", nama: "NO1 - 10ML ATOMIZER" },
  ];
  const alias = [{ alias: "GORGEOUS TUBEROSE - 110ML M PARFUM", kodeProduk: "PW110P-GOR" }];
  const kodeVarianToko = ["PW110P-GOR", "A10M-GOR"];

  it("contoh literal: terisi 2, tidak dikenal 1, diabaikan 1, nilai tidak valid 1 (diperiksa lebih dulu)", () => {
    const dibaca = bacaFileStok(CONTOH);
    if (!dibaca.ok) throw new Error(dibaca.pesan);
    expect(kelompokkanBarisStok(dibaca.baris, { alias, produk, kodeVarianToko })).toEqual({
      terisi: [
        { kodeProduk: "PW110P-GOR", stokAkhir: 20 },
        { kodeProduk: "A10M-GOR", stokAkhir: null },
      ],
      tidakDikenal: ["BACCARAT ELIXIR - 2ML EDP"],
      jumlahDiabaikan: 1,
      tidakValid: [{ nomor: 6, nama: "HOLY SWEET - 2ML EDP", alasan: 'Ending "abc" bukan bilangan bulat.' }],
    });
  });

  it("dua nama berbeda yang mengarah ke produk yang sama → keduanya nilai tidak valid, ganda di file", () => {
    const baris = [
      valid(2, "GORGEOUS TUBEROSE - 110ML M PARFUM", 20),
      valid(3, "A10M-GOR LAIN", 1),
      valid(4, "GORGEOUS TUBEROSE - 110ML M PARFUM INTENSE", 21),
    ];
    expect(kelompokkanBarisStok(baris, { alias, produk, kodeVarianToko })).toEqual({
      terisi: [],
      tidakDikenal: ["A10M-GOR LAIN"],
      jumlahDiabaikan: 0,
      tidakValid: [
        { nomor: 2, nama: "GORGEOUS TUBEROSE - 110ML M PARFUM", alasan: "Ganda di file: baris 2 dan 4 mengarah ke produk PW110P-GOR." },
        { nomor: 4, nama: "GORGEOUS TUBEROSE - 110ML M PARFUM INTENSE", alasan: "Ganda di file: baris 2 dan 4 mengarah ke produk PW110P-GOR." },
      ],
    });
  });
});
