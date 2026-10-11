import { describe, expect, it } from "vitest";

import { cocokkanNamaStok, normalisasiNamaStok } from "./alias-stok";

// Contoh literal issue T82 (PRD A6 ▶ Keputusan 2026-10-12, UAT): master berisi dua produk GORGEOUS TUBEROSE.
const produk = [
  { kode: "PW110P-GOR", nama: "GORGEOUS TUBEROSE - 110ML M PARFUM INTENSE" },
  { kode: "A10M-GOR", nama: "GORGEOUS TUBEROSE - 10ML ATOMIZER" },
] as const;

describe("normalisasiNamaStok", () => {
  it("trim, spasi ganda menjadi satu, huruf besar (sama dengan alias keluarga aroma)", () => {
    expect(normalisasiNamaStok("  gorgeous  tuberose - 110ml m parfum ")).toBe("GORGEOUS TUBEROSE - 110ML M PARFUM");
  });
});

describe("cocokkanNamaStok", () => {
  it("nama yang sama dengan alias tersimpan → kode produk alias itu", () => {
    const alias = [{ alias: "GORGEOUS TUBEROSE - 110ML M PARFUM", kodeProduk: "PW110P-GOR" }];
    expect(cocokkanNamaStok("gorgeous  tuberose - 110ml m parfum", { alias, produk })).toBe("PW110P-GOR");
  });

  it("nama tanpa alias yang sama dengan nama master → kode produk itu (nama master = alias bawaan)", () => {
    expect(cocokkanNamaStok("GORGEOUS TUBEROSE - 10ML ATOMIZER", { alias: [], produk })).toBe("A10M-GOR");
    expect(cocokkanNamaStok(" gorgeous tuberose - 10ml   atomizer ", { alias: [], produk })).toBe("A10M-GOR");
  });

  it("nama yang tidak sama dengan alias maupun nama master → null, tanpa pencocokan mirip", () => {
    expect(cocokkanNamaStok("BACCARAT ELIXIR - 2ML EDP", { alias: [], produk })).toBeNull();
    expect(cocokkanNamaStok("GORGEOUS TUBEROSE - 10ML", { alias: [], produk })).toBeNull();
  });

  it("alias tersimpan didahulukan atas nama master", () => {
    const alias = [{ alias: "GORGEOUS TUBEROSE - 10ML ATOMIZER", kodeProduk: "PW110P-GOR" }];
    expect(cocokkanNamaStok("GORGEOUS TUBEROSE - 10ML ATOMIZER", { alias, produk })).toBe("PW110P-GOR");
  });
});
