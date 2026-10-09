import { describe, expect, it } from "vitest";

import { formatPembagian } from "./format-pembagian";

describe("formatPembagian (DESIGN §8)", () => {
  it("contoh DESIGN §8: Σ 2 ÷ 4 minggu = 0,5 → dibulatkan ke atas 1", () => {
    expect(formatPembagian({ jumlah: 2, pembagi: 4, satuan: "minggu", hasil: 1 })).toBe(
      "Σ 2 ÷ 4 minggu = 0,5 → dibulatkan ke atas 1",
    );
  });

  it("hasil bagi tepat tidak diberi keterangan pembulatan", () => {
    expect(formatPembagian({ jumlah: 4, pembagi: 2, satuan: "bulan", hasil: 2 })).toBe("Σ 4 ÷ 2 bulan = 2");
    expect(formatPembagian({ jumlah: 0, pembagi: 4, satuan: "tanggal", hasil: 0 })).toBe("Σ 0 ÷ 4 tanggal = 0");
  });

  it("hasil bagi yang tidak tepat dua desimal ditandai ≈ dan dipotong (bukan dibulatkan) ke dua desimal", () => {
    expect(formatPembagian({ jumlah: 2, pembagi: 3, satuan: "bulan", hasil: 1 })).toBe(
      "Σ 2 ÷ 3 bulan ≈ 0,66 → dibulatkan ke atas 1",
    );
    expect(formatPembagian({ jumlah: 1, pembagi: 4, satuan: "tanggal", hasil: 1 })).toBe(
      "Σ 1 ÷ 4 tanggal = 0,25 → dibulatkan ke atas 1",
    );
  });

  it("ribuan memakai format id-ID", () => {
    expect(formatPembagian({ jumlah: 2500, pembagi: 2, satuan: "minggu", hasil: 1250 })).toBe("Σ 2.500 ÷ 2 minggu = 1.250");
  });
});
