import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { bacaRanking, type SelMentah } from "./ranking";

// PRD A6 (▶ Keputusan OD-05): sheet `RANKING SALES`, header baris 1 `RANK`, `VARIANT`, `QTY SALES`.

type BarisGolden = { baris: number; rank: number; variant: string; qtySales: number };
type KasusError = { nama: string; jenis: string; header: string[]; baris: SelMentah[][]; hasil: "ditolak" };

const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../tests/golden/ranking-september-2026.json"), "utf8"),
) as {
  sheet: string;
  header: string[];
  barisKosongDiabaikan: number[];
  baris: BarisGolden[];
  tujuhBesar: string[];
  kasusError: KasusError[];
};

/** Baris sel mentah sheet golden: baris data pada nomor baris Excel-nya, baris kosong diisi sel kosong. */
function barisSheetGolden(): SelMentah[][] {
  const terakhir = Math.max(...golden.baris.map((b) => b.baris), ...golden.barisKosongDiabaikan);
  const hasil: SelMentah[][] = [golden.header];
  for (let nomor = 2; nomor <= terakhir; nomor++) {
    const b = golden.baris.find((x) => x.baris === nomor);
    hasil.push(b ? [b.rank, b.variant, b.qtySales] : [null, "  ", null]);
  }
  return hasil;
}

const HEADER: SelMentah[] = ["RANK", "VARIANT", "QTY SALES"];

function sheetRanking(baris: SelMentah[][], header: SelMentah[] = HEADER) {
  return [{ nama: "RANKING SALES", baris: [header, ...baris] }];
}

function jenisError(hasil: ReturnType<typeof bacaRanking>): string[] {
  return hasil.ok ? [] : hasil.error.map((e) => e.jenis);
}

describe("bacaRanking — golden ranking-september-2026", () => {
  it("semua baris dan tujuh besar sesuai golden; baris kosong diabaikan", () => {
    const hasil = bacaRanking([{ nama: "LAIN", baris: [["x"]] }, { nama: golden.sheet, baris: barisSheetGolden() }]);

    expect(hasil).toEqual({ ok: true, baris: golden.baris, tujuhBesar: golden.tujuhBesar });
  });

  it.each(golden.kasusError)("$nama → ditolak dengan jenis $jenis", (kasus) => {
    const hasil = bacaRanking(sheetRanking(kasus.baris, kasus.header));

    expect(hasil.ok).toBe(false);
    expect(jenisError(hasil)).toContain(kasus.jenis);
  });
});

describe("bacaRanking — error membawa jenis, baris, dan pesan", () => {
  it("rank ganda dilaporkan pada baris kemunculan kedua", () => {
    const hasil = bacaRanking(
      sheetRanking([
        [1, "A", 3],
        [2, "B", 2],
        [2, "C", 1],
      ]),
    );
    expect(hasil.ok).toBe(false);
    if (hasil.ok) return;
    expect(hasil.error).toEqual([expect.objectContaining({ jenis: "rank-ganda", baris: 4 })]);
    expect(hasil.error[0]!.pesan).toMatch(/RANK 2/);
  });

  it("rank loncat dilaporkan pada baris rank pertama setelah celah", () => {
    const hasil = bacaRanking(
      sheetRanking([
        [1, "A", 3],
        [2, "B", 2],
        [4, "C", 1],
      ]),
    );
    expect(hasil.ok).toBe(false);
    if (hasil.ok) return;
    expect(hasil.error).toEqual([expect.objectContaining({ jenis: "rank-loncat", baris: 4 })]);
    expect(hasil.error[0]!.pesan).toMatch(/RANK 3/);
  });

  it("rank tidak dimulai dari 1 adalah loncat", () => {
    const hasil = bacaRanking(sheetRanking([[2, "A", 3]]));
    expect(jenisError(hasil)).toEqual(["rank-loncat"]);
  });

  it.each<[string, SelMentah]>([
    ["pecahan", 1.5],
    ["nol", 0],
    ["negatif", -1],
    ["teks", "1"],
    ["kosong", null],
  ])("RANK %s ditolak", (_nama, rank) => {
    const hasil = bacaRanking(sheetRanking([[rank, "A", 3]]));
    expect(jenisError(hasil)).toEqual(["rank-tidak-valid"]);
  });

  it("VARIANT ganda ditolak, termasuk yang hanya beda huruf besar/spasi", () => {
    const hasil = bacaRanking(
      sheetRanking([
        [1, "HOLY SWEET", 3],
        [2, " holy  sweet ", 2],
      ]),
    );
    expect(hasil.ok).toBe(false);
    if (hasil.ok) return;
    expect(hasil.error).toEqual([expect.objectContaining({ jenis: "variant-ganda", baris: 3 })]);
  });

  it("VARIANT kosong (spasi saja) ditolak", () => {
    const hasil = bacaRanking(sheetRanking([[1, "   ", 3]]));
    expect(jenisError(hasil)).toEqual(["variant-kosong"]);
  });

  it("QTY SALES negatif ditolak", () => {
    const hasil = bacaRanking(sheetRanking([[1, "A", -5]]));
    expect(hasil.ok).toBe(false);
    if (hasil.ok) return;
    expect(hasil.error).toEqual([expect.objectContaining({ jenis: "qty-sales-negatif", baris: 2 })]);
  });

  it.each<[string, SelMentah]>([
    ["pecahan", 2.5],
    ["teks", "6548"],
    ["kosong", null],
  ])("QTY SALES %s ditolak", (_nama, qty) => {
    const hasil = bacaRanking(sheetRanking([[1, "A", qty]]));
    expect(jenisError(hasil)).toEqual(["qty-sales-tidak-valid"]);
  });

  it("QTY SALES nol diterima", () => {
    const hasil = bacaRanking(sheetRanking([[1, "A", 0]]));
    expect(hasil).toEqual({ ok: true, baris: [{ baris: 2, rank: 1, variant: "A", qtySales: 0 }], tujuhBesar: ["A"] });
  });

  it("semua error baris dikumpulkan, bukan hanya yang pertama", () => {
    const hasil = bacaRanking(
      sheetRanking([
        [1, null, 3],
        [2, "B", -1],
      ]),
    );
    expect(jenisError(hasil)).toEqual(["variant-kosong", "qty-sales-negatif"]);
  });
});

