import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { rincianJumlahKirim, type RumusJumlahKirim } from "@/domain/angka";

import { formatJumlahKirim, formatKebutuhan } from "./format-rincian";

type KasusJumlahKirim = { kebutuhan: number; stokAkhir: number; persenBuffer: number; jumlahKirim: number };
const golden = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../tests/golden/jumlah-kirim.json"), "utf8")) as {
  kasusJumlahKirim: KasusJumlahKirim[];
  kasusJumlahKirimRumusLama: { kasus: KasusJumlahKirim[] };
};

/** Rincian kasus golden dengan kebutuhan, stok, dan buffer itu menurut `rumus`; kasusnya harus ada di golden. */
function rincianGolden(rumus: RumusJumlahKirim, kebutuhan: number, stokAkhir: number, persenBuffer: number) {
  const daftar = rumus === "lama" ? golden.kasusJumlahKirimRumusLama.kasus : golden.kasusJumlahKirim;
  const kasus = daftar.find((k) => k.kebutuhan === kebutuhan && k.stokAkhir === stokAkhir && k.persenBuffer === persenBuffer);
  if (kasus === undefined) throw new Error(`Kasus ${kebutuhan}/${stokAkhir}/${persenBuffer}% tidak ada di golden (${rumus})`);
  const rincian = rincianJumlahKirim(kasus.kebutuhan, kasus.stokAkhir, kasus.persenBuffer, rumus);
  expect(rincian.jumlahKirim).toBe(kasus.jumlahKirim);
  return rincian;
}

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

describe("formatJumlahKirim — stok target (DESIGN §8, PRD A6 ▶ Revisi 2026-10-14)", () => {
  it("contoh UAT 2026-10-14: 7 × 120% − 6 = 2,4 → dibulatkan ke atas 3", () => {
    expect(formatJumlahKirim(rincianGolden("stok-target", 7, 6, 20))).toBe("7 × 120% − 6 = 2,4 → dibulatkan ke atas 3");
  });

  it("contoh PRD A6: 56 × 120% − 20 = 47,2 → dibulatkan ke atas 48", () => {
    expect(formatJumlahKirim(rincianGolden("stok-target", 56, 20, 20))).toBe("56 × 120% − 20 = 47,2 → dibulatkan ke atas 48");
  });

  it("produk otomatis di luar tujuh besar: 56 × 110% − 20 = 41,6 → dibulatkan ke atas 42", () => {
    expect(formatJumlahKirim(rincianGolden("stok-target", 56, 20, 10))).toBe("56 × 110% − 20 = 41,6 → dibulatkan ke atas 42");
  });

  it("hasil bulat tidak diberi keterangan pembulatan", () => {
    expect(formatJumlahKirim(rincianGolden("stok-target", 50, 20, 10))).toBe("50 × 110% − 20 = 35");
    expect(formatJumlahKirim(rincianGolden("stok-target", 0, 0, 20))).toBe("0 × 120% − 0 = 0");
  });

  it("stok melebihi stok target: hasil negatif → paling kecil 0", () => {
    expect(formatJumlahKirim(rincianGolden("stok-target", 56, 70, 20))).toBe("56 × 120% − 70 = −2,8 → paling kecil 0");
    expect(formatJumlahKirim(rincianGolden("stok-target", 56, 68, 20))).toBe("56 × 120% − 68 = −0,8 → paling kecil 0");
  });

  it("ribuan memakai format id-ID", () => {
    expect(formatJumlahKirim(rincianJumlahKirim(1200, 1000, 20, "stok-target"))).toBe("1.200 × 120% − 1.000 = 440");
  });
});

describe("formatJumlahKirim — rumus lama (rencana final sebelum PRD A6 ▶ Revisi 2026-10-14)", () => {
  it("contoh pemilik lama: (56 − 20) × 120% = 43,2 → dibulatkan ke atas 44", () => {
    expect(formatJumlahKirim(rincianGolden("lama", 56, 20, 20))).toBe("(56 − 20) × 120% = 43,2 → dibulatkan ke atas 44");
  });

  it("stok melebihi kebutuhan: hasil kali negatif → paling kecil 0", () => {
    expect(formatJumlahKirim(rincianGolden("lama", 56, 60, 20))).toBe("(56 − 60) × 120% = −4,8 → paling kecil 0");
  });

  it("hasil kali bulat tidak diberi keterangan pembulatan", () => {
    expect(formatJumlahKirim(rincianJumlahKirim(30, 20, 10, "lama"))).toBe("(30 − 20) × 110% = 11");
  });
});
