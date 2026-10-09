import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatTanggal, parseTanggalBisnis, posisiLaporan, tanggalDalamBulanLaporan } from "./kalender";

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
