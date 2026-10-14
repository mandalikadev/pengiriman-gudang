import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatTanggal, parseTanggalBisnis, type KategoriDasar } from "./kalender";
import type { PerubahanKategori } from "./kategori";
import { cakupanPengiriman, hitungKebutuhanKirim, statusKirim, type MasukanKebutuhanKirim } from "./pengiriman";

type TanggalCakupanFixture = { tanggal: string; hari: string; kategoriEfektif: string };

type KasusJumlahKirim = { kebutuhan: number; stokAkhir: number; persenBuffer: number; jumlahKirim: number };

type KasusStatus = { stokAkhir?: number | null; klasifikasi?: "manual" | "otomatis"; status: string; catatan: string };

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../tests/golden/jumlah-kirim.json"), "utf8"),
) as {
  rataRata: Record<KategoriDasar, number>;
  kasusCakupan: {
    tanggalKirim: string;
    persiapanHari: 0 | 1 | 2;
    panjangCakupan: number;
    tanggalCakupan: TanggalCakupanFixture[];
    jumlahHari: number;
    kebutuhan: number;
  };
  kasusJumlahKirim: KasusJumlahKirim[];
  kasusStatus: KasusStatus[];
};

const { kasusCakupan } = fixture;

const PRODUK_OTOMATIS = { kode: "15GL-GOR", kategori: "PARFUM WANITA" };
const PRODUK_MANUAL = { kode: "DW110E-GOR-T", kategori: "DISPLAY WANITA" };

function masukan(ubah: Partial<MasukanKebutuhanKirim> = {}): MasukanKebutuhanKirim {
  return {
    tanggalKirim: parseTanggalBisnis(kasusCakupan.tanggalKirim),
    persiapanHari: kasusCakupan.persiapanHari,
    panjangCakupan: kasusCakupan.panjangCakupan,
    toko: "PMS",
    daftarPerubahan: [],
    rataRata: fixture.rataRata,
    produk: PRODUK_OTOMATIS,
    stokAkhir: 20,
    persenBuffer: 20,
    ...ubah,
  };
}

describe("hitungKebutuhanKirim — cakupan (golden jumlah-kirim kasusCakupan)", () => {
  const hasil = hitungKebutuhanKirim(masukan());

  it(`cakupan ${kasusCakupan.jumlahHari} tanggal dengan kategori efektifnya`, () => {
    expect(hasil.cakupan).toHaveLength(kasusCakupan.jumlahHari);
    expect(
      hasil.cakupan.map(({ tanggal, kategoriEfektif }) => ({
        tanggal,
        hari: formatTanggal(tanggal).split(",")[0],
        kategoriEfektif,
      })),
    ).toEqual(kasusCakupan.tanggalCakupan);
  });

  it(`kebutuhan = ${kasusCakupan.kebutuhan}`, () => {
    expect(hasil.kebutuhan).toMatchObject({ tersedia: true, kebutuhan: kasusCakupan.kebutuhan });
  });

  it("rincian kebutuhan sesuai contoh PRD A6: (4 × 4) + (1 × 4) + (2 × 10) + (2 × 8)", () => {
    expect(hasil.kebutuhan).toEqual({
      tersedia: true,
      kebutuhan: 56,
      rincian: [
        { kategori: "Senin–Kamis", jumlahHari: 4, rataRata: 4, subtotal: 16 },
        { kategori: "Jumat", jumlahHari: 1, rataRata: 4, subtotal: 4 },
        { kategori: "Sabtu", jumlahHari: 2, rataRata: 10, subtotal: 20 },
        { kategori: "Minggu", jumlahHari: 2, rataRata: 8, subtotal: 16 },
      ],
    });
  });

  it("setiap tanggal cakupan membawa rata-rata kategorinya dan sumber kategori", () => {
    expect(hasil.cakupan[0]).toEqual({
      tanggal: "2026-06-06",
      kategoriEfektif: "Sabtu",
      sumberKategori: "dasar",
      rataRata: 10,
    });
  });

  it("persiapan 0 dan dua mingguan: H sampai H+13 (14 tanggal)", () => {
    const { cakupan } = hitungKebutuhanKirim(masukan({ persiapanHari: 0, panjangCakupan: 14 }));
    expect(cakupan).toHaveLength(14);
    expect(cakupan[0]?.tanggal).toBe("2026-06-08");
    expect(cakupan[13]?.tanggal).toBe("2026-06-21");
  });

  it("panjang cakupan bilangan bulat 1–30 (PRD A6 ▶ Revisi 2026-10-12): L = 3 → H sampai H+2; 30 diterima", () => {
    const { cakupan } = hitungKebutuhanKirim(masukan({ persiapanHari: 0, panjangCakupan: 3 }));
    expect(cakupan.map(({ tanggal }) => tanggal)).toEqual(["2026-06-08", "2026-06-09", "2026-06-10"]);
    expect(hitungKebutuhanKirim(masukan({ persiapanHari: 0, panjangCakupan: 1 })).cakupan).toHaveLength(1);
    expect(hitungKebutuhanKirim(masukan({ persiapanHari: 0, panjangCakupan: 30 })).cakupan).toHaveLength(30);
  });

  it("panjang cakupan di luar 1–30 atau bukan bilangan bulat ditolak", () => {
    for (const panjangCakupan of [0, 31, 2.5, -7]) {
      expect(() => hitungKebutuhanKirim(masukan({ panjangCakupan }))).toThrow(
        `panjangCakupan harus bilangan bulat 1–30, diterima: ${panjangCakupan}`,
      );
    }
  });

  it("persiapan 1: H−1 sampai H+6 (8 tanggal)", () => {
    const { cakupan } = hitungKebutuhanKirim(masukan({ persiapanHari: 1 }));
    expect(cakupan.map(({ tanggal }) => tanggal)).toEqual([
      "2026-06-07",
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
    ]);
  });

  it("memakai kategori efektif dari perubahan kategori toko (T03)", () => {
    const daftarPerubahan: PerubahanKategori[] = [
      {
        id: "libur-1",
        tanggal: parseTanggalBisnis("2026-06-10"),
        cakupan: { jenis: "semua-toko" },
        kategoriBaru: "Minggu",
        revisi: 1,
        status: "aktif",
      },
    ];
    const hasilUbah = hitungKebutuhanKirim(masukan({ daftarPerubahan }));

    expect(hasilUbah.cakupan[4]).toEqual({
      tanggal: "2026-06-10",
      kategoriEfektif: "Minggu",
      sumberKategori: "libur-1",
      rataRata: 8,
    });
    // Rabu pindah dari Senin–Kamis (4) ke Minggu (8): 56 − 4 + 8.
    expect(hasilUbah.kebutuhan).toMatchObject({ tersedia: true, kebutuhan: 60 });
  });
});

