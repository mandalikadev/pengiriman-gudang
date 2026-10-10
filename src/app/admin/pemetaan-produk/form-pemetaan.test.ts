import { describe, expect, it } from "vitest";

import { pilihanPemetaan } from "./form-pemetaan";

const aktif = [
  { id: 1, nama: "GORGEOUS TUBEROSE" },
  { id: 2, nama: "MORNING ROSE" },
];

describe("pilihan pemetaan (PRD A6 ▶ Keputusan 2026-10-10)", () => {
  it("produk belum dipetakan: hanya keluarga aktif, tanpa aroma, dan belum dipetakan", () => {
    expect(pilihanPemetaan({ status: "belum-dipetakan", keluarga: null }, aktif)).toEqual([
      { nilai: "keluarga:1", label: "GORGEOUS TUBEROSE" },
      { nilai: "keluarga:2", label: "MORNING ROSE" },
      { nilai: "tanpa-aroma", label: "Tanpa aroma" },
      { nilai: "belum-dipetakan", label: "Belum dipetakan" },
    ]);
  });

  it("produk terpetakan ke keluarga aktif: tanpa pilihan tambahan", () => {
    expect(pilihanPemetaan({ status: "terpetakan", keluarga: aktif[1] }, aktif).map((p) => p.nilai)).toEqual([
      "keluarga:1",
      "keluarga:2",
      "tanpa-aroma",
      "belum-dipetakan",
    ]);
  });

  it("produk terpetakan ke keluarga yang kemudian dinonaktifkan: keluarga itu tetap tampil sebagai nilai saat ini", () => {
    expect(pilihanPemetaan({ status: "terpetakan", keluarga: { id: 9, nama: "OLD OUD" } }, aktif)).toEqual([
      { nilai: "keluarga:1", label: "GORGEOUS TUBEROSE" },
      { nilai: "keluarga:2", label: "MORNING ROSE" },
      { nilai: "keluarga:9", label: "OLD OUD (nonaktif)" },
      { nilai: "tanpa-aroma", label: "Tanpa aroma" },
      { nilai: "belum-dipetakan", label: "Belum dipetakan" },
    ]);
  });
});
