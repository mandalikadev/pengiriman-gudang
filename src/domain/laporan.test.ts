import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTanggalBisnis, posisiLaporan, type KategoriDasar, type TanggalBisnis } from "./kalender";
import { hitungLaporan, type Pengamatan } from "./laporan";

type NilaiMingguanFixture = {
  bulanLaporan: string;
  mingguLaporan: number;
  kategori: KategoriDasar;
  tanggal: string[];
  jumlahQty: number;
  pembagiTanggal: number | null;
  nilaiMingguan: number;
};

type RataRataBulananFixture = {
  bulanLaporan: string;
  kategori: KategoriDasar;
  jumlahNilaiMingguan: number;
  pembagiMinggu: number;
  rataRataBulanan: number;
};

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../tests/golden/laporan-15GL-GOR-PMS-juni.json"), "utf8"),
) as {
  pengamatan: { tanggal: string; qty: number; selSumber: string }[];
  harapan: {
    nilaiMingguan: NilaiMingguanFixture[];
    rataRataBulananJuni: RataRataBulananFixture[];
    totalPenjualanMentahJuni: number;
  };
};

const pengamatanJuni: Pengamatan[] = fixture.pengamatan.map(({ tanggal, qty, selSumber }) => ({
  tanggal: parseTanggalBisnis(tanggal),
  qty,
  selSumber,
}));

const kategoriDasar = (tanggal: TanggalBisnis): KategoriDasar => posisiLaporan(tanggal).kategoriDasar;

function amati(daftar: [string, number][]): Pengamatan[] {
  return daftar.map(([tanggal, qty], indeks) => ({
    tanggal: parseTanggalBisnis(tanggal),
    qty,
    selSumber: `UJI!A${indeks + 1}`,
  }));
}

describe("hitungLaporan (golden laporan-15GL-GOR-PMS-juni)", () => {
  const hasil = hitungLaporan({
    pengamatan: pengamatanJuni,
    kategoriEfektif: kategoriDasar,
    bulanPilihan: ["2026-06", "2026-07"],
  });

  it("menghasilkan tepat kelompok mingguan yang ada di fixture", () => {
    expect(hasil.nilaiMingguan).toHaveLength(fixture.harapan.nilaiMingguan.length);
  });

  it.each(fixture.harapan.nilaiMingguan)(
    "nilai mingguan $bulanLaporan M$mingguLaporan $kategori = $nilaiMingguan",
    (harapan) => {
      const kelompok = hasil.nilaiMingguan.find(
        (nilai) =>
          nilai.bulanLaporan === harapan.bulanLaporan &&
          nilai.mingguLaporan === harapan.mingguLaporan &&
          nilai.kategori === harapan.kategori,
      );
      expect(kelompok).toMatchObject({
        tanggal: harapan.tanggal,
        jumlahQty: harapan.jumlahQty,
        pembagiTanggal: harapan.pembagiTanggal,
        nilaiMingguan: harapan.nilaiMingguan,
      });
    },
  );

  it.each(fixture.harapan.rataRataBulananJuni)(
    "rata-rata bulanan $bulanLaporan $kategori = $rataRataBulanan",
    (harapan) => {
      const rataRata = hasil.rataRataBulanan.find(
        (nilai) => nilai.bulanLaporan === harapan.bulanLaporan && nilai.kategori === harapan.kategori,
      );
      expect(rataRata).toMatchObject({ ...harapan, kelengkapan: "lengkap" });
    },
  );

  it("total penjualan mentah Juni = 4, dalam field terpisah dari rata-rata", () => {
    expect(hasil.totalPenjualanMentah).toContainEqual({
      bulanLaporan: "2026-06",
      totalPenjualanMentah: fixture.harapan.totalPenjualanMentahJuni,
    });
  });

  it("kelompok Senin–Kamis Juli M1 dari 29–30 Juni bertanda parsial", () => {
    const juliM1 = hasil.nilaiMingguan.find(
      (nilai) => nilai.bulanLaporan === "2026-07" && nilai.mingguLaporan === 1 && nilai.kategori === "Senin–Kamis",
    );
    expect(juliM1).toMatchObject({
      tanggal: ["2026-06-29", "2026-06-30"],
      kelengkapan: "parsial",
      tanggalTidakTeramati: ["2026-07-01", "2026-07-02"],
    });
  });

  it("semua kelompok mingguan Juni lengkap", () => {
    const juni = hasil.nilaiMingguan.filter((nilai) => nilai.bulanLaporan === "2026-06");
    expect(juni.every((nilai) => nilai.kelengkapan === "lengkap")).toBe(true);
  });

  it("rata-rata bulanan Juli Senin–Kamis parsial karena kelompok pembentuknya parsial", () => {
    expect(
      hasil.rataRataBulanan.find((nilai) => nilai.bulanLaporan === "2026-07" && nilai.kategori === "Senin–Kamis"),
    ).toMatchObject({ jumlahNilaiMingguan: 0, pembagiMinggu: 1, rataRataBulanan: 0, kelengkapan: "parsial" });
  });

  it("menyimpan sel sumber setiap kelompok mingguan", () => {
    const juniM1Sabtu = hasil.nilaiMingguan.find(
      (nilai) => nilai.bulanLaporan === "2026-06" && nilai.mingguLaporan === 1 && nilai.kategori === "Sabtu",
    );
    expect(juniM1Sabtu?.selSumber).toEqual(["JUNI (S)!K4"]);
  });

  it("filter Juni saja tidak memasukkan 29–30 Juni (PRD B7)", () => {
    const hanyaJuni = hitungLaporan({
      pengamatan: pengamatanJuni,
      kategoriEfektif: kategoriDasar,
      bulanPilihan: ["2026-06"],
    });
    expect(hanyaJuni.nilaiMingguan.some((nilai) => nilai.bulanLaporan === "2026-07")).toBe(false);
    expect(hanyaJuni.totalPenjualanMentah).toEqual([{ bulanLaporan: "2026-06", totalPenjualanMentah: 4 }]);
  });
});

