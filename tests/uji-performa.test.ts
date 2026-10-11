import { describe, expect, it } from "vitest";

import { daftarProdukSintetis, sheetPenjualanSintetis, workbookSatuSheet } from "../scripts/uji-performa/data-sintetis";
import { persentil } from "../scripts/uji-performa/statistik";
import { klasifikasiProduk } from "../src/domain/produk";
import { bacaSheetPenjualan } from "../src/server/impor/sheet-penjualan";

// Bagian murni uji performa T65 (`pnpm perf`): persentil dan data sintetis. Pengukurannya sendiri tidak dijalankan di
// `pnpm verify`.

describe("persentil (nearest-rank)", () => {
  it("p95 dari 1..20 adalah sampel ke-19", () => {
    expect(persentil(Array.from({ length: 20 }, (_, i) => 20 - i), 95)).toBe(19);
  });

  it("p95 dari 1..100 adalah 95; p50 dari [5, 1, 3] adalah 3", () => {
    expect(persentil(Array.from({ length: 100 }, (_, i) => i + 1), 95)).toBe(95);
    expect(persentil([5, 1, 3], 50)).toBe(3);
  });

  it("satu sampel → sampel itu; tanpa sampel → error", () => {
    expect(persentil([1234], 95)).toBe(1234);
    expect(() => persentil([], 95)).toThrow();
  });
});

describe("data sintetis", () => {
  it("50 keluarga → 500 produk unik; display tester dan kertas tester manual", () => {
    const produk = daftarProdukSintetis(50);
    expect(produk).toHaveLength(500);
    expect(new Set(produk.map((p) => p.kode)).size).toBe(500);
    const manual = produk.filter((p) => klasifikasiProduk(p.kode, p.kategori).klasifikasi === "manual");
    expect(manual).toHaveLength(100);
  });

  it("sheet sintetis terbaca tanpa masalah: 25 blok toko, semua tanggal bulan valid, sel sesuai jumlahSel", () => {
    const toko = Array.from({ length: 25 }, (_, i) => `TOKO ${i + 1}`);
    const produk = daftarProdukSintetis(4);
    const { baris, jumlahSel } = sheetPenjualanSintetis({ tahun: 2026, bulan: 2, toko, produk, benih: 7 });
    const hasil = bacaSheetPenjualan({
      workbook: workbookSatuSheet("FEBRUARI (S)", baris),
      namaSheet: "FEBRUARI (S)",
      tahunImpor: 2026,
      bulanImpor: 2,
      namaTokoMaster: toko,
    });

    expect(hasil.masalah).toEqual([]);
    expect(hasil.blokToko.map((b) => b.namaToko)).toEqual(toko);
    expect(hasil.blokToko.every((b) => b.kolomTanggal.length === 28 && b.kolomTanggal.every((k) => k.status === "valid"))).toBe(true);
    expect(hasil.produk).toHaveLength(40);
    expect(hasil.selBernilai).toHaveLength(jumlahSel);
    expect(jumlahSel).toBeGreaterThan(0);
  });

  it("benih yang sama → sheet yang sama", () => {
    const masukan = { tahun: 2026, bulan: 6, toko: ["PMS"], produk: daftarProdukSintetis(2), benih: 42 };
    expect(sheetPenjualanSintetis(masukan)).toEqual(sheetPenjualanSintetis(masukan));
  });
});
