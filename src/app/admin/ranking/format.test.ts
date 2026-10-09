import { describe, expect, it } from "vitest";

import { saranBulanRanking } from "./format";

describe("saranBulanRanking (nama file hanya saran isian awal, PRD A6 ▶ OD-05)", () => {
  it("nama file contoh pemilik → September 2026", () => {
    expect(saranBulanRanking("RANKING-SALES-SEPTEMBER-2026.xlsx")).toEqual({ tahun: "2026", bulan: "9" });
  });

  it("nama bulan Indonesia atau Inggris, huruf apa pun, pemisah apa pun", () => {
    expect(saranBulanRanking("ranking sales agustus 2026.xlsx")).toEqual({ tahun: "2026", bulan: "8" });
    expect(saranBulanRanking("Ranking_October_2025.xlsx")).toEqual({ tahun: "2025", bulan: "10" });
    expect(saranBulanRanking("RANKING-MEI.xlsx")).toEqual({ tahun: "", bulan: "5" });
  });

  it("tidak bisa ditebak → kosong; nama yang hanya memuat nama bulan sebagai bagian kata tidak dianggap bulan", () => {
    expect(saranBulanRanking("ranking.xlsx")).toEqual({ tahun: "", bulan: "" });
    expect(saranBulanRanking("MAYORA-12345.xlsx")).toEqual({ tahun: "", bulan: "" });
  });
});