describe("hitungLaporan: Ringkasan", () => {
  // Sabtu 6 Juni qty 1 → rata-rata bulanan Juni 1; Sabtu 4 Juli qty 2 → rata-rata bulanan Juli 2.
  const pengamatan = amati([
    ["2026-06-06", 1],
    ["2026-07-04", 2],
  ]);

  it("rata-rata bulanan Juni 1 dan Juli 2 → Ringkasan ⌈3/2⌉ = 2", () => {
    const hasil = hitungLaporan({
      pengamatan,
      kategoriEfektif: kategoriDasar,
      bulanPilihan: ["2026-06", "2026-07"],
    });
    expect(hasil.rataRataRingkasan).toEqual([
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

  it("bulan pilihan tanpa hasil tidak mengubah pembagi", () => {
    const hasil = hitungLaporan({
      pengamatan,
      kategoriEfektif: kategoriDasar,
      bulanPilihan: ["2026-08", "2026-06", "2026-01", "2026-07"],
    });
    expect(hasil.rataRataRingkasan).toEqual([
      {
        kategori: "Sabtu",
        bulanLaporan: ["2026-06", "2026-07"],
        jumlahRataRataBulanan: 3,
        pembagiBulan: 2,
        rataRataRingkasan: 2,
        kelengkapan: "lengkap",
      },
    ]);
    expect(hasil.rataRataBulanan.map((nilai) => nilai.bulanLaporan)).toEqual(["2026-06", "2026-07"]);
  });
});

describe("hitungLaporan: kelengkapan Ringkasan (OD-08)", () => {
  it("Juni parsial (hanya 1 dari 4 tanggal Senin–Kamis teramati) dan Juli lengkap → Ringkasan parsial", () => {
    const hasil = hitungLaporan({
      pengamatan: amati([
        ["2026-06-01", 2],
        ["2026-07-06", 1],
        ["2026-07-07", 1],
        ["2026-07-08", 1],
        ["2026-07-09", 1],
      ]),
      kategoriEfektif: kategoriDasar,
      bulanPilihan: ["2026-06", "2026-07"],
    });
    expect(hasil.rataRataBulanan.map(({ bulanLaporan, kelengkapan }) => ({ bulanLaporan, kelengkapan }))).toEqual([
      { bulanLaporan: "2026-06", kelengkapan: "parsial" },
      { bulanLaporan: "2026-07", kelengkapan: "lengkap" },
    ]);
    expect(hasil.rataRataRingkasan).toEqual([
      {
        kategori: "Senin–Kamis",
        bulanLaporan: ["2026-06", "2026-07"],
        jumlahRataRataBulanan: 3,
        pembagiBulan: 2,
        rataRataRingkasan: 2,
        kelengkapan: "parsial",
      },
    ]);
  });

  it("semua rata-rata bulanan pembentuk lengkap → Ringkasan lengkap", () => {
    const hasil = hitungLaporan({
      pengamatan: amati([
        ["2026-06-06", 1],
        ["2026-07-04", 2],
      ]),
      kategoriEfektif: kategoriDasar,
      bulanPilihan: ["2026-06", "2026-07"],
    });
    expect(hasil.rataRataBulanan.every((nilai) => nilai.kelengkapan === "lengkap")).toBe(true);
    expect(hasil.rataRataRingkasan.map((nilai) => nilai.kelengkapan)).toEqual(["lengkap"]);
  });
});

describe("hitungLaporan: perbandingan minggu sama", () => {
  it("Minggu 1 Juni = 1, Minggu 1 Juli = 3 → ⌈4/2⌉ = 2", () => {
    const hasil = hitungLaporan({
      pengamatan: amati([
        ["2026-06-06", 1],
        ["2026-07-04", 3],
      ]),
      kategoriEfektif: kategoriDasar,
      bulanPilihan: ["2026-06", "2026-07", "2026-08"],
    });
    expect(hasil.perbandinganMingguSama).toEqual([
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
});

describe("hitungLaporan: aturan tahap", () => {
  it("Senin–Kamis dibagi jumlah tanggal teramati dan dibulatkan ke atas; parsial jika ada tanggal tak teramati", () => {
    const hasil = hitungLaporan({
      pengamatan: amati([
        ["2026-06-08", 3],
        ["2026-06-09", 0],
        ["2026-06-10", 2],
      ]),
      kategoriEfektif: kategoriDasar,
      bulanPilihan: ["2026-06"],
    });
    expect(hasil.nilaiMingguan).toEqual([
      expect.objectContaining({
        bulanLaporan: "2026-06",
        mingguLaporan: 2,
        kategori: "Senin–Kamis",
        jumlahQty: 5,
        pembagiTanggal: 3,
        nilaiMingguan: 2,
        kelengkapan: "parsial",
        tanggalTidakTeramati: ["2026-06-11"],
      }),
    ]);
  });

  it("Jumat/Sabtu/Minggu memakai total; tanggal yang kategorinya diubah tetap di posisi aslinya (PRD B6)", () => {
    // Selasa 30 Juni diubah menjadi Jumat → tetap Juli M1, bergabung dengan Jumat 3 Juli.
    const kategori = (tanggal: TanggalBisnis): KategoriDasar =>
      tanggal === "2026-06-30" ? "Jumat" : posisiLaporan(tanggal).kategoriDasar;
    const hasil = hitungLaporan({
      pengamatan: amati([
        ["2026-06-29", 1],
        ["2026-06-30", 2],
        ["2026-07-01", 1],
        ["2026-07-02", 1],
        ["2026-07-03", 4],
      ]),
      kategoriEfektif: kategori,
      bulanPilihan: ["2026-07"],
    });
    expect(hasil.nilaiMingguan).toEqual([
      expect.objectContaining({
        mingguLaporan: 1,
        kategori: "Senin–Kamis",
        tanggal: ["2026-06-29", "2026-07-01", "2026-07-02"],
        jumlahQty: 3,
        pembagiTanggal: 3,
        nilaiMingguan: 1,
        kelengkapan: "lengkap",
      }),
      expect.objectContaining({
        mingguLaporan: 1,
        kategori: "Jumat",
        tanggal: ["2026-06-30", "2026-07-03"],
        jumlahQty: 6,
        pembagiTanggal: null,
        nilaiMingguan: 6,
        kelengkapan: "lengkap",
      }),
    ]);
    expect(hasil.totalPenjualanMentah).toEqual([{ bulanLaporan: "2026-07", totalPenjualanMentah: 9 }]);
  });

  it("rata-rata bulanan membagi dengan jumlah minggu yang punya pengamatan saja", () => {
    const hasil = hitungLaporan({
      pengamatan: amati([
        ["2026-06-06", 1],
        ["2026-06-20", 4],
      ]),
      kategoriEfektif: kategoriDasar,
      bulanPilihan: ["2026-06"],
    });
    expect(hasil.rataRataBulanan).toEqual([
      {
        bulanLaporan: "2026-06",
        kategori: "Sabtu",
        jumlahNilaiMingguan: 5,
        pembagiMinggu: 2,
        rataRataBulanan: 3,
        kelengkapan: "lengkap",
      },
    ]);
  });
});

describe("hitungLaporan: validasi masukan", () => {
  it.each([[[]], [["2026-06", "2026-06"]], [["2026-6"]], [["2026-13"]]])("menolak bulan pilihan %j", (bulanPilihan) => {
    expect(() =>
      hitungLaporan({ pengamatan: [], kategoriEfektif: kategoriDasar, bulanPilihan }),
    ).toThrow(RangeError);
  });

  it("menolak lebih dari 12 bulan pilihan", () => {
    const bulanPilihan = Array.from({ length: 13 }, (_, i) => `${2025 + (i >= 12 ? 1 : 0)}-${String((i % 12) + 1).padStart(2, "0")}`);
    expect(() => hitungLaporan({ pengamatan: [], kategoriEfektif: kategoriDasar, bulanPilihan })).toThrow(
      RangeError,
    );
  });

  it("menolak pengamatan ganda pada tanggal yang sama", () => {
    expect(() =>
      hitungLaporan({
        pengamatan: amati([
          ["2026-06-06", 1],
          ["2026-06-06", 2],
        ]),
        kategoriEfektif: kategoriDasar,
        bulanPilihan: ["2026-06"],
      }),
    ).toThrow(RangeError);
  });

  it("menolak kuantitas negatif atau bukan bilangan bulat", () => {
    for (const qty of [-1, 1.5]) {
      expect(() =>
        hitungLaporan({
          pengamatan: amati([["2026-06-06", qty]]),
          kategoriEfektif: kategoriDasar,
          bulanPilihan: ["2026-06"],
        }),
      ).toThrow(RangeError);
    }
  });
});
