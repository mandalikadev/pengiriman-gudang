import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bagiBulatAtas, bagiBulatBawah, hitungJumlahKirim, rincianJumlahKirim } from "./angka";

type KasusJumlahKirim = {
  kebutuhan: number;
  stokAkhir: number;
  persenBuffer: number;
  jumlahKirim: number;
  catatan: string;
};

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../tests/golden/jumlah-kirim.json"), "utf8"),
) as {
  kasusJumlahKirim: (KasusJumlahKirim & { stokTarget: number })[];
  kasusJumlahKirimRumusLama: { kasus: KasusJumlahKirim[] };
};

describe("bagiBulatAtas", () => {
  it.each([
    [0, 4, 0],
    [1, 4, 1],
    [2, 4, 1],
    [4, 4, 1],
    [5, 4, 2],
  ])("bagiBulatAtas(%i, %i) = %i", (jumlah, pembagi, hasil) => {
    expect(bagiBulatAtas(jumlah, pembagi)).toBe(hasil);
  });

  it.each([
    ["jumlah pecahan", 1.5, 4],
    ["pembagi pecahan", 4, 1.5],
    ["jumlah negatif", -1, 4],
    ["pembagi nol", 4, 0],
    ["pembagi negatif", 4, -2],
    ["jumlah NaN", Number.NaN, 4],
    ["jumlah tak hingga", Number.POSITIVE_INFINITY, 4],
    ["jumlah di luar bilangan bulat aman", Number.MAX_SAFE_INTEGER + 1, 4],
  ])("menolak %s", (_nama, jumlah, pembagi) => {
    expect(() => bagiBulatAtas(jumlah, pembagi)).toThrow(RangeError);
  });
});

describe("bagiBulatBawah", () => {
  it.each([
    [0, 4, 0],
    [1, 4, 0],
    [3, 4, 0],
    [4, 4, 1],
    [7, 4, 1],
    [2025, 100, 20],
    [2025, 400, 5],
  ])("bagiBulatBawah(%i, %i) = %i", (jumlah, pembagi, hasil) => {
    expect(bagiBulatBawah(jumlah, pembagi)).toBe(hasil);
  });

  it.each([
    ["jumlah pecahan", 1.5, 4],
    ["pembagi pecahan", 4, 1.5],
    ["jumlah negatif", -1, 4],
    ["pembagi nol", 4, 0],
    ["pembagi negatif", 4, -2],
    ["jumlah NaN", Number.NaN, 4],
    ["jumlah di luar bilangan bulat aman", Number.MAX_SAFE_INTEGER + 1, 4],
  ])("menolak %s", (_nama, jumlah, pembagi) => {
    expect(() => bagiBulatBawah(jumlah, pembagi)).toThrow(RangeError);
  });
});

describe("hitungJumlahKirim", () => {
  it.each(fixture.kasusJumlahKirim)(
    "kebutuhan $kebutuhan, stok $stokAkhir, buffer $persenBuffer% → $jumlahKirim",
    ({ kebutuhan, stokAkhir, persenBuffer, jumlahKirim }) => {
      expect(hitungJumlahKirim(kebutuhan, stokAkhir, persenBuffer)).toBe(jumlahKirim);
    },
  );

  it.each([
    ["kebutuhan pecahan", 56.5, 20, 20],
    ["stok pecahan", 56, 20.5, 20],
    ["buffer pecahan", 56, 20, 1.1],
    ["kebutuhan negatif", -1, 20, 20],
    ["buffer negatif", 56, 20, -10],
    ["kebutuhan NaN", Number.NaN, 20, 20],
    ["hasil kali di luar bilangan bulat aman", Number.MAX_SAFE_INTEGER, 0, 20],
  ])("menolak %s", (_nama, kebutuhan, stokAkhir, persenBuffer) => {
    expect(() => hitungJumlahKirim(kebutuhan, stokAkhir, persenBuffer)).toThrow(RangeError);
  });
});