describe("bacaRanking — struktur", () => {
  it("sheet RANKING SALES tidak ada → struktur-tidak-sesuai", () => {
    const hasil = bacaRanking([{ nama: "Sheet1", baris: [HEADER, [1, "A", 3]] }]);
    expect(hasil.ok).toBe(false);
    if (hasil.ok) return;
    expect(hasil.error).toEqual([expect.objectContaining({ jenis: "struktur-tidak-sesuai" })]);
    expect(hasil.error[0]!.pesan).toMatch(/RANKING SALES/);
  });

  it.each<[string, SelMentah[]]>([
    ["urutan kolom tertukar", ["VARIANT", "RANK", "QTY SALES"]],
    ["kolom kurang", ["RANK", "VARIANT"]],
    ["kolom tambahan", ["RANK", "VARIANT", "QTY SALES", "CATATAN"]],
    ["huruf kecil", ["rank", "variant", "qty sales"]],
  ])("header %s → struktur-tidak-sesuai di baris 1", (_nama, header) => {
    const hasil = bacaRanking(sheetRanking([[1, "A", 3]], header));
    expect(hasil.ok).toBe(false);
    if (hasil.ok) return;
    expect(hasil.error).toEqual([expect.objectContaining({ jenis: "struktur-tidak-sesuai", baris: 1 })]);
  });

  it("isi di luar kolom A–C → struktur-tidak-sesuai pada baris itu", () => {
    const hasil = bacaRanking(sheetRanking([[1, "A", 3, "catatan"]]));
    expect(hasil.ok).toBe(false);
    if (hasil.ok) return;
    expect(hasil.error).toEqual([expect.objectContaining({ jenis: "struktur-tidak-sesuai", baris: 2 })]);
  });

  it("baris kosong di tengah diabaikan, nomor baris tetap sesuai file", () => {
    const hasil = bacaRanking(sheetRanking([[1, "A", 3], [], [null, "", null], [2, "B", 1]]));
    expect(hasil).toEqual({
      ok: true,
      baris: [
        { baris: 2, rank: 1, variant: "A", qtySales: 3 },
        { baris: 5, rank: 2, variant: "B", qtySales: 1 },
      ],
      tujuhBesar: ["A", "B"],
    });
  });

  it("tujuh besar mengikuti RANK 1–7, bukan urutan baris di file", () => {
    const baris: SelMentah[][] = [9, 8, 7, 6, 5, 4, 3, 2, 1].map((r) => [r, `V${r}`, 10 - r]);
    const hasil = bacaRanking(sheetRanking(baris));
    expect(hasil.ok && hasil.tujuhBesar).toEqual(["V1", "V2", "V3", "V4", "V5", "V6", "V7"]);
  });
});
