import { beforeAll, describe, expect, it } from "vitest";

import { parseTanggalBisnis } from "@/domain/kalender";
import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { buatTokoUji } from "@/server/gudang/uji-bantu";
import { aktifkanImpor } from "@/server/impor/impor";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { buatWorkbookUji, imporUji, kodeProdukUji, sheetPenjualanUji } from "@/server/impor/uji-bantu";
import { buatPerubahanKategori } from "@/server/kalender/perubahan-kategori";
import { hitungUlangCacheLaporan, muatStatusCacheLaporan } from "@/server/laporan/cache";
import { nilaiRincian } from "@/server/laporan/rincian";
import { muatRingkasan } from "@/server/laporan/ringkasan";

// Rincian penelusuran (T37) harus selalu cocok dengan versi cache yang dibaca Ringkasan, juga setelah perubahan
// kategori (T42) dibuat tetapi cache belum dihitung ulang.

let tokoId = 0;
let kode = "";
let idAdmin = "";

beforeAll(async () => {
  await pastikanBucket();
  idAdmin = (await buatPenggunaUji("admin")).id;
  const toko = await buatTokoUji();
  tokoId = toko.id;
  kode = kodeProdukUji();
  const isi = buatWorkbookUji({
    "JUNI (S)": sheetPenjualanUji({
      toko: toko.nama,
      bulan: 6,
      hari: [29, 30],
      produk: [{ kode, nama: "15ML GLITTER - GORGEOUS", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER", kuantitas: [1, 4] }],
    }),
  });
  const idImpor = await imporUji({ isi, tahunImpor: 2026, bulanImpor: 6, idPengguna: idAdmin });
  expect(await aktifkanImpor(idImpor, idAdmin)).toEqual({ keadaan: "berhasil" });
  await hitungUlangCacheLaporan();
}, 30_000);

async function rincian(kategori: "Senin–Kamis" | "Jumat") {
  const hasil = await muatRingkasan({ bulanPilihan: ["2026-07"], halaman: 1, rincian: nilaiRincian(tokoId, kode, kategori) });
  if (hasil.keadaan !== "siap") throw new Error(`Ringkasan tidak siap: ${hasil.keadaan}`);
  return hasil.rincian;
}

function sumberTanggal(hasil: Awaited<ReturnType<typeof rincian>>) {
  if (hasil?.keadaan !== "siap") return null;
  return hasil.bulanan.flatMap((b) =>
    b.mingguan.flatMap((m) =>
      m.sumber.map((s) => ({ tanggal: s.tanggal, kategoriEfektif: s.kategoriEfektif, sumberKategori: s.sumberKategori, teramati: s.pengamatan !== null })),
    ),
  );
}

describe("rincian setelah perubahan kategori 30 Juni 2026 → Jumat (urut)", () => {
  it("sebelum hitung ulang: rincian tetap cocok dengan cache lama (30 Juni masih Senin–Kamis, sumber dasar)", async () => {
    expect(
      await buatPerubahanKategori({
        tanggal: parseTanggalBisnis("2026-06-30"),
        idToko: tokoId,
        kategoriBaru: "Jumat",
        alasan: "Event toko",
        idPengguna: idAdmin,
      }),
    ).toEqual({ keadaan: "berhasil" });
    expect(await muatStatusCacheLaporan()).toBe("perlu-dihitung-ulang");

    expect(sumberTanggal(await rincian("Senin–Kamis"))).toEqual([
      { tanggal: "2026-06-29", kategoriEfektif: "Senin–Kamis", sumberKategori: "dasar", teramati: true },
      { tanggal: "2026-06-30", kategoriEfektif: "Senin–Kamis", sumberKategori: "dasar", teramati: true },
      { tanggal: "2026-07-01", kategoriEfektif: "Senin–Kamis", sumberKategori: "dasar", teramati: false },
      { tanggal: "2026-07-02", kategoriEfektif: "Senin–Kamis", sumberKategori: "dasar", teramati: false },
    ]);
    expect(await rincian("Jumat")).toEqual({ keadaan: "tidak-ada" });
  });

  it("sesudah hitung ulang: 30 Juni di kelompok Jumat Juli Minggu 1 dengan sumber perubahan", async () => {
    await hitungUlangCacheLaporan();
    expect(await muatStatusCacheLaporan()).toBe("terbaru");

    expect(sumberTanggal(await rincian("Senin–Kamis"))).toEqual([
      { tanggal: "2026-06-29", kategoriEfektif: "Senin–Kamis", sumberKategori: "dasar", teramati: true },
      { tanggal: "2026-07-01", kategoriEfektif: "Senin–Kamis", sumberKategori: "dasar", teramati: false },
      { tanggal: "2026-07-02", kategoriEfektif: "Senin–Kamis", sumberKategori: "dasar", teramati: false },
    ]);
    const jumat = await rincian("Jumat");
    expect(sumberTanggal(jumat)).toEqual([
      { tanggal: "2026-06-30", kategoriEfektif: "Jumat", sumberKategori: "perubahan", teramati: true },
      // Jumat 3 Juli (kategori dasar) satu kelompok, tetapi tidak ada di data.
      { tanggal: "2026-07-03", kategoriEfektif: "Jumat", sumberKategori: "dasar", teramati: false },
    ]);
    expect(jumat).toMatchObject({ bulanan: [{ bulanLaporan: "2026-07", mingguan: [{ mingguLaporan: 1, jumlahQty: 4 }] }] });
  }, 30_000);
});
