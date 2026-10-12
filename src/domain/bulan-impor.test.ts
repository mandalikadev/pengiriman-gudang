import { describe, expect, it } from "vitest";

import { bulanImporDariNamaSheet } from "./bulan-impor";

// Issue T85 / PRD A1 ▶ Keputusan (2026-10-12, UAT kedua): bulan impor terisi otomatis dari nama sheet
// `<BULAN> (S)`; huruf besar/kecil dan spasi diabaikan.
describe("bulanImporDariNamaSheet", () => {
  it("mengenali nama bulan di depan (S)", () => {
    expect(bulanImporDariNamaSheet("JUNI (S)")).toBe(6);
    expect(bulanImporDariNamaSheet("agustus (s)")).toBe(8);
    expect(bulanImporDariNamaSheet("MEI (S)")).toBe(5);
  });

  it("semua dua belas bulan, tanpa memedulikan spasi", () => {
    const nama = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
    expect(nama.map((n) => bulanImporDariNamaSheet(`${n} (S)`))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(bulanImporDariNamaSheet("  Desember(S) ")).toBe(12);
    expect(bulanImporDariNamaSheet("JU NI ( S )")).toBe(6);
  });

  it("nama yang tidak dikenali → null", () => {
    expect(bulanImporDariNamaSheet("BARDAT")).toBeNull();
    expect(bulanImporDariNamaSheet("JUNI")).toBeNull();
    expect(bulanImporDariNamaSheet("MP JUNI (S)")).toBeNull();
    expect(bulanImporDariNamaSheet("JUNI (S) 2")).toBeNull();
    expect(bulanImporDariNamaSheet("JUNE (S)")).toBeNull();
    expect(bulanImporDariNamaSheet("")).toBeNull();
  });
});