describe("cakupanPengiriman (golden jumlah-kirim kasusCakupan)", () => {
  it("tanggal H−p sampai H+L−1 beserta kategori efektif dan sumbernya, tanpa rata-rata", () => {
    const { tanggalKirim, persiapanHari, panjangCakupan } = masukan();
    const cakupan = cakupanPengiriman({ tanggalKirim, persiapanHari, panjangCakupan, toko: "PMS", daftarPerubahan: [] });
    expect(cakupan).toEqual(
      kasusCakupan.tanggalCakupan.map(({ tanggal, kategoriEfektif }) => ({ tanggal, kategoriEfektif, sumberKategori: "dasar" })),
    );
  });

  it("sumber kategori = id perubahan kategori yang dipakai", () => {
    const daftarPerubahan: PerubahanKategori[] = [
      { id: "7", tanggal: parseTanggalBisnis("2026-06-12"), cakupan: { jenis: "toko", toko: "PMS" }, kategoriBaru: "Sabtu", revisi: 1, status: "aktif" },
    ];
    const cakupan = cakupanPengiriman({ ...masukan(), daftarPerubahan });
    expect(cakupan[6]).toEqual({ tanggal: "2026-06-12", kategoriEfektif: "Sabtu", sumberKategori: "7" });
  });
});

describe("hitungKebutuhanKirim — jumlah kirim", () => {
  it("contoh pemilik end-to-end: kebutuhan 56, stok 20, buffer 20 → 48 (PRD A6 ▶ Revisi 2026-10-14: 56 × 120% − 20)", () => {
    expect(hitungKebutuhanKirim(masukan({ stokAkhir: 20, persenBuffer: 20 }))).toMatchObject({
      status: "siap",
      persenBuffer: 20,
      jumlahKirim: 48,
    });
  });

  it.each(fixture.kasusJumlahKirim.filter(({ kebutuhan }) => kebutuhan === kasusCakupan.kebutuhan))(
    "kebutuhan $kebutuhan, stok $stokAkhir, buffer $persenBuffer → $jumlahKirim",
    ({ stokAkhir, persenBuffer, jumlahKirim }) => {
      expect(hitungKebutuhanKirim(masukan({ stokAkhir, persenBuffer }))).toMatchObject({
        status: "siap",
        jumlahKirim,
      });
    },
  );
});

describe("hitungKebutuhanKirim — status (golden jumlah-kirim kasusStatus)", () => {
  it.each(fixture.kasusStatus)("$status: $catatan", (kasus) => {
    const produk = kasus.klasifikasi === "manual" ? PRODUK_MANUAL : PRODUK_OTOMATIS;
    const stokAkhir = kasus.stokAkhir === undefined ? 20 : kasus.stokAkhir;
    const hasil = hitungKebutuhanKirim(masukan({ produk, stokAkhir }));

    if (kasus.status === "manual") {
      expect(hasil.status).toBe("manual");
      expect(hasil).not.toHaveProperty("jumlahKirim");
      expect(hasil).not.toHaveProperty("persenBuffer");
    } else {
      expect(hasil).toMatchObject({ status: "tertahan", masalah: [kasus.status] });
      expect(hasil).not.toHaveProperty("jumlahKirim");
    }
  });
});

