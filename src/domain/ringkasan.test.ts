import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTanggalBisnis, posisiLaporan, type KategoriDasar, type TanggalBisnis } from "./kalender";
import {
  hitungLaporan,
  hitungPerbandinganMingguSama,
  hitungRingkasan,
  type MasukanNilaiMingguan,
  type MasukanRataRataBulanan,
} from "./laporan";

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../tests/golden/laporan-15GL-GOR-PMS-juni.json"), "utf8"),
) as {
  pengamatan: { tanggal: string; qty: number; selSumber: string }[];
  harapan: {
    nilaiMingguan: (MasukanNilaiMingguan & { tanggal: string[] })[];
    rataRataBulananJuni: (Omit<MasukanRataRataBulanan, "kelengkapan"> & { pembagiMinggu: number })[];
  };
};

const kategoriDasar = (tanggal: TanggalBisnis): KategoriDasar => posisiLaporan(tanggal).kategoriDasar;

const hasilGolden = hitungLaporan({
  pengamatan: fixture.pengamatan.map(({ tanggal, qty, selSumber }) => ({
    tanggal: parseTanggalBisnis(tanggal),
    qty,
    selSumber,
  })),
  kategoriEfektif: kategoriDasar,
  bulanPilihan: ["2026-06", "2026-07"],
});

function rataRata(
  bulanLaporan: string,
  kategori: KategoriDasar,
  nilai: number,
  kelengkapan: "lengkap" | "parsial" = "lengkap",
): MasukanRataRataBulanan {
  return { bulanLaporan, kategori, rataRataBulanan: nilai, kelengkapan };
}

describe("hitungRingkasan (golden laporan-15GL-GOR-PMS-juni)", () => {
  it("Juni saja: Senin–Kamis 1, Jumat 0, Sabtu 1, Minggu 0 (OD-09)", () => {
    const masukan = fixture.harapan.rataRataBulananJuni.map((nilai) => ({ ...nilai, kelengkapan: "lengkap" as const }));
    expect(
      hitungRingkasan(masukan, ["2026-06"]).map(({ kategori, rataRataRingkasan, pembagiBulan, kelengkapan }) => ({
        kategori,
        rataRataRingkasan,
        pembagiBulan,
        kelengkapan,
      })),
    ).toEqual([
      { kategori: "Senin–Kamis", rataRataRingkasan: 1, pembagiBulan: 1, kelengkapan: "lengkap" },
      { kategori: "Jumat", rataRataRingkasan: 0, pembagiBulan: 1, kelengkapan: "lengkap" },
      { kategori: "Sabtu", rataRataRingkasan: 1, pembagiBulan: 1, kelengkapan: "lengkap" },
      { kategori: "Minggu", rataRataRingkasan: 0, pembagiBulan: 1, kelengkapan: "lengkap" },
    ]);
  });

  it("Juni–Juli: Senin–Kamis ⌈(1 + 0)/2⌉ = 1, parsial karena Juli M1 parsial (OD-08, T04)", () => {
    const ringkasan = hitungRingkasan(hasilGolden.rataRataBulanan, ["2026-06", "2026-07"]);
    expect(ringkasan.find((nilai) => nilai.kategori === "Senin–Kamis")).toEqual({
      kategori: "Senin–Kamis",
      bulanLaporan: ["2026-06", "2026-07"],
      jumlahRataRataBulanan: 1,
      pembagiBulan: 2,
      rataRataRingkasan: 1,
      kelengkapan: "parsial",
    });
  });

  it("hasil sama dengan Ringkasan hitungLaporan", () => {
    expect(hitungRingkasan(hasilGolden.rataRataBulanan, ["2026-06", "2026-07"])).toEqual(
      hasilGolden.rataRataRingkasan,
    );
  });
});

