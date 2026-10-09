import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { bacaFileRanking } from "./baca-file-ranking";

type Sel = string | number | null;
type BarisGolden = { baris: number; rank: number; variant: string; qtySales: number };

const golden = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../tests/golden/ranking-september-2026.json"), "utf8"),
) as {
  sheet: string;
  header: string[];
  barisKosongDiabaikan: number[];
  baris: BarisGolden[];
  tujuhBesar: string[];
  kasusError: { nama: string; jenis: string; header: string[]; baris: Sel[][] }[];
};

/** Workbook kecil buatan test; baris = array sel mulai kolom A. */
function buatWorkbook(sheet: Record<string, Sel[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [nama, baris] of Object.entries(sheet)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(baris), nama);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("bacaFileRanking", () => {
  it("file .xlsx seperti golden → semua baris dan tujuh besar sesuai; baris kosong diabaikan", () => {
    const baris: Sel[][] = [golden.header];
    for (const b of golden.baris) baris[b.baris - 1] = [b.rank, b.variant, b.qtySales];
    for (const nomor of golden.barisKosongDiabaikan) baris[nomor - 1] = [null, " ", null];

    const hasil = bacaFileRanking(buatWorkbook({ Ringkas: [["catatan"]], [golden.sheet]: baris }));

    expect(hasil).toEqual({ ok: true, baris: golden.baris, tujuhBesar: golden.tujuhBesar });
  });

  it.each(golden.kasusError)("$nama → ditolak dengan jenis $jenis", (kasus) => {
    const hasil = bacaFileRanking(buatWorkbook({ [golden.sheet]: [kasus.header, ...kasus.baris] }));

    expect(hasil.ok).toBe(false);
    expect(hasil.ok ? [] : hasil.error.map((e) => e.jenis)).toContain(kasus.jenis);
  });

  it("workbook tanpa sheet RANKING SALES → struktur-tidak-sesuai", () => {
    const hasil = bacaFileRanking(buatWorkbook({ Sheet1: [["RANK", "VARIANT", "QTY SALES"], [1, "A", 1]] }));
    expect(hasil.ok ? [] : hasil.error.map((e) => e.jenis)).toEqual(["struktur-tidak-sesuai"]);
  });
});
