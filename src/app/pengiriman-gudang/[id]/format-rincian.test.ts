import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { rincianJumlahKirim } from "@/domain/angka";

import { formatJumlahKirim, formatKebutuhan } from "./format-rincian";

const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../tests/golden/jumlah-kirim.json"), "utf8")) as {
  kasusJumlahKirim: { kebutuhan: number; stokAkhir: number; persenBuffer: number; jumlahKirim: number }[];
};
const rincian = (i: number) => {
  const { kebutuhan, stokAkhir, persenBuffer } = golden.kasusJumlahKirim[i];
  return rincianJumlahKirim(kebutuhan, stokAkhir, persenBuffer);
};

describe("formatKebutuhan (PRD A6)", () => {
  it("contoh PRD A6: (4 × 4) + (1 × 4) + (2 × 10) + (2 × 8) = 56", () => {
    expect(
      formatKebutuhan(
        [
          { kategori: "Senin–Kamis", jumlahHari: 4, rataRata: 4, subtotal: 16 },
          { kategori: "Jumat", jumlahHari: 1, rataRata: 4, subtotal: 4 },
          { kategori: "Sabtu", jumlahHari: 2, rataRata: 10, subtotal: 20 },
          { kategori: "Minggu", jumlahHari: 2, rataRata: 8, subtotal: 16 },
        ],
        56,
      ),
    ).toBe("(4 × 4) + (1 × 4) + (2 × 10) + (2 × 8) = 56");
  });

  it("ribuan memakai format id-ID", () => {
    expect(formatKebutuhan([{ kategori: "Senin–Kamis", jumlahHari: 4, rataRata: 1200, subtotal: 4800 }], 4800)).toBe("(4 × 1.200) = 4.800");
  });
});

describe("formatJumlahKirim (DESIGN §8)", () => {
  it("contoh issue T60 / PRD A6: (56 − 20) × 120% = 43,2 → dibulatkan ke atas 44", () => {
    expect(golden.kasusJumlahKirim[0].jumlahKirim).toBe(44);
    expect(formatJumlahKirim(rincian(0))).toBe("(56 − 20) × 120% = 43,2 → dibulatkan ke atas 44");
  });

  it("produk otomatis di luar tujuh besar: (56 − 20) × 110% = 39,6 → dibulatkan ke atas 40", () => {
    expect(formatJumlahKirim(rincian(1))).toBe("(56 − 20) × 110% = 39,6 → dibulatkan ke atas 40");
  });

  it("hasil kali bulat tidak diberi keterangan pembulatan", () => {
    expect(formatJumlahKirim(rincian(2))).toBe("(30 − 20) × 110% = 11");
    expect(formatJumlahKirim(rincian(4))).toBe("(56 − 56) × 120% = 0");
  });

  it("stok melebihi kebutuhan: hasil kali negatif → paling kecil 0", () => {
    expect(formatJumlahKirim(rincian(3))).toBe("(56 − 60) × 120% = −4,8 → paling kecil 0");
  });
});
