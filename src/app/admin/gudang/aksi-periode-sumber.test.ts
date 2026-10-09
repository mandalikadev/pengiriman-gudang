import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AksesDitolakError } from "@/server/auth/kewenangan";
import { buatPenggunaUji, kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { periodeSumberGudang } from "@/server/db/schema";
import { daftarHakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { bacaPeriodeSumber, tetapkanPeriodeSumber } from "@/server/gudang/periode-sumber";
import { idGudangUji } from "@/server/gudang/uji-bantu";
import { siapkanBulanTersediaUji } from "@/server/laporan/uji-bantu";

const kepala = vi.hoisted(() => ({ cookie: "", muatUlangGagal: false, dimuatUlang: [] as string[] }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(kepala.cookie ? { cookie: kepala.cookie } : {}),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => {
    if (kepala.muatUlangGagal) throw new Error("gagal memuat ulang");
    kepala.dimuatUlang.push(path);
  },
}));

import { tetapkanPeriodeSumberGudang } from "./aksi";

let bali: number;
let bandung: number;
/** Bulan laporan yang tersedia di data: Januari, Maret, Mei, Juni (tahun uji). */
let [januari, maret, mei, juni] = ["", "", "", ""];

beforeAll(async () => {
  bali = await idGudangUji("Gudang Bali");
  bandung = await idGudangUji("Gudang Bandung");
  const admin = await buatPenggunaUji("admin");
  [januari, maret, mei, juni] = await siapkanBulanTersediaUji(admin.id, [1, 3, 5, 6]);
}, 60_000);

beforeEach(() => {
  kepala.cookie = "";
  kepala.muatUlangGagal = false;
  kepala.dimuatUlang = [];
});

const riwayat = (idGudang: number) =>
  db.select().from(periodeSumberGudang).where(eq(periodeSumberGudang.gudangId, idGudang)).orderBy(periodeSumberGudang.id);

describe("operator dan viewer ditolak di server", () => {
  it("operator dengan semua hak tindakan di gudang itu tidak bisa mengubah periode sumber", async () => {
    const admin = await buatPenggunaUji("admin");
    await tetapkanPeriodeSumber({ idGudang: bali, bulan: [maret], idPengguna: admin.id });
    const sebelum = await bacaPeriodeSumber(bali);

    const operator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: operator.id, idGudang: bali, hakTindakan: [...daftarHakTindakan] });
    kepala.cookie = operator.cookie;

    await expect(tetapkanPeriodeSumberGudang({ idGudang: bali, bulan: [januari, juni] })).rejects.toBeInstanceOf(
      AksesDitolakError,
    );
    expect(await bacaPeriodeSumber(bali)).toEqual(sebelum);
  });

  it("pengguna yang belum masuk diarahkan ke halaman masuk tanpa menulis data", async () => {
    const sebelum = (await riwayat(bandung)).length;
    await expect(tetapkanPeriodeSumberGudang({ idGudang: bandung, bulan: [januari] })).rejects.toMatchObject({
      digest: expect.stringContaining("/masuk"),
    });
    expect(await riwayat(bandung)).toHaveLength(sebelum);
  });
});

describe("admin menetapkan periode sumber", () => {
  let idAdmin: string;

  beforeEach(async () => {
    const admin = await kepalaPenggunaUji("admin");
    idAdmin = admin.id;
    kepala.cookie = admin.cookie;
  });

  it("menyimpan bulan tidak berurutan (urut naik), siapa, dan kapan; riwayat lama tetap dan versi berubah", async () => {
    await expect(tetapkanPeriodeSumberGudang({ idGudang: bandung, bulan: [mei, januari] })).resolves.toEqual({
      keadaan: "berhasil",
    });
    const pertama = await bacaPeriodeSumber(bandung);
    expect(pertama).toMatchObject({ bulan: [januari, mei], ditetapkanOleh: "Uji admin" });
    expect(pertama?.ditetapkanPada).toBeInstanceOf(Date);
    expect(kepala.dimuatUlang).toEqual(["/admin/gudang", `/pengiriman-gudang/${bandung}`]);

    await tetapkanPeriodeSumberGudang({ idGudang: bandung, bulan: [juni, maret, januari] });
    const kedua = await bacaPeriodeSumber(bandung);
    expect(kedua?.bulan).toEqual([januari, maret, juni]);
    expect(kedua?.versi).not.toBe(pertama?.versi);

    const semua = await riwayat(bandung);
    expect(semua.slice(-2).map((r) => ({ bulan: r.bulan, oleh: r.ditetapkanOleh }))).toEqual([
      { bulan: [januari, mei], oleh: idAdmin },
      { bulan: [januari, maret, juni], oleh: idAdmin },
    ]);
  });

  it("menyimpan bulan yang sama dengan periode berlaku tidak membuat penetapan baru (versi tetap)", async () => {
    await tetapkanPeriodeSumberGudang({ idGudang: bali, bulan: [januari, juni] });
    const sebelum = await bacaPeriodeSumber(bali);
    const jumlah = (await riwayat(bali)).length;

    await expect(tetapkanPeriodeSumberGudang({ idGudang: bali, bulan: [juni, januari] })).resolves.toEqual({
      keadaan: "berhasil",
    });
    expect(await bacaPeriodeSumber(bali)).toEqual(sebelum);
    expect(await riwayat(bali)).toHaveLength(jumlah);
  });

  it("periode satu gudang tidak mengubah periode gudang lain", async () => {
    await tetapkanPeriodeSumberGudang({ idGudang: bali, bulan: [maret] });
    const baliSebelum = await bacaPeriodeSumber(bali);
    await tetapkanPeriodeSumberGudang({ idGudang: bandung, bulan: [mei, juni] });
    expect(await bacaPeriodeSumber(bali)).toEqual(baliSebelum);
  });

  it("isian tidak valid → gagal dengan pesan, tanpa menulis data", async () => {
    const jumlah = (await riwayat(bali)).length;
    const tigaBelas = Array.from({ length: 13 }, (_, i) => `2999-${String((i % 12) + 1).padStart(2, "0")}`);
    const kasus: [unknown, string][] = [
      [{ idGudang: bali, bulan: [] }, "Pilih minimal satu bulan."],
      [{ idGudang: bali, bulan: tigaBelas }, "Pilih paling banyak 12 bulan."],
      [{ idGudang: bali, bulan: [maret, maret] }, "Bulan pilihan tidak boleh ganda."],
      [{ idGudang: bali, bulan: [maret, "1999-01"] }, "Ada bulan yang tidak tersedia di data. Muat ulang halaman, lalu pilih lagi."],
      [{ idGudang: -1, bulan: [maret] }, "Gudang tidak ditemukan."],
      [{ idGudang: "x", bulan: [maret] }, "Pilih gudang."],
    ];
    for (const [isian, pesan] of kasus) {
      await expect(tetapkanPeriodeSumberGudang(isian)).resolves.toEqual({ keadaan: "gagal", pesan });
    }
    expect(await riwayat(bali)).toHaveLength(jumlah);
  });

  it("tersimpan tetapi gagal memuat ulang tampilan", async () => {
    kepala.muatUlangGagal = true;
    await expect(tetapkanPeriodeSumberGudang({ idGudang: bali, bulan: [mei] })).resolves.toEqual({
      keadaan: "tersimpanGagalMuatUlang",
    });
    expect((await bacaPeriodeSumber(bali))?.bulan).toEqual([mei]);
  });
});