describe("hitungRingkasan (PRD A2)", () => {
  it("rata-rata bulanan Juni 1 dan Juli 2 → Ringkasan ⌈3/2⌉ = 2", () => {
    expect(hitungRingkasan([rataRata("2026-06", "Sabtu", 1), rataRata("2026-07", "Sabtu", 2)], ["2026-06", "2026-07"])).toEqual([
      {
        kategori: "Sabtu",
        bulanLaporan: ["2026-06", "2026-07"],
        jumlahRataRataBulanan: 3,
        pembagiBulan: 2,
        rataRataRingkasan: 2,
        kelengkapan: "lengkap",
      },
    ]);
  });

  it("bulan pilihan tanpa hasil tidak menambah pembagi", () => {
    const ringkasan = hitungRingkasan(
      [rataRata("2026-07", "Sabtu", 2), rataRata("2026-06", "Sabtu", 1)],
      ["2026-08", "2026-06", "2026-01", "2026-07"],
    );
    expect(ringkasan).toEqual([
      {
        kategori: "Sabtu",
        bulanLaporan: ["2026-06", "2026-07"],
        jumlahRataRataBulanan: 3,
        pembagiBulan: 2,
        rataRataRingkasan: 2,
        kelengkapan: "lengkap",
      },
    ]);
  });

  it("rata-rata bulanan di luar bulan pilihan tidak ikut dihitung", () => {
    const ringkasan = hitungRingkasan(
      [rataRata("2026-06", "Sabtu", 1), rataRata("2026-07", "Sabtu", 2), rataRata("2026-05", "Sabtu", 9, "parsial")],
      ["2026-06", "2026-07"],
    );
    expect(ringkasan).toEqual([
      expect.objectContaining({ bulanLaporan: ["2026-06", "2026-07"], pembagiBulan: 2, rataRataRingkasan: 2, kelengkapan: "lengkap" }),
    ]);
  });

  it("parsial jika ada rata-rata bulanan pembentuk yang parsial; lengkap jika semuanya lengkap (OD-08, T04)", () => {
    const masukan = [
      rataRata("2026-06", "Senin–Kamis", 2, "parsial"),
      rataRata("2026-07", "Senin–Kamis", 1),
      rataRata("2026-06", "Jumat", 4),
      rataRata("2026-07", "Jumat", 3),
    ];
    expect(
      hitungRingkasan(masukan, ["2026-06", "2026-07"]).map(({ kategori, kelengkapan }) => ({ kategori, kelengkapan })),
    ).toEqual([
      { kategori: "Senin–Kamis", kelengkapan: "parsial" },
      { kategori: "Jumat", kelengkapan: "lengkap" },
    ]);
  });

  it("kategori tanpa rata-rata bulanan tidak muncul", () => {
    expect(hitungRingkasan([], ["2026-06"])).toEqual([]);
  });

  it("menolak bulan pilihan tidak valid dan rata-rata bulanan ganda", () => {
    expect(() => hitungRingkasan([], [])).toThrow(RangeError);
    expect(() => hitungRingkasan([], ["2026-13"])).toThrow(RangeError);
    expect(() =>
      hitungRingkasan([rataRata("2026-06", "Sabtu", 1), rataRata("2026-06", "Sabtu", 2)], ["2026-06"]),
    ).toThrow(RangeError);
  });
});

describe("hitungPerbandinganMingguSama", () => {
  it("golden: Senin–Kamis M1 Juni 1 dan Juli 0 → ⌈1/2⌉ = 1", () => {
    const perbandingan = hitungPerbandinganMingguSama(fixture.harapan.nilaiMingguan, ["2026-06", "2026-07"]);
    expect(
      perbandingan.find((nilai) => nilai.kategori === "Senin–Kamis" && nilai.mingguLaporan === 1),
    ).toEqual({
      kategori: "Senin–Kamis",
      mingguLaporan: 1,
      bulanLaporan: ["2026-06", "2026-07"],
      jumlahNilaiMingguan: 1,
      pembagiBulan: 2,
      rataRataMingguSama: 1,
    });
  });

  it("golden: hasil dari nilai mingguan fixture sama dengan hitungLaporan", () => {
    expect(hitungPerbandinganMingguSama(fixture.harapan.nilaiMingguan, ["2026-06", "2026-07"])).toEqual(
      hasilGolden.perbandinganMingguSama,
    );
  });

  it("Minggu 1 Juni = 1, Minggu 1 Juli = 3 → ⌈4/2⌉ = 2; bulan tanpa nilai tidak menambah pembagi", () => {
    expect(
      hitungPerbandinganMingguSama(
        [
          { bulanLaporan: "2026-07", mingguLaporan: 1, kategori: "Sabtu", nilaiMingguan: 3 },
          { bulanLaporan: "2026-06", mingguLaporan: 1, kategori: "Sabtu", nilaiMingguan: 1 },
        ],
        ["2026-06", "2026-07", "2026-08"],
      ),
    ).toEqual([
      {
        kategori: "Sabtu",
        mingguLaporan: 1,
        bulanLaporan: ["2026-06", "2026-07"],
        jumlahNilaiMingguan: 4,
        pembagiBulan: 2,
        rataRataMingguSama: 2,
      },
    ]);
  });

  it("nilai mingguan di luar bulan pilihan tidak ikut dihitung", () => {
    expect(
      hitungPerbandinganMingguSama(
        [
          { bulanLaporan: "2026-06", mingguLaporan: 1, kategori: "Sabtu", nilaiMingguan: 1 },
          { bulanLaporan: "2026-05", mingguLaporan: 1, kategori: "Sabtu", nilaiMingguan: 9 },
        ],
        ["2026-06"],
      ),
    ).toEqual([expect.objectContaining({ bulanLaporan: ["2026-06"], pembagiBulan: 1, rataRataMingguSama: 1 })]);
  });

  it("menolak bulan pilihan tidak valid dan nilai mingguan ganda", () => {
    expect(() => hitungPerbandinganMingguSama([], ["2026-6"])).toThrow(RangeError);
    const satu = { bulanLaporan: "2026-06", mingguLaporan: 1, kategori: "Sabtu" as const, nilaiMingguan: 1 };
    expect(() => hitungPerbandinganMingguSama([satu, satu], ["2026-06"])).toThrow(RangeError);
  });
});
