import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatTanggal, geserHari, kisiBulan, parseTanggalBisnis, posisiLaporan, tanggalDalamBulanLaporan } from "./kalender";

type KasusKalender = {
  tanggal: string;
  hari: string;
  kategoriDasar: string;
  tanggalAcuan: string;
  bulanLaporan: string;
  mingguLaporan: number;
  baris: string;
};

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../tests/golden/kalender-minggu-laporan.json"), "utf8"),
) as { format: { contoh: string }; kasus: KasusKalender[] };

describe("posisiLaporan (golden kalender-minggu-laporan)", () => {
  it.each(fixture.kasus)("$tanggal ($hari, baris $baris)", (kasus) => {
    expect(posisiLaporan(parseTanggalBisnis(kasus.tanggal))).toEqual({
      kategoriDasar: kasus.kategoriDasar,
      tanggalAcuan: kasus.tanggalAcuan,
      bulanLaporan: kasus.bulanLaporan,
      mingguLaporan: kasus.mingguLaporan,
    });
  });
});

describe("formatTanggal", () => {
  it("menampilkan format Indonesia sesuai contoh PRD B8", () => {
    expect(formatTanggal(parseTanggalBisnis("2026-06-05"))).toBe("Jumat, 05-06-2026");
    expect(fixture.format.contoh).toBe("Jumat, 05-06-2026");
  });

  it.each(fixture.kasus)("nama hari $tanggal = $hari", (kasus) => {
    expect(formatTanggal(parseTanggalBisnis(kasus.tanggal)).split(",")[0]).toBe(kasus.hari);
  });
});

describe("parseTanggalBisnis", () => {
  it.each(["2026-06-05", "2024-02-29", "2000-02-29", "2026-12-31", "2026-01-01"])(
    "menerima %s",
    (teks) => {
      expect(parseTanggalBisnis(teks)).toBe(teks);
    },
  );

  it.each([
    "2026-06-31",
    "2026-04-31",
    "2026-02-29",
    "1900-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-06-00",
    "2026-6-5",
    "05-06-2026",
    "2026-06-05T00:00:00Z",
    "0000-01-01",
    "",
  ])("menolak %s", (teks) => {
    expect(() => parseTanggalBisnis(teks)).toThrow(RangeError);
  });
});

describe("tanggalDalamBulanLaporan (PRD B5)", () => {
  it("Juli 2026 dimulai 29 Juni (Senin–Kamis acuan Kamis 2 Juli) dan berakhir 31 Juli", () => {
    const juli = tanggalDalamBulanLaporan(2026, 7);
    expect(juli.slice(0, 6)).toEqual(["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"]);
    expect(juli.at(-1)).toBe("2026-07-31");
  });

  it("Juni 2026 tidak memuat 29–30 Juni (PRD B7)", () => {
    const juni = tanggalDalamBulanLaporan(2026, 6);
    expect(juni[0]).toBe("2026-06-01");
    expect(juni.at(-1)).toBe("2026-06-28");
    expect(juni).toHaveLength(28);
  });

  it("Januari 2026 memuat 29–31 Desember 2025; Desember 2026 memuat 28–31 Desember", () => {
    expect(tanggalDalamBulanLaporan(2026, 1).slice(0, 3)).toEqual(["2025-12-29", "2025-12-30", "2025-12-31"]);
    expect(tanggalDalamBulanLaporan(2026, 12).slice(-4)).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31"]);
  });
});

describe("geserHari", () => {
  it.each([
    ["2026-06-08", -2, "2026-06-06"],
    ["2026-06-08", 0, "2026-06-08"],
    ["2026-06-08", 6, "2026-06-14"],
    ["2026-07-01", -1, "2026-06-30"],
    ["2026-01-01", -1, "2025-12-31"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2028-03-01", -1, "2028-02-29"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2026-06-20", 13, "2026-07-03"],
  ])("%s digeser %i hari = %s", (awal, jumlah, harapan) => {
    expect(geserHari(parseTanggalBisnis(awal), jumlah)).toBe(harapan);
  });
});

describe("kisiBulan (PRD B1: susunan Senin–Minggu)", () => {
  it("Mei 2026: lima baris dari Senin 27 April sampai Minggu 31 Mei", () => {
    const kisi = kisiBulan(2026, 5);
    expect(kisi).toHaveLength(5);
    expect(kisi[0]).toEqual(["2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30", "2026-05-01", "2026-05-02", "2026-05-03"]);
    expect(kisi[1]).toEqual(["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07", "2026-05-08", "2026-05-09", "2026-05-10"]);
    expect(kisi.at(-1)?.at(-1)).toBe("2026-05-31");
  });

  it("Februari 2027 (1 Februari hari Senin, 28 hari) tepat empat baris", () => {
    const kisi = kisiBulan(2027, 2);
    expect(kisi.map((baris) => [baris[0], baris[6]])).toEqual([
      ["2027-02-01", "2027-02-07"],
      ["2027-02-08", "2027-02-14"],
      ["2027-02-15", "2027-02-21"],
      ["2027-02-22", "2027-02-28"],
    ]);
  });

  it("Desember 2025 berakhir di baris 29 Desember 2025 – 4 Januari 2026; setiap baris Senin–Minggu", () => {
    const kisi = kisiBulan(2025, 12);
    expect(kisi[0]?.[0]).toBe("2025-12-01");
    expect(kisi.at(-1)).toEqual(["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
    for (const baris of kisi) {
      expect(formatTanggal(baris[0]!).startsWith("Senin,")).toBe(true);
      expect(formatTanggal(baris[6]!).startsWith("Minggu,")).toBe(true);
    }
  });

  it("menolak bulan di luar 1–12", () => {
    expect(() => kisiBulan(2026, 13)).toThrow(RangeError);
    expect(() => kisiBulan(2026, 0)).toThrow(RangeError);
  });
});
