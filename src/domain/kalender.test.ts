import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatTanggal, parseTanggalBisnis, posisiLaporan } from "./kalender";

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
