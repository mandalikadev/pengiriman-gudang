import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bagiBulatAtas, bagiBulatBawah, hitungJumlahKirim } from "./angka";

type KasusJumlahKirim = {
  kebutuhan: number;
  stokAkhir: number;
  persenBuffer: number;
  jumlahKirim: number;
  catatan: string;
};

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../tests/golden/jumlah-kirim.json"), "utf8"),
) as { kasusJumlahKirim: KasusJumlahKirim[] };

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
