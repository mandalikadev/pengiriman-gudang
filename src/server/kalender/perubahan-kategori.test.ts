import { and, asc, eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import golden from "../../../tests/golden/kategori-efektif.json";

import { parseTanggalBisnis, type KategoriDasar, type TanggalBisnis } from "@/domain/kalender";
import { kategoriEfektif } from "@/domain/kategori";
import { buatPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { cacheNilaiMingguan, perubahanKategori, revisiKalender, versiCacheLaporan } from "@/server/db/schema";
import { buatTokoUji } from "@/server/gudang/uji-bantu";
import { aktifkanImpor } from "@/server/impor/impor";
import { pastikanBucket } from "@/server/impor/penyimpanan";
import { buatWorkbookUji, imporUji, kodeProdukUji, sheetPenjualanUji } from "@/server/impor/uji-bantu";
import {
  bacaPerubahanKategori,
  hitungUlangCacheLaporan,
  idVersiCacheAktif,
  muatStatusCacheLaporan,
} from "@/server/laporan/cache";
import { aktifkanSnapshotLibur, muatTinjauSnapshotLibur } from "@/server/libur/aktivasi";
import { sinkronkanLibur } from "@/server/libur/sinkronisasi";
import { gantiApiHariLibur, tahunLiburUji } from "@/server/libur/uji-bantu";

import {
  batalkanPerubahanKategori,
  buatPerubahanKategori,
  muatPerubahanKategoriTanggal,
  revisiPerubahanKategori,
} from "./perubahan-kategori";

let idAdmin: string;

beforeAll(async () => {
  idAdmin = (await buatPenggunaUji("admin")).id;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Tanggal golden digeser 400 tahun (146.097 hari = 20.871 pekan), sehingga hari dalam pekan sama. Perubahan
 * seluruh toko di test ini tidak mengenai data Juni 2026 milik berkas test lain.
 */
const geser400Tahun = (tanggal: string) => parseTanggalBisnis(`${Number(tanggal.slice(0, 4)) + 400}${tanggal.slice(4)}`);

async function revisiKalenderSaatIni() {
  const [baris] = await db.select({ revisi: revisiKalender.revisi }).from(revisiKalender).where(eq(revisiKalender.id, 1));
  return baris?.revisi ?? 0;
}

async function jumlahJobCache() {
  const [baris] = await db.execute<{ jumlah: number }>(
    sql`select count(*)::int as jumlah from pgboss.job where name = 'hitung-cache-laporan'`,
  );
  return baris.jumlah;
}

async function barisCakupan(tanggal: TanggalBisnis, idToko: number) {
  return db
    .select()
    .from(perubahanKategori)
    .where(and(eq(perubahanKategori.tanggal, tanggal), eq(perubahanKategori.tokoId, idToko)))
    .orderBy(asc(perubahanKategori.revisi));
}

describe("golden kategori-efektif lewat perubahan yang disimpan di database", () => {
  it("urutan khusus toko → seluruh toko → dasar, revisi aktif terbaru, dan pembatalan diabaikan", async () => {
    const idToko: Record<string, number> = { PMS: (await buatTokoUji()).id, PMJ: (await buatTokoUji()).id };
    const idBaris = new Map<string, string>();

    for (const p of golden.perubahan) {
      const isian = {
        tanggal: geser400Tahun(p.tanggal),
        idToko: p.cakupan.jenis === "toko" ? idToko[p.cakupan.toko!] : null,
        kategoriBaru: p.kategoriBaru as KategoriDasar,
        alasan: `Golden ${p.id}`,
        idPengguna: idAdmin,
      };
      const simpan = p.revisi === 1 ? buatPerubahanKategori : revisiPerubahanKategori;
      expect(await simpan(isian)).toEqual({ keadaan: "berhasil" });
      const [baris] = await db
        .select({ id: perubahanKategori.id, revisi: perubahanKategori.revisi })
        .from(perubahanKategori)
        .where(eq(perubahanKategori.alasan, `Golden ${p.id}`));
      expect(baris.revisi).toBe(p.revisi);
      idBaris.set(p.id, String(baris.id));
      if (p.status === "dibatalkan") {
        expect(
          await batalkanPerubahanKategori({ tanggal: isian.tanggal, idToko: isian.idToko, alasan: "Golden batal", idPengguna: idAdmin }),
        ).toEqual({ keadaan: "berhasil" });
      }
    }

    const perubahan = await bacaPerubahanKategori();
    for (const kasus of golden.kasus) {
      expect(kategoriEfektif(geser400Tahun(kasus.tanggal), String(idToko[kasus.toko]), perubahan), kasus.catatan).toEqual({
        kategoriEfektif: kasus.kategoriEfektif,
        sumberKategori: kasus.sumberKategori === "dasar" ? "dasar" : idBaris.get(kasus.sumberKategori),
      });
    }
  });

  it("kategori sebelum = kategori yang berlaku untuk cakupan itu tepat sebelum perubahan dibuat", async () => {
    // 12 Juni 2426 = Jumat (hari sama dengan 12 Juni 2026): kategori dasar Jumat.
    const tanggal = parseTanggalBisnis("2426-06-12");
    const tokoA = (await buatTokoUji()).id;
    const tokoB = (await buatTokoUji()).id;
    const simpan = (idToko: number | null, kategoriBaru: KategoriDasar) => ({
      tanggal,
      idToko,
      kategoriBaru,
      alasan: "Uji kategori sebelum",
      idPengguna: idAdmin,
    });

    // Toko A tanpa perubahan apa pun: kategori dasar.
    expect(await buatPerubahanKategori(simpan(tokoA, "Sabtu"))).toEqual({ keadaan: "berhasil" });
    // Seluruh toko: hanya perubahan seluruh toko → dasar (perubahan toko A tidak dihitung).
    expect(await buatPerubahanKategori(simpan(null, "Minggu"))).toEqual({ keadaan: "berhasil" });
    // Toko B: perubahan toko B (tidak ada) → perubahan seluruh toko.
    expect(await buatPerubahanKategori(simpan(tokoB, "Senin–Kamis"))).toEqual({ keadaan: "berhasil" });
    // Revisi toko A: perubahan toko A itu sendiri.
    expect(await revisiPerubahanKategori(simpan(tokoA, "Minggu"))).toEqual({ keadaan: "berhasil" });

    expect((await barisCakupan(tanggal, tokoA)).map((b) => [b.revisi, b.kategoriSebelum, b.kategoriSesudah])).toEqual([
      [1, "Jumat", "Sabtu"],
      [2, "Sabtu", "Minggu"],
    ]);
    expect((await barisCakupan(tanggal, tokoB)).map((b) => [b.revisi, b.kategoriSebelum, b.kategoriSesudah])).toEqual([
      [1, "Minggu", "Senin–Kamis"],
    ]);
    const [seluruh] = await db
      .select()
      .from(perubahanKategori)
      .where(and(eq(perubahanKategori.tanggal, tanggal), sql`${perubahanKategori.tokoId} is null`));
    expect([seluruh.revisi, seluruh.kategoriSebelum, seluruh.kategoriSesudah]).toEqual([1, "Jumat", "Minggu"]);
  });
});

describe("buat, revisi, batal", () => {
  it("batal membatalkan seluruh revisi tanggal + cakupan itu dengan jejak; tanggal kembali ke level berikutnya", async () => {
    const tanggal = parseTanggalBisnis("2426-06-16");
    const toko = (await buatTokoUji()).id;
    const isian = { tanggal, idToko: toko, alasan: "Event toko", idPengguna: idAdmin };
    await buatPerubahanKategori({ ...isian, kategoriBaru: "Sabtu" });
    await revisiPerubahanKategori({ ...isian, kategoriBaru: "Jumat" });

    const pembatal = await buatPenggunaUji("admin");
    expect(
      await batalkanPerubahanKategori({ tanggal, idToko: toko, alasan: "  Event dibatalkan  ", idPengguna: pembatal.id }),
    ).toEqual({ keadaan: "berhasil" });

    const baris = await barisCakupan(tanggal, toko);
    expect(baris).toHaveLength(2);
    for (const b of baris) {
      expect(b).toMatchObject({
        status: "dibatalkan",
        dibatalkanOleh: pembatal.id,
        alasanPembatalan: "Event dibatalkan",
        dibuatOleh: idAdmin,
      });
      expect(b.dibatalkanPada).toBeInstanceOf(Date);
    }
    // Alasan dan kategori awal tetap tersimpan.
    expect(baris.map((b) => [b.alasan, b.kategoriSesudah])).toEqual([
      ["Event toko", "Sabtu"],
      ["Event toko", "Jumat"],
    ]);
    expect(kategoriEfektif(tanggal, String(toko), await bacaPerubahanKategori())).toEqual({
      kategoriEfektif: "Senin–Kamis",
      sumberKategori: "dasar",
    });
    expect(await muatPerubahanKategoriTanggal(tanggal)).toEqual([]);

    // Perubahan baru setelah dibatalkan melanjutkan nomor revisi; riwayat lama tetap ada.
    expect(await buatPerubahanKategori({ ...isian, kategoriBaru: "Minggu" })).toEqual({ keadaan: "berhasil" });
    expect((await barisCakupan(tanggal, toko)).map((b) => [b.revisi, b.status])).toEqual([
      [1, "dibatalkan"],
      [2, "dibatalkan"],
      [3, "aktif"],
    ]);
  });

  it("alasan wajib untuk buat, revisi, dan batal; gagal tidak menulis dan tidak menaikkan revisi kalender", async () => {
    const tanggal = parseTanggalBisnis("2426-06-17");
    const toko = (await buatTokoUji()).id;
    const isian = { tanggal, idToko: toko, kategoriBaru: "Minggu" as const, idPengguna: idAdmin };
    const revisiAwal = await revisiKalenderSaatIni();

    expect(await buatPerubahanKategori({ ...isian, alasan: "   " })).toEqual({ keadaan: "gagal", pesan: "Alasan wajib diisi." });
    expect(await barisCakupan(tanggal, toko)).toEqual([]);

    expect(await buatPerubahanKategori({ ...isian, alasan: "Ada event" })).toEqual({ keadaan: "berhasil" });
    expect(await revisiPerubahanKategori({ ...isian, alasan: "" })).toEqual({ keadaan: "gagal", pesan: "Alasan wajib diisi." });
    expect(await batalkanPerubahanKategori({ tanggal, idToko: toko, alasan: " ", idPengguna: idAdmin })).toEqual({
      keadaan: "gagal",
      pesan: "Alasan pembatalan wajib diisi.",
    });
    expect((await barisCakupan(tanggal, toko)).map((b) => [b.revisi, b.status])).toEqual([[1, "aktif"]]);
    expect(await revisiKalenderSaatIni()).toBe(revisiAwal + 1);
  });

  it("buat ditolak bila cakupan sudah punya perubahan aktif; revisi dan batal ditolak bila belum ada", async () => {
    const tanggal = parseTanggalBisnis("2426-06-18");
    const toko = (await buatTokoUji()).id;
    const isian = { tanggal, idToko: toko, kategoriBaru: "Minggu" as const, alasan: "Uji", idPengguna: idAdmin };

    expect(await revisiPerubahanKategori(isian)).toMatchObject({ keadaan: "gagal" });
    expect(await batalkanPerubahanKategori(isian)).toMatchObject({ keadaan: "gagal" });
    expect(await buatPerubahanKategori(isian)).toEqual({ keadaan: "berhasil" });
    expect(await buatPerubahanKategori(isian)).toMatchObject({ keadaan: "gagal" });
    expect(await buatPerubahanKategori({ ...isian, idToko: -1 })).toEqual({ keadaan: "gagal", pesan: "Toko tidak ditemukan." });
    expect(await barisCakupan(tanggal, toko)).toHaveLength(1);
  });

  it("setiap buat, revisi, dan batal menaikkan revisi kalender dan mengirim job hitung ulang", async () => {
    const tanggal = parseTanggalBisnis("2426-06-19");
    const isian = { tanggal, idToko: null, kategoriBaru: "Sabtu" as const, alasan: "Uji revisi kalender", idPengguna: idAdmin };
    const revisiAwal = await revisiKalenderSaatIni();
    const jobAwal = await jumlahJobCache();

    await buatPerubahanKategori(isian);
    expect(await revisiKalenderSaatIni()).toBe(revisiAwal + 1);
    await revisiPerubahanKategori({ ...isian, kategoriBaru: "Minggu" });
    expect(await revisiKalenderSaatIni()).toBe(revisiAwal + 2);
    await batalkanPerubahanKategori(isian);
    expect(await revisiKalenderSaatIni()).toBe(revisiAwal + 3);
    expect(await jumlahJobCache()).toBe(jobAwal + 3);
  });

  it("muatPerubahanKategoriTanggal: revisi aktif terbaru per cakupan, seluruh toko dahulu", async () => {
    const tanggal = parseTanggalBisnis("2426-06-20");
    const toko = await buatTokoUji();
    const isian = { tanggal, alasan: "Tampil", idPengguna: idAdmin };
    await buatPerubahanKategori({ ...isian, idToko: toko.id, kategoriBaru: "Minggu" });
    await revisiPerubahanKategori({ ...isian, idToko: toko.id, kategoriBaru: "Jumat", alasan: "Tampil revisi" });
    await buatPerubahanKategori({ ...isian, idToko: null, kategoriBaru: "Minggu" });

    expect(
      (await muatPerubahanKategoriTanggal(tanggal)).map(({ idToko, namaToko, kategoriSebelum, kategoriSesudah, alasan, revisi }) => ({
        idToko,
        namaToko,
        kategoriSebelum,
        kategoriSesudah,
        alasan,
        revisi,
      })),
    ).toEqual([
      { idToko: null, namaToko: null, kategoriSebelum: "Sabtu", kategoriSesudah: "Minggu", alasan: "Tampil", revisi: 1 },
      { idToko: toko.id, namaToko: toko.nama, kategoriSebelum: "Minggu", kategoriSesudah: "Jumat", alasan: "Tampil revisi", revisi: 2 },
    ]);
  });
});

describe("sinkronisasi dan aktivasi libur tidak menimpa perubahan manual (PRD B4)", () => {
  it("perubahan kategori tetap sama setelah libur tanggal itu disinkronkan dan diaktifkan", async () => {
    const tahun = await tahunLiburUji();
    const tanggal = parseTanggalBisnis(`${tahun}-08-17`);
    const toko = (await buatTokoUji()).id;
    await buatPerubahanKategori({ tanggal, idToko: toko, kategoriBaru: "Jumat", alasan: "Manual", idPengguna: idAdmin });
    const sebelum = await barisCakupan(tanggal, toko);

    gantiApiHariLibur({ isi: { data: [{ date: tanggal, description: "Hari Kemerdekaan" }] } });
    const sinkron = await sinkronkanLibur(tahun, idAdmin);
    if (sinkron.keadaan !== "berhasil") throw new Error(sinkron.pesan);
    const tinjau = await muatTinjauSnapshotLibur(sinkron.idSnapshot);
    expect(await aktifkanSnapshotLibur(sinkron.idSnapshot, tinjau!.versi, idAdmin)).toEqual({ keadaan: "berhasil" });

    expect(await barisCakupan(tanggal, toko)).toEqual(sebelum);
    expect(kategoriEfektif(tanggal, String(toko), await bacaPerubahanKategori()).kategoriEfektif).toBe("Jumat");
  });
});

describe("cache laporan memakai kategori efektif (integrasi)", () => {
  it("Selasa 30 Juni 2026 → Jumat untuk toko A tetap di Juli Minggu 1 (PRD B6); toko B tidak terpengaruh; cache dihitung ulang", async () => {
    await pastikanBucket();
    const tokoA = await buatTokoUji();
    const tokoB = await buatTokoUji();
    const kode = kodeProdukUji();
    const produk = (kuantitas: number[]) => [
      { kode, nama: "15ML GLITTER - GORGEOUS", ukuran: "15ML", kategori: "15ML GLITTER/LEATHER", kuantitas },
    ];
    // Satu sheet JUNI (S) dengan dua blok toko berdampingan: blok A di kolom F–G, blok B mulai kolom H.
    const blokA = sheetPenjualanUji({ toko: tokoA.nama, bulan: 6, hari: [29, 30], produk: produk([1, 4]) });
    const blokB = sheetPenjualanUji({ toko: tokoB.nama, bulan: 6, hari: [29, 30], produk: produk([1, 4]) });
    const isi = buatWorkbookUji({ "JUNI (S)": blokA.map((baris, i) => [...baris, ...Array<null>(7 - baris.length).fill(null), ...blokB[i].slice(5)]) });
    const idImpor = await imporUji({ isi, tahunImpor: 2026, bulanImpor: 6, idPengguna: idAdmin });
    expect(await aktifkanImpor(idImpor, idAdmin)).toEqual({ keadaan: "berhasil" });

    const tanggal = parseTanggalBisnis("2026-06-30");
    expect(
      await buatPerubahanKategori({ tanggal, idToko: tokoA.id, kategoriBaru: "Jumat", alasan: "Event toko A", idPengguna: idAdmin }),
    ).toEqual({ keadaan: "berhasil" });
    expect(await muatStatusCacheLaporan()).toBe("perlu-dihitung-ulang");

    await hitungUlangCacheLaporan();
    expect(await muatStatusCacheLaporan()).toBe("terbaru");
    const versiId = (await idVersiCacheAktif())!;
    const [versi] = await db.select().from(versiCacheLaporan).where(eq(versiCacheLaporan.id, versiId));
    expect(versi.revisiKalender).toBe(await revisiKalenderSaatIni());

    const mingguan = async (idToko: number) =>
      (
        await db
          .select()
          .from(cacheNilaiMingguan)
          .where(and(eq(cacheNilaiMingguan.versiId, versiId), eq(cacheNilaiMingguan.tokoId, idToko), eq(cacheNilaiMingguan.kodeProduk, kode)))
          .orderBy(asc(cacheNilaiMingguan.kategori))
      ).map(({ bulanLaporan, mingguLaporan, kategori, tanggal: daftarTanggal, jumlahQty }) => ({
        bulanLaporan,
        mingguLaporan,
        kategori,
        tanggal: daftarTanggal,
        jumlahQty,
      }));

    expect(await mingguan(tokoA.id)).toEqual(
      expect.arrayContaining([
        { bulanLaporan: "2026-07", mingguLaporan: 1, kategori: "Senin–Kamis", tanggal: ["2026-06-29"], jumlahQty: 1 },
        { bulanLaporan: "2026-07", mingguLaporan: 1, kategori: "Jumat", tanggal: ["2026-06-30"], jumlahQty: 4 },
      ]),
    );
    expect(await mingguan(tokoA.id)).toHaveLength(2);
    expect(await mingguan(tokoB.id)).toEqual([
      { bulanLaporan: "2026-07", mingguLaporan: 1, kategori: "Senin–Kamis", tanggal: ["2026-06-29", "2026-06-30"], jumlahQty: 5 },
    ]);
  }, 30_000);
});
