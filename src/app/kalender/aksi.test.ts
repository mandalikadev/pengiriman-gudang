import { and, asc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { parseTanggalBisnis } from "@/domain/kalender";
import { AksesDitolakError } from "@/server/auth/kewenangan";
import { kepalaPenggunaUji } from "@/server/auth/uji-bantu";
import { db } from "@/server/db";
import { perubahanKategori, revisiKalender } from "@/server/db/schema";
import { daftarHakTindakan } from "@/server/gudang/hak-tindakan";
import { tugaskanOperator } from "@/server/gudang/penugasan";
import { buatTokoUji, idGudangUji } from "@/server/gudang/uji-bantu";
import { buatPerubahanKategori as buatLangsung } from "@/server/kalender/perubahan-kategori";

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

import { batalkanPerubahanKategori, buatPerubahanKategori, revisiPerubahanKategori } from "./aksi";

let cookieAdmin = "";
let idAdmin = "";

beforeAll(async () => {
  const admin = await kepalaPenggunaUji("admin");
  cookieAdmin = admin.cookie;
  idAdmin = admin.id;
});

beforeEach(() => {
  kepala.cookie = cookieAdmin;
  kepala.muatUlangGagal = false;
  kepala.dimuatUlang = [];
});

// Tahun 2427 (bukan data uji lain) agar perubahan di sini tidak mengenai cache laporan berkas test lain.
const TANGGAL = "2427-03-02";

async function barisToko(idToko: number) {
  return db
    .select()
    .from(perubahanKategori)
    .where(and(eq(perubahanKategori.tanggal, TANGGAL), eq(perubahanKategori.tokoId, idToko)))
    .orderBy(asc(perubahanKategori.revisi));
}

async function revisiKalenderSaatIni() {
  const [baris] = await db.select({ revisi: revisiKalender.revisi }).from(revisiKalender).where(eq(revisiKalender.id, 1));
  return baris?.revisi ?? 0;
}

describe("non-admin ditolak di server", () => {
  it("viewer dan operator dengan semua hak tindakan tidak bisa membuat, merevisi, atau membatalkan", async () => {
    const toko = await buatTokoUji();
    await buatLangsung({ tanggal: parseTanggalBisnis(TANGGAL), idToko: toko.id, kategoriBaru: "Minggu", alasan: "Awal", idPengguna: idAdmin });
    const sebelum = await barisToko(toko.id);
    const revisiAwal = await revisiKalenderSaatIni();

    const viewer = await kepalaPenggunaUji("viewer");
    const viewerOperator = await kepalaPenggunaUji("viewer");
    await tugaskanOperator({ idPengguna: viewerOperator.id, idGudang: await idGudangUji("Gudang Bali"), hakTindakan: [...daftarHakTindakan] });

    for (const cookie of [viewer.cookie, viewerOperator.cookie]) {
      kepala.cookie = cookie;
      const isian = { tanggal: TANGGAL, idToko: toko.id, kategoriBaru: "Jumat", alasan: "Coba" };
      await expect(buatPerubahanKategori({ ...isian, idToko: null })).rejects.toBeInstanceOf(AksesDitolakError);
      await expect(revisiPerubahanKategori(isian)).rejects.toBeInstanceOf(AksesDitolakError);
      await expect(batalkanPerubahanKategori(isian)).rejects.toBeInstanceOf(AksesDitolakError);
    }

    expect(await barisToko(toko.id)).toEqual(sebelum);
    expect(await revisiKalenderSaatIni()).toBe(revisiAwal);
    expect(kepala.dimuatUlang).toEqual([]);
  });

  it("pengguna belum masuk diarahkan ke halaman masuk", async () => {
    kepala.cookie = "";
    await expect(
      buatPerubahanKategori({ tanggal: TANGGAL, idToko: null, kategoriBaru: "Jumat", alasan: "Coba" }),
    ).rejects.toMatchObject({ digest: expect.stringContaining("/masuk") });
  });
});

describe("admin: buat, revisi, batal", () => {
  it("buat → revisi → batal tersimpan dengan pelaku; pembatalan menyimpan jejak; halaman Kalender dimuat ulang", async () => {
    const toko = await buatTokoUji();
    const cakupan = { tanggal: TANGGAL, idToko: toko.id };

    expect(await buatPerubahanKategori({ ...cakupan, kategoriBaru: "Sabtu", alasan: "Event" })).toEqual({ keadaan: "berhasil" });
    expect(await revisiPerubahanKategori({ ...cakupan, kategoriBaru: "Minggu", alasan: "Event diperpanjang" })).toEqual({
      keadaan: "berhasil",
    });
    expect(await batalkanPerubahanKategori({ ...cakupan, alasan: "Event batal" })).toEqual({ keadaan: "berhasil" });
    expect(kepala.dimuatUlang).toEqual(["/kalender", "/kalender", "/kalender"]);

    expect(
      (await barisToko(toko.id)).map((b) => ({
        revisi: b.revisi,
        kategoriSebelum: b.kategoriSebelum,
        kategoriSesudah: b.kategoriSesudah,
        alasan: b.alasan,
        dibuatOleh: b.dibuatOleh,
        status: b.status,
        dibatalkanOleh: b.dibatalkanOleh,
        alasanPembatalan: b.alasanPembatalan,
      })),
    ).toEqual([
      // 2 Maret 2427 = Selasa: kategori dasar Senin–Kamis.
      { revisi: 1, kategoriSebelum: "Senin–Kamis", kategoriSesudah: "Sabtu", alasan: "Event", dibuatOleh: idAdmin, status: "dibatalkan", dibatalkanOleh: idAdmin, alasanPembatalan: "Event batal" },
      { revisi: 2, kategoriSebelum: "Sabtu", kategoriSesudah: "Minggu", alasan: "Event diperpanjang", dibuatOleh: idAdmin, status: "dibatalkan", dibatalkanOleh: idAdmin, alasanPembatalan: "Event batal" },
    ]);
  });

  it("isian tidak valid ditolak dengan pesan; alasan wajib", async () => {
    const toko = await buatTokoUji();
    expect(await buatPerubahanKategori({ tanggal: "2427-02-30", idToko: toko.id, kategoriBaru: "Jumat", alasan: "x" })).toEqual({
      keadaan: "gagal",
      pesan: "Tanggal tidak valid.",
    });
    expect(await buatPerubahanKategori({ tanggal: TANGGAL, idToko: toko.id, kategoriBaru: "Libur", alasan: "x" })).toEqual({
      keadaan: "gagal",
      pesan: "Pilih kategori.",
    });
    expect(await buatPerubahanKategori({ tanggal: TANGGAL, idToko: toko.id, kategoriBaru: "Jumat", alasan: "  " })).toEqual({
      keadaan: "gagal",
      pesan: "Alasan wajib diisi.",
    });
    expect(await barisToko(toko.id)).toEqual([]);
    expect(kepala.dimuatUlang).toEqual([]);
  });

  it("tersimpan tetapi gagal memuat ulang tampilan → keadaan kelima", async () => {
    const toko = await buatTokoUji();
    kepala.muatUlangGagal = true;
    expect(await buatPerubahanKategori({ tanggal: TANGGAL, idToko: toko.id, kategoriBaru: "Jumat", alasan: "Event" })).toEqual({
      keadaan: "tersimpanGagalMuatUlang",
    });
    expect(await barisToko(toko.id)).toHaveLength(1);
  });
});