describe("rincianJumlahKirim — stok target (PRD A6 ▶ Revisi 2026-10-14)", () => {
  it("contoh PRD A6: 56 × 120% − 20 = 47,2 → dibulatkan ke atas 48 (golden jumlah-kirim.json)", () => {
    const [contoh] = fixture.kasusJumlahKirim;
    expect(contoh).toMatchObject({ kebutuhan: 56, stokAkhir: 20, persenBuffer: 20, stokTarget: 68, jumlahKirim: 48 });
    expect(rincianJumlahKirim(contoh.kebutuhan, contoh.stokAkhir, contoh.persenBuffer, "stok-target")).toEqual({
      rumus: "stok-target",
      kebutuhan: 56,
      stokAkhir: 20,
      persenPengali: 120,
      stokTarget: 68,
      // 47,2 dalam perseratus.
      hasilPerseratus: 4720,
      jumlahKirim: 48,
    });
  });

  it("contoh UAT 2026-10-14: 7 × 120% − 6 = 2,4 → 3", () => {
    expect(rincianJumlahKirim(7, 6, 20, "stok-target")).toMatchObject({ stokTarget: 9, hasilPerseratus: 240, jumlahKirim: 3 });
  });

  it.each(fixture.kasusJumlahKirim)(
    "stok target dan jumlah kirim sesuai golden: kebutuhan $kebutuhan, stok $stokAkhir, buffer $persenBuffer% → $stokTarget, $jumlahKirim",
    ({ kebutuhan, stokAkhir, persenBuffer, stokTarget, jumlahKirim }) => {
      expect(rincianJumlahKirim(kebutuhan, stokAkhir, persenBuffer, "stok-target")).toMatchObject({ stokTarget, jumlahKirim });
    },
  );

  it("stok melebihi stok target: hasil negatif, jumlah kirim 0", () => {
    expect(rincianJumlahKirim(56, 70, 20, "stok-target")).toMatchObject({ stokTarget: 68, hasilPerseratus: -280, jumlahKirim: 0 });
  });
});

describe("rincianJumlahKirim — rumus lama (rencana final sebelum PRD A6 ▶ Revisi 2026-10-14)", () => {
  it("contoh pemilik lama: (56 − 20) × 120% = 43,2 → dibulatkan ke atas 44", () => {
    const [contoh] = fixture.kasusJumlahKirimRumusLama.kasus;
    expect(contoh).toMatchObject({ kebutuhan: 56, stokAkhir: 20, persenBuffer: 20, jumlahKirim: 44 });
    expect(rincianJumlahKirim(contoh.kebutuhan, contoh.stokAkhir, contoh.persenBuffer, "lama")).toEqual({
      rumus: "lama",
      kebutuhan: 56,
      stokAkhir: 20,
      persenPengali: 120,
      // 43,2 dalam perseratus.
      hasilPerseratus: 4320,
      jumlahKirim: 44,
    });
  });

  it.each(fixture.kasusJumlahKirimRumusLama.kasus)(
    "jumlah kirim sesuai golden: kebutuhan $kebutuhan, stok $stokAkhir, buffer $persenBuffer% → $jumlahKirim",
    ({ kebutuhan, stokAkhir, persenBuffer, jumlahKirim }) => {
      expect(rincianJumlahKirim(kebutuhan, stokAkhir, persenBuffer, "lama").jumlahKirim).toBe(jumlahKirim);
    },
  );

  it("stok melebihi kebutuhan: hasil kali negatif, jumlah kirim 0", () => {
    expect(rincianJumlahKirim(56, 60, 20, "lama")).toMatchObject({ hasilPerseratus: -480, jumlahKirim: 0 });
  });

  it.each([
    ["kebutuhan pecahan", 56.5, 20, 20],
    ["stok pecahan", 56, 20.5, 20],
    ["buffer negatif", 56, 20, -10],
  ])("menolak %s", (_nama, kebutuhan, stokAkhir, persenBuffer) => {
    expect(() => rincianJumlahKirim(kebutuhan, stokAkhir, persenBuffer, "lama")).toThrow(RangeError);
  });
});
