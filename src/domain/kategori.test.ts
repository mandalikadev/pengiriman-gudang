import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTanggalBisnis, posisiLaporan } from "./kalender";
import { kategoriEfektif, type PerubahanKategori } from "./kategori";

type PerubahanFixture = Omit<PerubahanKategori, "tanggal"> & { tanggal: string };

type KasusKategori = {
  tanggal: string;
  toko: string;
  kategoriDasar: string;
  kategoriEfektif: string;
  sumberKategori: string;
  bulanLaporan: string;
  mingguLaporan: number;
  catatan: string;
};

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../tests/golden/kategori-efektif.json"), "utf8"),
) as { perubahan: PerubahanFixture[]; kasus: KasusKategori[] };

const daftarPerubahan: PerubahanKategori[] = fixture.perubahan.map((perubahan) => ({
  ...perubahan,
  tanggal: parseTanggalBisnis(perubahan.tanggal),
}));

describe("kategoriEfektif (golden kategori-efektif)", () => {
  it.each(fixture.kasus)("$tanggal $toko: $catatan", (kasus) => {
    const tanggal = parseTanggalBisnis(kasus.tanggal);

    expect(kategoriEfektif(tanggal, kasus.toko, daftarPerubahan)).toEqual({
      kategoriEfektif: kasus.kategoriEfektif,
      sumberKategori: kasus.sumberKategori,
    });
  });

  it.each(fixture.kasus)("$tanggal $toko: posisi laporan tetap dari kategori dasar", (kasus) => {
    expect(posisiLaporan(parseTanggalBisnis(kasus.tanggal))).toMatchObject({
      kategoriDasar: kasus.kategoriDasar,
      bulanLaporan: kasus.bulanLaporan,
      mingguLaporan: kasus.mingguLaporan,
    });
  });

  it("tanpa perubahan sama sekali memakai kategori dasar", () => {
    expect(kategoriEfektif(parseTanggalBisnis("2026-06-30"), "PMS", [])).toEqual({
      kategoriEfektif: "Senin–Kamis",
      sumberKategori: "dasar",
    });
  });
});