describe("hitungKebutuhanKirim — keputusan pemilik T05 (PRD A6)", () => {
  it.each([null, -3, 0, 7])("produk manual selalu berstatus manual, stok %s tetap dibawa", (stokAkhir) => {
    const hasil = hitungKebutuhanKirim(masukan({ produk: PRODUK_MANUAL, stokAkhir }));
    expect(hasil).toMatchObject({ status: "manual", klasifikasi: "manual", stokAkhir });
  });

  it("produk manual tanpa rata-rata tetap manual", () => {
    const hasil = hitungKebutuhanKirim(masukan({ produk: PRODUK_MANUAL, rataRata: {} }));
    expect(hasil.status).toBe("manual");
  });

  it("masalah stok saja: kebutuhan dan rinciannya tetap tersedia, tanpa jumlah kirim", () => {
    const hasil = hitungKebutuhanKirim(masukan({ stokAkhir: -3 }));
    expect(hasil).toMatchObject({
      status: "tertahan",
      masalah: ["stok-negatif"],
      stokAkhir: -3,
      kebutuhan: { tersedia: true, kebutuhan: 56 },
    });
    expect(hasil).not.toHaveProperty("jumlahKirim");
  });

  it("kebutuhan tidak tersedia: menyebut tanggal dan kategori tanpa rata-rata", () => {
    const hasil = hitungKebutuhanKirim(masukan({ rataRata: { "Senin–Kamis": 4, Jumat: 4, Minggu: 8 } }));
    expect(hasil).toMatchObject({ status: "tertahan", masalah: ["kebutuhan-tidak-tersedia"] });
    expect(hasil.kebutuhan).toEqual({
      tersedia: false,
      tanpaRataRata: [
        { tanggal: "2026-06-06", kategoriEfektif: "Sabtu" },
        { tanggal: "2026-06-13", kategoriEfektif: "Sabtu" },
      ],
    });
    expect(hasil.cakupan[0]?.rataRata).toBeNull();
  });

  it("semua masalah dikembalikan berurutan: kebutuhan-tidak-tersedia, stok-negatif", () => {
    const hasil = hitungKebutuhanKirim(masukan({ rataRata: {}, stokAkhir: -1 }));
    expect(hasil).toMatchObject({ status: "tertahan", masalah: ["kebutuhan-tidak-tersedia", "stok-negatif"] });
  });

  it("semua masalah dikembalikan berurutan: kebutuhan-tidak-tersedia, stok-belum-diisi", () => {
    const hasil = hitungKebutuhanKirim(masukan({ rataRata: { Sabtu: 10 }, stokAkhir: null }));
    expect(hasil).toMatchObject({ status: "tertahan", masalah: ["kebutuhan-tidak-tersedia", "stok-belum-diisi"] });
  });

  it("stok 0 adalah stok yang diketahui, bukan belum diisi", () => {
    expect(hitungKebutuhanKirim(masukan({ stokAkhir: 0, persenBuffer: 10 }))).toMatchObject({
      status: "siap",
      // ⌈56 × 1,10⌉ = ⌈61,6⌉ = 62
      jumlahKirim: 62,
    });
  });
});

// T59: status dan jumlah kirim dihitung ulang dari kebutuhan tersimpan setelah stok akhir diisi.
describe("statusKirim — dari kebutuhan, stok akhir, dan buffer", () => {
  it.each(fixture.kasusJumlahKirim)(
    "kebutuhan $kebutuhan, stok $stokAkhir, buffer $persenBuffer → $jumlahKirim",
    ({ kebutuhan, stokAkhir, persenBuffer, jumlahKirim }) => {
      expect(statusKirim({ klasifikasi: "otomatis", kebutuhan, stokAkhir, persenBuffer })).toEqual({
        status: "siap",
        persenBuffer,
        jumlahKirim,
      });
    },
  );

  it.each(fixture.kasusStatus)("$status: $catatan", (kasus) => {
    const hasil = statusKirim({
      klasifikasi: kasus.klasifikasi ?? "otomatis",
      kebutuhan: kasusCakupan.kebutuhan,
      stokAkhir: kasus.stokAkhir === undefined ? 20 : kasus.stokAkhir,
      persenBuffer: 20,
    });
    expect(hasil).toEqual(kasus.status === "manual" ? { status: "manual" } : { status: "tertahan", masalah: [kasus.status] });
  });

  it("kebutuhan tidak tersedia dan stok belum diisi dikembalikan berurutan", () => {
    expect(statusKirim({ klasifikasi: "otomatis", kebutuhan: null, stokAkhir: null, persenBuffer: 20 })).toEqual({
      status: "tertahan",
      masalah: ["kebutuhan-tidak-tersedia", "stok-belum-diisi"],
    });
  });

  it("stok 0 adalah stok yang diketahui, bukan belum diisi", () => {
    expect(statusKirim({ klasifikasi: "otomatis", kebutuhan: kasusCakupan.kebutuhan, stokAkhir: 0, persenBuffer: 10 })).toMatchObject({
      status: "siap",
      // ⌈56 × 1,10⌉ = ⌈61,6⌉ = 62
      jumlahKirim: 62,
    });
  });
});
